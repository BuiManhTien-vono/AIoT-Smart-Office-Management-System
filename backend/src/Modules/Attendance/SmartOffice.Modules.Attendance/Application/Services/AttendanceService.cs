using Microsoft.EntityFrameworkCore;
using SmartOffice.Modules.Attendance.Application.DTOs;
using SmartOffice.Modules.Attendance.Domain;
using SmartOffice.Modules.Attendance.Infrastructure;
using SmartOffice.SharedKernel.Common;
using SmartOffice.SharedKernel.Contracts;
using SmartOffice.SharedKernel.Events;
using SmartOffice.SharedKernel.Storage;

namespace SmartOffice.Modules.Attendance.Application.Services;

/// <summary>
/// Dịch vụ xử lý nghiệp vụ của Module 2 (Attendance):
/// - Dùng IEmployeeLookupContract (Phương thức 2) để hỏi thông tin nhân viên từ Module Biometrics.
/// - Áp dụng bộ lọc chống trùng lặp 5 phút (Debounce 300s).
/// - Tính toán trạng thái Đúng giờ (ON_TIME), Đi muộn (LATE), Về sớm (EARLY_LEAVE) và Chốt vắng mặt cuối ngày (ABSENT).
/// - Tải và cấp Presigned URL (15 phút) cho ảnh chụp lúc chấm công (CheckinSnapshotKey) trên MinIO/S3.
/// - Phát sự kiện AttendanceCheckedIntegrationEvent & AttendanceAbsentMarkedIntegrationEvent qua InMemoryEventBus (Phương thức 1).
/// </summary>
public sealed class AttendanceService(
    AttendanceDbContext dbContext,
    IEmployeeLookupContract employeeLookup,
    IObjectStorageService objectStorage,
    IInMemoryEventBus eventBus) : IAttendanceService
{
    public const int DebounceWindowSeconds = 300; // 5 phút
    public const float MinMatchConfidence = 0.70f;
    public const int DefaultPresignedExpiryMinutes = 15;

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

        DateTimeOffset nowUtc;
        TimeOnly currentTimeOfDay;
        DateOnly workDate;

        if (request.TimestampUtc.HasValue)
        {
            var reqTime = request.TimestampUtc.Value;
            nowUtc = reqTime;
            currentTimeOfDay = TimeOnly.FromDateTime(reqTime.DateTime);
            workDate = DateOnly.FromDateTime(reqTime.DateTime);
        }
        else
        {
            // Runtime thực tế (Webcam / AI Gate Camera): Lấy theo múi giờ chuẩn Việt Nam (GMT+7)
            var nowVn = VietnamDateTime.Now;
            nowUtc = DateTimeOffset.UtcNow;
            currentTimeOfDay = TimeOnly.FromDateTime(nowVn.DateTime);
            workDate = DateOnly.FromDateTime(nowVn.DateTime);
        }

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

            return Result.Success(await MapAttendanceRecordResponseAsync(
                newLog,
                employee.FullName,
                isDebounced: false,
                message: isLate
                    ? $"Ghi nhận vào ca (Đi muộn {lateMinutes} phút)."
                    : "Ghi nhận vào ca đúng giờ.",
                ct));
        }

        // 5. Kiểm tra bộ lọc chống trùng lặp 5 phút (FR-ATT-03: Debounce 300 giây)
        if (existingLog.LastSeenTime.HasValue)
        {
            var elapsedSeconds = (nowUtc - existingLog.LastSeenTime.Value).TotalSeconds;
            if (elapsedSeconds >= 0 && elapsedSeconds < DebounceWindowSeconds)
            {
                return Result.Success(await MapAttendanceRecordResponseAsync(
                    existingLog,
                    employee.FullName,
                    isDebounced: true,
                    message: $"Bỏ qua quét trùng lặp trong cửa sổ 5 phút (cách lần trước {elapsedSeconds:F0} giây).",
                    ct));
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
            if (existingLog.Status == "EARLY_LEAVE")
            {
                existingLog.Status = existingLog.LateMinutes > 0 ? "LATE" : "ON_TIME";
            }
        }

        await dbContext.SaveChangesAsync(ct);

        return Result.Success(await MapAttendanceRecordResponseAsync(
            existingLog,
            employee.FullName,
            isDebounced: false,
            message: "Cập nhật giờ ra ca thành công.",
            ct));
    }

    public async Task<IReadOnlyList<AttendanceRecordResponse>> GetDailyAttendanceLogsAsync(
        DateOnly? workDate = null,
        CancellationToken ct = default)
    {
        var targetDate = workDate ?? VietnamDateTime.Today;
        var logs = await dbContext.AttendanceLogs
            .Where(x => x.WorkDate == targetDate)
            .OrderByDescending(x => x.CheckInTime)
            .ToListAsync(ct);

        var responses = new List<AttendanceRecordResponse>(logs.Count);
        foreach (var log in logs)
        {
            var emp = await employeeLookup.GetByIdAsync(log.EmployeeId, ct);
            responses.Add(await MapAttendanceRecordResponseAsync(
                log,
                emp?.FullName ?? log.EmployeeCode,
                isDebounced: false,
                message: string.Empty,
                ct));
        }

        return responses;
    }

    public async Task<Result<AttendanceSnapshotUploadResponse>> UploadAttendanceSnapshotAsync(
        Guid attendanceLogId,
        Stream fileStream,
        string contentType,
        CancellationToken ct = default)
    {
        var log = await dbContext.AttendanceLogs.FirstOrDefaultAsync(x => x.Id == attendanceLogId, ct);
        if (log is null)
        {
            return Result.Failure<AttendanceSnapshotUploadResponse>(
                new Error("ATTENDANCE_LOG_NOT_FOUND", "Không tìm thấy bản ghi chấm công để đính kèm ảnh chụp."));
        }

        var objectKey = $"attendance_snapshots/{log.WorkDate:yyyy-MM-dd}/{log.EmployeeCode.ToLowerInvariant()}_{log.Id:N}.jpg";
        var savedKey = await objectStorage.UploadFileAsync(objectKey, fileStream, contentType, ct);

        log.CheckinSnapshotKey = savedKey;
        await dbContext.SaveChangesAsync(ct);

        var presignedUrl = await objectStorage.GetPresignedUrlAsync(savedKey, DefaultPresignedExpiryMinutes, ct);

        return Result.Success(new AttendanceSnapshotUploadResponse(
            log.Id,
            log.EmployeeCode,
            savedKey,
            presignedUrl,
            DefaultPresignedExpiryMinutes));
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

    /// <summary>
    /// Tiến trình tự động chốt vắng mặt cuối ngày (FR-ATT-06 / US-ATT-03):
    /// Đối chiếu toàn bộ nhân sự đang hoạt động với danh sách đã check-in và đơn nghỉ phép APPROVED.
    /// </summary>
    public async Task<Result<DailyAbsentProcessResponse>> MarkDailyAbsentEmployeesAsync(
        DateOnly? workDate = null,
        CancellationToken ct = default)
    {
        var targetDate = workDate ?? VietnamDateTime.Today;
        var defaultShift = await dbContext.Shifts
            .OrderByDescending(s => s.IsDefault)
            .FirstOrDefaultAsync(ct);

        if (defaultShift is null)
        {
            return Result.Failure<DailyAbsentProcessResponse>(
                new Error("SHIFT_NOT_CONFIGURED", "Hệ thống chưa cấu hình ca làm việc để chốt vắng mặt."));
        }

        var activeEmployees = await employeeLookup.GetAllActiveAsync(ct);
        var existingLogEmpIds = (await dbContext.AttendanceLogs
            .Where(x => x.WorkDate == targetDate)
            .Select(x => x.EmployeeId)
            .ToListAsync(ct)).ToHashSet();

        var approvedLeaveEmpIds = (await dbContext.LeaveRequests
            .Where(l => l.ApprovalStatus == "APPROVED" &&
                        l.StartDate <= targetDate &&
                        l.EndDate >= targetDate)
            .Select(l => l.EmployeeId)
            .ToListAsync(ct)).ToHashSet();

        var absentCodes = new List<string>();
        var pendingAbsentEvents = new List<AttendanceAbsentMarkedIntegrationEvent>();
        int onLeaveCount = 0;

        foreach (var emp in activeEmployees)
        {
            if (existingLogEmpIds.Contains(emp.EmployeeId))
            {
                continue;
            }

            if (approvedLeaveEmpIds.Contains(emp.EmployeeId))
            {
                onLeaveCount++;
                continue;
            }

            var absentLog = new AttendanceLog
            {
                EmployeeId = emp.EmployeeId,
                EmployeeCode = emp.EmployeeCode,
                ShiftId = emp.DefaultShiftId ?? defaultShift.Id,
                WorkDate = targetDate,
                Status = "ABSENT",
                LateMinutes = 0,
                EarlyLeaveMinutes = 0,
                MatchConfidence = 0f
            };

            dbContext.AttendanceLogs.Add(absentLog);
            absentCodes.Add(emp.EmployeeCode);

            pendingAbsentEvents.Add(new AttendanceAbsentMarkedIntegrationEvent(
                Guid.NewGuid(),
                DateTimeOffset.UtcNow,
                absentLog.Id,
                emp.EmployeeId,
                emp.EmployeeCode,
                emp.DepartmentId,
                targetDate));
        }

        if (pendingAbsentEvents.Count > 0)
        {
            await dbContext.SaveChangesAsync(ct);

            foreach (var evt in pendingAbsentEvents)
            {
                await eventBus.PublishAsync(evt, ct);
            }
        }

        return Result.Success(new DailyAbsentProcessResponse(
            targetDate,
            activeEmployees.Count,
            existingLogEmpIds.Count,
            onLeaveCount,
            absentCodes.Count,
            absentCodes));
    }

    private async Task<AttendanceRecordResponse> MapAttendanceRecordResponseAsync(
        AttendanceLog log,
        string fullName,
        bool isDebounced,
        string message,
        CancellationToken ct)
    {
        string? snapshotPresignedUrl = null;
        if (!string.IsNullOrWhiteSpace(log.CheckinSnapshotKey))
        {
            snapshotPresignedUrl = await objectStorage.GetPresignedUrlAsync(
                log.CheckinSnapshotKey,
                DefaultPresignedExpiryMinutes,
                ct);
        }

        return new AttendanceRecordResponse(
            log.Id,
            log.EmployeeId,
            log.EmployeeCode,
            fullName,
            log.ShiftId,
            log.WorkDate,
            log.CheckInTime,
            log.CheckOutTime,
            log.Status,
            log.LateMinutes,
            log.EarlyLeaveMinutes,
            log.MatchConfidence,
            isDebounced,
            message,
            log.CheckinSnapshotKey,
            snapshotPresignedUrl);
    }
}
