using Microsoft.EntityFrameworkCore;
using SmartOffice.Modules.Attendance.Application.DTOs;
using SmartOffice.Modules.Attendance.Domain;
using SmartOffice.Modules.Attendance.Infrastructure;
using SmartOffice.SharedKernel.Common;
using SmartOffice.SharedKernel.Contracts;
using SmartOffice.SharedKernel.Events;

namespace SmartOffice.Modules.Attendance.Application.Services;

/// <summary>
/// Dịch vụ xử lý nghiệp vụ của Module 2 (Attendance):
/// - Dùng IEmployeeLookupContract (Phương thức 2) để hỏi thông tin nhân viên từ Module Biometrics.
/// - Áp dụng bộ lọc chống trùng lặp 5 phút (Debounce 300s).
/// - Tính toán trạng thái Đúng giờ (ON_TIME), Đi muộn (LATE), Về sớm (EARLY_LEAVE).
/// - Phát sự kiện AttendanceCheckedIntegrationEvent qua InMemoryEventBus (Phương thức 1).
/// </summary>
public sealed class AttendanceService(
    AttendanceDbContext dbContext,
    IEmployeeLookupContract employeeLookup,
    IInMemoryEventBus eventBus) : IAttendanceService
{
    public const int DebounceWindowSeconds = 300; // 5 phút
    public const float MinMatchConfidence = 0.70f;

    public async Task<Result<ShiftResponse>> CreateShiftAsync(
        CreateShiftRequest request,
        CancellationToken ct = default)
    {
        var code = request.ShiftCode.Trim().ToUpperInvariant();
        if (await dbContext.Shifts.AnyAsync(s => s.ShiftCode == code, ct))
        {
            return Result.Failure<ShiftResponse>(
                new Error("SHIFT_CODE_EXISTS", $"Mã ca làm việc '{code}' đã tồn tại."));
        }

        var shift = new Shift
        {
            ShiftCode = code,
            ShiftName = request.ShiftName.Trim(),
            StartTime = request.StartTime,
            EndTime = request.EndTime,
            GraceMinutes = request.GraceMinutes,
            LunchStart = request.LunchStart ?? new TimeOnly(12, 0),
            LunchEnd = request.LunchEnd ?? new TimeOnly(13, 30),
            IsDefault = request.IsDefault
        };

        dbContext.Shifts.Add(shift);
        await dbContext.SaveChangesAsync(ct);

        return Result.Success(new ShiftResponse(
            shift.Id,
            shift.ShiftCode,
            shift.ShiftName,
            shift.StartTime,
            shift.EndTime,
            shift.GraceMinutes,
            shift.LunchStart,
            shift.LunchEnd,
            shift.IsDefault));
    }

    public async Task<IReadOnlyList<ShiftResponse>> GetShiftsAsync(CancellationToken ct = default)
    {
        return await dbContext.Shifts
            .OrderBy(s => s.StartTime)
            .Select(s => new ShiftResponse(
                s.Id,
                s.ShiftCode,
                s.ShiftName,
                s.StartTime,
                s.EndTime,
                s.GraceMinutes,
                s.LunchStart,
                s.LunchEnd,
                s.IsDefault))
            .ToListAsync(ct);
    }

    public async Task<Result<AttendanceRecordResponse>> ProcessCheckInOutAsync(
        CheckAttendanceRequest request,
        CancellationToken ct = default)
    {
        // 1. Kiểm tra độ tin cậy nhận diện (FR-ATT-02: >= 0.70)
        if (request.MatchConfidence < MinMatchConfidence)
        {
            return Result.Failure<AttendanceRecordResponse>(
                new Error("LOW_CONFIDENCE", $"Độ tin cậy nhận diện ({request.MatchConfidence:P0}) thấp hơn ngưỡng cho phép (70%)."));
        }

        // 2. PHƯƠNG THỨC GIAO TIẾP 2 (Contract Interface):
        // Hỏi thông tin nhân viên qua IEmployeeLookupContract mà không cần biết BiometricsDbContext
        var employee = await employeeLookup.GetByIdAsync(request.EmployeeId, ct);
        if (employee is null || !employee.IsActive)
        {
            return Result.Failure<AttendanceRecordResponse>(
                new Error("EMPLOYEE_INACTIVE_OR_NOT_FOUND", "Nhân viên không tồn tại hoặc đã ngừng làm việc."));
        }

        // 3. Lấy ca làm việc của nhân viên (hoặc ca mặc định)
        Shift? shift = null;
        if (employee.DefaultShiftId.HasValue)
        {
            shift = await dbContext.Shifts.FirstOrDefaultAsync(s => s.Id == employee.DefaultShiftId.Value, ct);
        }

        shift ??= await dbContext.Shifts.OrderByDescending(s => s.IsDefault).FirstOrDefaultAsync(ct);
        if (shift is null)
        {
            return Result.Failure<AttendanceRecordResponse>(
                new Error("SHIFT_NOT_CONFIGURED", "Hệ thống chưa được cấu hình ca làm việc."));
        }

        var nowUtc = request.TimestampUtc ?? DateTimeOffset.UtcNow;
        var workDate = DateOnly.FromDateTime(nowUtc.DateTime);
        var currentTimeOfDay = TimeOnly.FromDateTime(nowUtc.DateTime);

        var existingLog = await dbContext.AttendanceLogs
            .FirstOrDefaultAsync(x => x.EmployeeId == employee.EmployeeId && x.WorkDate == workDate, ct);

        // 4. Trường hợp Lượt chấm công đầu tiên trong ngày (Check-in vào ca - FR-ATT-04)
        if (existingLog is null)
        {
            var latestAllowedTime = shift.StartTime.AddMinutes(shift.GraceMinutes);
            var isLate = currentTimeOfDay > latestAllowedTime;
            var lateMinutes = isLate
                ? (int)Math.Ceiling((currentTimeOfDay - shift.StartTime).TotalMinutes)
                : 0;
            var status = isLate ? "LATE" : "ON_TIME";

            var newLog = new AttendanceLog
            {
                EmployeeId = employee.EmployeeId,
                EmployeeCode = employee.EmployeeCode,
                ShiftId = shift.Id,
                GateCameraId = request.GateCameraId,
                WorkDate = workDate,
                CheckInTime = nowUtc,
                LastSeenTime = nowUtc,
                Status = status,
                LateMinutes = lateMinutes,
                EarlyLeaveMinutes = 0,
                MatchConfidence = request.MatchConfidence,
                CheckinSnapshotKey = request.SnapshotObjectKey
            };

            dbContext.AttendanceLogs.Add(newLog);
            await dbContext.SaveChangesAsync(ct);

            // PHƯƠNG THỨC GIAO TIẾP 1 (In-Memory Event Bus):
            // Phát sự kiện chấm công thành công để Module Reporting tự động cập nhật thống kê phòng ban
            await eventBus.PublishAsync(new AttendanceCheckedIntegrationEvent(
                Guid.NewGuid(),
                nowUtc,
                newLog.Id,
                employee.EmployeeId,
                employee.EmployeeCode,
                employee.DepartmentId,
                workDate,
                status,
                lateMinutes,
                IsFirstCheckInOfDay: true), ct);

            return Result.Success(new AttendanceRecordResponse(
                newLog.Id,
                newLog.EmployeeId,
                newLog.EmployeeCode,
                employee.FullName,
                newLog.ShiftId,
                newLog.WorkDate,
                newLog.CheckInTime,
                newLog.CheckOutTime,
                newLog.Status,
                newLog.LateMinutes,
                newLog.EarlyLeaveMinutes,
                newLog.MatchConfidence,
                IsDebounced: false,
                Message: isLate
                    ? $"Ghi nhận vào ca (Đi muộn {lateMinutes} phút)."
                    : "Ghi nhận vào ca đúng giờ."));
        }

        // 5. Kiểm tra bộ lọc chống trùng lặp 5 phút (FR-ATT-03: Debounce 300 giây)
        if (existingLog.LastSeenTime.HasValue)
        {
            var elapsedSeconds = (nowUtc - existingLog.LastSeenTime.Value).TotalSeconds;
            if (elapsedSeconds >= 0 && elapsedSeconds < DebounceWindowSeconds)
            {
                return Result.Success(new AttendanceRecordResponse(
                    existingLog.Id,
                    existingLog.EmployeeId,
                    existingLog.EmployeeCode,
                    employee.FullName,
                    existingLog.ShiftId,
                    existingLog.WorkDate,
                    existingLog.CheckInTime,
                    existingLog.CheckOutTime,
                    existingLog.Status,
                    existingLog.LateMinutes,
                    existingLog.EarlyLeaveMinutes,
                    existingLog.MatchConfidence,
                    IsDebounced: true,
                    Message: $"Bỏ qua quét trùng lặp trong cửa sổ 5 phút (cách lần trước {elapsedSeconds:F0} giây)."));
            }
        }

        // 6. Cập nhật Giờ ra về (Check-out cuối ngày - FR-ATT-05)
        existingLog.CheckOutTime = nowUtc;
        existingLog.LastSeenTime = nowUtc;

        if (currentTimeOfDay < shift.EndTime)
        {
            existingLog.EarlyLeaveMinutes = (int)Math.Ceiling((shift.EndTime - currentTimeOfDay).TotalMinutes);
            if (existingLog.Status == "ON_TIME")
            {
                existingLog.Status = "EARLY_LEAVE";
            }
        }
        else
        {
            existingLog.EarlyLeaveMinutes = 0;
        }

        await dbContext.SaveChangesAsync(ct);

        return Result.Success(new AttendanceRecordResponse(
            existingLog.Id,
            existingLog.EmployeeId,
            existingLog.EmployeeCode,
            employee.FullName,
            existingLog.ShiftId,
            existingLog.WorkDate,
            existingLog.CheckInTime,
            existingLog.CheckOutTime,
            existingLog.Status,
            existingLog.LateMinutes,
            existingLog.EarlyLeaveMinutes,
            existingLog.MatchConfidence,
            IsDebounced: false,
            Message: "Cập nhật giờ ra ca thành công."));
    }

    public async Task<IReadOnlyList<AttendanceRecordResponse>> GetDailyAttendanceLogsAsync(
        DateOnly? workDate = null,
        CancellationToken ct = default)
    {
        var targetDate = workDate ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var logs = await dbContext.AttendanceLogs
            .Where(x => x.WorkDate == targetDate)
            .OrderByDescending(x => x.CheckInTime)
            .ToListAsync(ct);

        return logs.Select(x => new AttendanceRecordResponse(
            x.Id,
            x.EmployeeId,
            x.EmployeeCode,
            x.EmployeeCode,
            x.ShiftId,
            x.WorkDate,
            x.CheckInTime,
            x.CheckOutTime,
            x.Status,
            x.LateMinutes,
            x.EarlyLeaveMinutes,
            x.MatchConfidence,
            false,
            string.Empty)).ToList();
    }

    public async Task<Result<LeaveRequestResponse>> CreateLeaveRequestAsync(
        CreateLeaveRequestDto request,
        CancellationToken ct = default)
    {
        if (request.EndDate < request.StartDate)
        {
            return Result.Failure<LeaveRequestResponse>(
                new Error("INVALID_DATE_RANGE", "Ngày kết thúc nghỉ phép không được nhỏ hơn ngày bắt đầu."));
        }

        var employee = await employeeLookup.GetByIdAsync(request.EmployeeId, ct);
        if (employee is null)
        {
            return Result.Failure<LeaveRequestResponse>(
                new Error("EMPLOYEE_NOT_FOUND", "Không tìm thấy hồ sơ nhân viên."));
        }

        var leave = new LeaveRequest
        {
            EmployeeId = request.EmployeeId,
            StartDate = request.StartDate,
            EndDate = request.EndDate,
            LeaveType = request.LeaveType,
            Reason = request.Reason,
            ApprovalStatus = "APPROVED"
        };

        dbContext.LeaveRequests.Add(leave);
        await dbContext.SaveChangesAsync(ct);

        return Result.Success(new LeaveRequestResponse(
            leave.Id,
            leave.EmployeeId,
            leave.StartDate,
            leave.EndDate,
            leave.LeaveType,
            leave.Reason,
            leave.ApprovalStatus,
            leave.CreatedAt));
    }

    public async Task<IReadOnlyList<LeaveRequestResponse>> GetLeaveRequestsAsync(
        DateOnly? date = null,
        CancellationToken ct = default)
    {
        var query = dbContext.LeaveRequests.AsQueryable();
        if (date.HasValue)
        {
            query = query.Where(l => l.StartDate <= date.Value && l.EndDate >= date.Value);
        }

        return await query
            .OrderByDescending(l => l.StartDate)
            .Select(l => new LeaveRequestResponse(
                l.Id,
                l.EmployeeId,
                l.StartDate,
                l.EndDate,
                l.LeaveType,
                l.Reason,
                l.ApprovalStatus,
                l.CreatedAt))
            .ToListAsync(ct);
    }
}
