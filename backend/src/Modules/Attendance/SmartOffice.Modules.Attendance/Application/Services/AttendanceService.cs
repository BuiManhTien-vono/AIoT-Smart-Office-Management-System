using Microsoft.EntityFrameworkCore;
using SmartOffice.Modules.Attendance.Application.DTOs;
using SmartOffice.Modules.Attendance.Domain;
using SmartOffice.Modules.Attendance.Infrastructure;
using SmartOffice.SharedKernel.Common;
using SmartOffice.SharedKernel.Contracts;
using SmartOffice.SharedKernel.Events;
using SmartOffice.SharedKernel.Security;
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
    IOvertimeLookupContract overtimeLookup,
    IObjectStorageService objectStorage,
    IInMemoryEventBus eventBus) : IAttendanceService, IWorkScheduleLookupContract, ILeaveLookupContract
{
    public const int DebounceWindowSeconds = 300; // 5 phút
    public const float MinMatchConfidence = 0.70f;
    public const int DefaultPresignedExpiryMinutes = 15;

    public static readonly HashSet<string> AllowedLeaveTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "ANNUAL_LEAVE",
        "SICK_LEAVE",
        "PERSONAL_LEAVE",
        "UNPAID_LEAVE",
        "OFFICIAL_DUTY",
        "SUDDENLY_ALLOWED_LEAVE"
    };

    public static readonly HashSet<string> AllowedAdjustmentRoles = new(StringComparer.OrdinalIgnoreCase)
    {
        "ADMIN",
        "HR",
        "DEPT_LEAD"
    };

    public static readonly HashSet<string> AllowedAttendanceStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "ON_TIME",
        "LATE",
        "EARLY_LEAVE",
        "ABSENT",
        "REVOKED"
    };

    public static readonly HashSet<string> AllowedCancelModes = new(StringComparer.OrdinalIgnoreCase)
    {
        "VOID_ERRONEOUS",
        "REVOKE_PENALTY"
    };

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

        var activeLeave = await FindActiveLeaveAtAsync(
            employee.EmployeeId,
            workDate,
            currentTimeOfDay,
            includeOfficialDuty: false,
            ct);

        if (activeLeave is not null)
        {
            return Result.Failure<AttendanceRecordResponse>(
                new Error("EMPLOYEE_ON_LEAVE", "Nhân viên đang trong thời gian nghỉ phép"));
        }

        var existingLog = await dbContext.AttendanceLogs
            .FirstOrDefaultAsync(x => x.EmployeeId == employee.EmployeeId && x.WorkDate == workDate, ct);

        if (existingLog is not null && string.Equals(existingLog.Status, "REVOKED", StringComparison.OrdinalIgnoreCase))
        {
            return Result.Failure<AttendanceRecordResponse>(
                new Error("ATTENDANCE_REVOKED", "Ngày công của nhân viên đã bị hủy/trừ công kỷ luật, không thể ghi đè tự động bằng camera."));
        }

        var (effectiveStartTime, effectiveEndTime) = await ResolveEffectiveShiftWindowAsync(
            employee.EmployeeId,
            workDate,
            shift,
            ct);

        // 4. Trường hợp Lượt chấm công đầu tiên trong ngày (Check-in vào ca - FR-ATT-04)
        if (existingLog is null)
        {
            var latestAllowedTime = effectiveStartTime.AddMinutes(shift.GraceMinutes);
            var isLate = currentTimeOfDay > latestAllowedTime;
            var lateMinutes = isLate
                ? (int)Math.Ceiling((currentTimeOfDay - effectiveStartTime).TotalMinutes)
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
                ct,
                employee.DepartmentId));
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
                    ct,
                    employee.DepartmentId));
            }
        }

        // 6. Cập nhật Giờ ra về (Check-out cuối ngày - FR-ATT-05)
        existingLog.CheckOutTime = nowUtc;
        existingLog.LastSeenTime = nowUtc;

        if (currentTimeOfDay < effectiveEndTime)
        {
            existingLog.EarlyLeaveMinutes = (int)Math.Ceiling((effectiveEndTime - currentTimeOfDay).TotalMinutes);
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

        // Phát sự kiện tích hợp khi nhân viên check-out ra ca để đồng bộ thời gian thực
        await eventBus.PublishAsync(new AttendanceCheckedIntegrationEvent(
            Guid.NewGuid(),
            nowUtc,
            existingLog.Id,
            employee.EmployeeId,
            employee.EmployeeCode,
            employee.DepartmentId,
            workDate,
            existingLog.Status,
            existingLog.LateMinutes,
            IsFirstCheckInOfDay: false), ct);

        return Result.Success(await MapAttendanceRecordResponseAsync(
            existingLog,
            employee.FullName,
            isDebounced: false,
            message: "Cập nhật giờ ra ca thành công.",
            ct,
            employee.DepartmentId));
    }

    public async Task<IReadOnlyList<AttendanceRecordResponse>> GetDailyAttendanceLogsAsync(
        DateOnly? workDate = null,
        DateOnly? fromDate = null,
        DateOnly? toDate = null,
        CancellationToken ct = default)
    {
        IQueryable<AttendanceLog> query = dbContext.AttendanceLogs;

        if (fromDate.HasValue || toDate.HasValue)
        {
            var start = fromDate ?? toDate!.Value;
            var end = toDate ?? fromDate!.Value;
            if (end < start)
            {
                (start, end) = (end, start);
            }

            query = query
                .Where(x => x.WorkDate >= start && x.WorkDate <= end)
                .OrderByDescending(x => x.WorkDate)
                .ThenByDescending(x => x.CheckInTime);
        }
        else
        {
            var targetDate = workDate ?? VietnamDateTime.Today;
            query = query
                .Where(x => x.WorkDate == targetDate)
                .OrderByDescending(x => x.CheckInTime);
        }

        var logs = await query.ToListAsync(ct);

        var employeeCache = new Dictionary<Guid, EmployeeContractDto?>();
        var responses = new List<AttendanceRecordResponse>(logs.Count);
        foreach (var log in logs)
        {
            if (!employeeCache.TryGetValue(log.EmployeeId, out var emp))
            {
                emp = await employeeLookup.GetByIdAsync(log.EmployeeId, ct);
                employeeCache[log.EmployeeId] = emp;
            }

            responses.Add(await MapAttendanceRecordResponseAsync(
                log,
                emp?.FullName ?? log.EmployeeCode,
                isDebounced: false,
                message: log.IsManuallyAdjusted && !string.IsNullOrWhiteSpace(log.AdjustmentReason)
                    ? log.AdjustmentReason
                    : string.Empty,
                ct,
                emp?.DepartmentId));
        }

        return responses;
    }

    public async Task<Result<AttendanceRecordResponse>> AdjustAttendanceLogAsync(
        Guid attendanceLogId,
        AdjustAttendanceRequest request,
        ActorContext actor,
        CancellationToken ct = default)
    {
        var log = await dbContext.AttendanceLogs.FirstOrDefaultAsync(x => x.Id == attendanceLogId, ct);
        if (log is null)
        {
            return Result.Failure<AttendanceRecordResponse>(
                new Error("ATTENDANCE_LOG_NOT_FOUND", "Không tìm thấy bản ghi chấm công cần điều chỉnh."));
        }

        var employee = await employeeLookup.GetByIdAsync(log.EmployeeId, ct);
        if (employee is null)
        {
            return Result.Failure<AttendanceRecordResponse>(
                new Error("EMPLOYEE_NOT_FOUND", "Không tìm thấy hồ sơ nhân viên tương ứng với bản ghi chấm công."));
        }

        var authError = ValidateAdjustmentAuthorization(actor, employee.DepartmentId, log.WorkDate);
        if (authError is not null)
        {
            return Result.Failure<AttendanceRecordResponse>(authError);
        }

        var trimmedReason = (request.Reason ?? string.Empty).Trim();
        if (trimmedReason.Length < 5)
        {
            return Result.Failure<AttendanceRecordResponse>(
                new Error("INVALID_REASON", "Vui lòng nhập lý do điều chỉnh công tối thiểu 5 ký tự."));
        }

        var shift = await ResolveShiftAsync(request.ShiftId ?? log.ShiftId, employee.DefaultShiftId, ct);
        if (shift is null)
        {
            return Result.Failure<AttendanceRecordResponse>(
                new Error("SHIFT_NOT_CONFIGURED", "Hệ thống chưa được cấu hình ca làm việc."));
        }

        var evaluated = await EvaluateAdjustedAttendanceAsync(
            employee.EmployeeId,
            log.WorkDate,
            shift,
            request.CheckInTime,
            request.CheckOutTime,
            request.IsStatusOverridden,
            request.OverrideStatus,
            request.OverrideLateMinutes,
            request.OverrideEarlyLeaveMinutes,
            ct);

        if (evaluated.IsFailure)
        {
            return Result.Failure<AttendanceRecordResponse>(evaluated.Error);
        }

        var eval = evaluated.Value;
        var previousStatus = log.Status;
        var previousCheckIn = log.CheckInTime;
        var previousCheckOut = log.CheckOutTime;
        var previousLateMinutes = log.LateMinutes;
        var previousEarlyLeaveMinutes = log.EarlyLeaveMinutes;
        var nowUtc = DateTimeOffset.UtcNow;

        log.ShiftId = shift.Id;
        log.CheckInTime = eval.CheckInTimeUtc;
        log.CheckOutTime = eval.CheckOutTimeUtc;
        log.LastSeenTime = eval.CheckOutTimeUtc ?? eval.CheckInTimeUtc;
        log.Status = eval.Status;
        log.LateMinutes = eval.LateMinutes;
        log.EarlyLeaveMinutes = eval.EarlyLeaveMinutes;
        log.IsManuallyAdjusted = true;
        log.AdjustmentReason = trimmedReason;
        log.AdjustedByUserId = actor.UserId;
        log.AdjustedByName = string.IsNullOrWhiteSpace(actor.FullName) ? actor.Username : actor.FullName;
        log.AdjustedAt = nowUtc;
        log.UpdatedAt = nowUtc;

        var actionType = string.Equals(eval.Status, "REVOKED", StringComparison.OrdinalIgnoreCase)
            ? "REVOKE_PENALTY"
            : "ADJUST";

        dbContext.AttendanceAdjustmentAudits.Add(new AttendanceAdjustmentAudit
        {
            AttendanceLogId = log.Id,
            EmployeeId = employee.EmployeeId,
            EmployeeCode = employee.EmployeeCode,
            EmployeeFullName = employee.FullName,
            DepartmentId = employee.DepartmentId,
            WorkDate = log.WorkDate,
            ActionType = actionType,
            PreviousStatus = previousStatus,
            NewStatus = log.Status,
            PreviousCheckInTime = previousCheckIn,
            NewCheckInTime = log.CheckInTime,
            PreviousCheckOutTime = previousCheckOut,
            NewCheckOutTime = log.CheckOutTime,
            PreviousLateMinutes = previousLateMinutes,
            NewLateMinutes = log.LateMinutes,
            PreviousEarlyLeaveMinutes = previousEarlyLeaveMinutes,
            NewEarlyLeaveMinutes = log.EarlyLeaveMinutes,
            PreviousSnapshotKey = log.CheckinSnapshotKey,
            IsStatusOverridden = request.IsStatusOverridden,
            Reason = trimmedReason,
            SourceScreen = NormalizeSourceScreen(request.SourceScreen),
            AdjustedByUserId = actor.UserId,
            AdjustedByUsername = actor.Username,
            AdjustedByName = log.AdjustedByName!,
            AdjustedByRole = actor.Role,
            CreatedAt = nowUtc
        });

        await dbContext.SaveChangesAsync(ct);

        await eventBus.PublishAsync(new AttendanceLogAdjustedIntegrationEvent(
            Guid.NewGuid(),
            nowUtc,
            log.Id,
            employee.EmployeeId,
            employee.EmployeeCode,
            employee.DepartmentId,
            employee.DepartmentCode,
            log.WorkDate,
            previousStatus,
            previousLateMinutes,
            log.Status,
            log.LateMinutes,
            actionType,
            trimmedReason), ct);

        return Result.Success(await MapAttendanceRecordResponseAsync(
            log,
            employee.FullName,
            isDebounced: false,
            message: trimmedReason,
            ct,
            employee.DepartmentId));
    }

    public async Task<Result<AttendanceRecordResponse>> CreateManualAttendanceLogAsync(
        ManualAttendanceRequest request,
        ActorContext actor,
        CancellationToken ct = default)
    {
        var employee = await employeeLookup.GetByIdAsync(request.EmployeeId, ct);
        if (employee is null)
        {
            return Result.Failure<AttendanceRecordResponse>(
                new Error("EMPLOYEE_NOT_FOUND", "Không tìm thấy hồ sơ nhân viên để bổ sung công."));
        }

        var authError = ValidateAdjustmentAuthorization(actor, employee.DepartmentId, request.WorkDate);
        if (authError is not null)
        {
            return Result.Failure<AttendanceRecordResponse>(authError);
        }

        var trimmedReason = (request.Reason ?? string.Empty).Trim();
        if (trimmedReason.Length < 5)
        {
            return Result.Failure<AttendanceRecordResponse>(
                new Error("INVALID_REASON", "Vui lòng nhập lý do bổ sung công tối thiểu 5 ký tự."));
        }

        var existingLog = await dbContext.AttendanceLogs
            .FirstOrDefaultAsync(x => x.EmployeeId == employee.EmployeeId && x.WorkDate == request.WorkDate, ct);
        if (existingLog is not null)
        {
            return Result.Failure<AttendanceRecordResponse>(
                new Error("ATTENDANCE_LOG_EXISTS", $"Nhân viên {employee.EmployeeCode} đã có bản ghi chấm công ngày {request.WorkDate:dd/MM/yyyy}. Vui lòng dùng chức năng chỉnh sửa bản ghi hiện có."));
        }

        var shift = await ResolveShiftAsync(request.ShiftId, employee.DefaultShiftId, ct);
        if (shift is null)
        {
            return Result.Failure<AttendanceRecordResponse>(
                new Error("SHIFT_NOT_CONFIGURED", "Hệ thống chưa được cấu hình ca làm việc."));
        }

        var evaluated = await EvaluateAdjustedAttendanceAsync(
            employee.EmployeeId,
            request.WorkDate,
            shift,
            request.CheckInTime,
            request.CheckOutTime,
            request.IsStatusOverridden,
            request.OverrideStatus,
            request.OverrideLateMinutes,
            request.OverrideEarlyLeaveMinutes,
            ct);

        if (evaluated.IsFailure)
        {
            return Result.Failure<AttendanceRecordResponse>(evaluated.Error);
        }

        var eval = evaluated.Value;
        var nowUtc = DateTimeOffset.UtcNow;
        var actorName = string.IsNullOrWhiteSpace(actor.FullName) ? actor.Username : actor.FullName;

        var newLog = new AttendanceLog
        {
            EmployeeId = employee.EmployeeId,
            EmployeeCode = employee.EmployeeCode,
            ShiftId = shift.Id,
            WorkDate = request.WorkDate,
            CheckInTime = eval.CheckInTimeUtc,
            CheckOutTime = eval.CheckOutTimeUtc,
            LastSeenTime = eval.CheckOutTimeUtc ?? eval.CheckInTimeUtc,
            Status = eval.Status,
            LateMinutes = eval.LateMinutes,
            EarlyLeaveMinutes = eval.EarlyLeaveMinutes,
            MatchConfidence = 0f,
            IsManuallyAdjusted = true,
            AdjustmentReason = trimmedReason,
            AdjustedByUserId = actor.UserId,
            AdjustedByName = actorName,
            AdjustedAt = nowUtc,
            CreatedAt = nowUtc,
            UpdatedAt = nowUtc
        };

        dbContext.AttendanceLogs.Add(newLog);

        dbContext.AttendanceAdjustmentAudits.Add(new AttendanceAdjustmentAudit
        {
            AttendanceLogId = newLog.Id,
            EmployeeId = employee.EmployeeId,
            EmployeeCode = employee.EmployeeCode,
            EmployeeFullName = employee.FullName,
            DepartmentId = employee.DepartmentId,
            WorkDate = newLog.WorkDate,
            ActionType = "MANUAL_CREATE",
            PreviousStatus = null,
            NewStatus = newLog.Status,
            PreviousCheckInTime = null,
            NewCheckInTime = newLog.CheckInTime,
            PreviousCheckOutTime = null,
            NewCheckOutTime = newLog.CheckOutTime,
            PreviousLateMinutes = 0,
            NewLateMinutes = newLog.LateMinutes,
            PreviousEarlyLeaveMinutes = 0,
            NewEarlyLeaveMinutes = newLog.EarlyLeaveMinutes,
            PreviousSnapshotKey = null,
            IsStatusOverridden = request.IsStatusOverridden,
            Reason = trimmedReason,
            SourceScreen = NormalizeSourceScreen(request.SourceScreen),
            AdjustedByUserId = actor.UserId,
            AdjustedByUsername = actor.Username,
            AdjustedByName = actorName,
            AdjustedByRole = actor.Role,
            CreatedAt = nowUtc
        });

        await dbContext.SaveChangesAsync(ct);

        await eventBus.PublishAsync(new AttendanceLogAdjustedIntegrationEvent(
            Guid.NewGuid(),
            nowUtc,
            newLog.Id,
            employee.EmployeeId,
            employee.EmployeeCode,
            employee.DepartmentId,
            employee.DepartmentCode,
            newLog.WorkDate,
            PreviousStatus: null,
            PreviousLateMinutes: 0,
            NewStatus: newLog.Status,
            NewLateMinutes: newLog.LateMinutes,
            ActionType: "MANUAL_CREATE",
            Reason: trimmedReason), ct);

        return Result.Success(await MapAttendanceRecordResponseAsync(
            newLog,
            employee.FullName,
            isDebounced: false,
            message: trimmedReason,
            ct,
            employee.DepartmentId));
    }

    public async Task<Result<CancelAttendanceResponse>> CancelAttendanceLogAsync(
        Guid attendanceLogId,
        CancelAttendanceRequest request,
        ActorContext actor,
        CancellationToken ct = default)
    {
        var log = await dbContext.AttendanceLogs.FirstOrDefaultAsync(x => x.Id == attendanceLogId, ct);
        if (log is null)
        {
            return Result.Failure<CancelAttendanceResponse>(
                new Error("ATTENDANCE_LOG_NOT_FOUND", "Không tìm thấy bản ghi chấm công cần hủy."));
        }

        var employee = await employeeLookup.GetByIdAsync(log.EmployeeId, ct);
        if (employee is null)
        {
            return Result.Failure<CancelAttendanceResponse>(
                new Error("EMPLOYEE_NOT_FOUND", "Không tìm thấy hồ sơ nhân viên tương ứng với bản ghi chấm công."));
        }

        var authError = ValidateAdjustmentAuthorization(actor, employee.DepartmentId, log.WorkDate);
        if (authError is not null)
        {
            return Result.Failure<CancelAttendanceResponse>(authError);
        }

        var cancelMode = (request.CancelMode ?? string.Empty).Trim().ToUpperInvariant();
        if (!AllowedCancelModes.Contains(cancelMode))
        {
            return Result.Failure<CancelAttendanceResponse>(
                new Error("INVALID_CANCEL_MODE", "Chế độ hủy công không hợp lệ. Chỉ chấp nhận VOID_ERRONEOUS hoặc REVOKE_PENALTY."));
        }

        var trimmedReason = (request.Reason ?? string.Empty).Trim();
        if (trimmedReason.Length < 5)
        {
            return Result.Failure<CancelAttendanceResponse>(
                new Error("INVALID_REASON", "Vui lòng nhập lý do hủy công tối thiểu 5 ký tự."));
        }

        var nowUtc = DateTimeOffset.UtcNow;
        var actorName = string.IsNullOrWhiteSpace(actor.FullName) ? actor.Username : actor.FullName;
        var previousStatus = log.Status;
        var previousLateMinutes = log.LateMinutes;
        var previousEarlyLeaveMinutes = log.EarlyLeaveMinutes;
        var previousCheckIn = log.CheckInTime;
        var previousCheckOut = log.CheckOutTime;
        var previousSnapshotKey = log.CheckinSnapshotKey;

        if (cancelMode == "VOID_ERRONEOUS")
        {
            dbContext.AttendanceAdjustmentAudits.Add(new AttendanceAdjustmentAudit
            {
                AttendanceLogId = log.Id,
                EmployeeId = employee.EmployeeId,
                EmployeeCode = employee.EmployeeCode,
                EmployeeFullName = employee.FullName,
                DepartmentId = employee.DepartmentId,
                WorkDate = log.WorkDate,
                ActionType = "VOID_ERRONEOUS",
                PreviousStatus = previousStatus,
                NewStatus = null,
                PreviousCheckInTime = previousCheckIn,
                NewCheckInTime = null,
                PreviousCheckOutTime = previousCheckOut,
                NewCheckOutTime = null,
                PreviousLateMinutes = previousLateMinutes,
                NewLateMinutes = 0,
                PreviousEarlyLeaveMinutes = previousEarlyLeaveMinutes,
                NewEarlyLeaveMinutes = 0,
                PreviousSnapshotKey = previousSnapshotKey,
                IsStatusOverridden = false,
                Reason = trimmedReason,
                SourceScreen = NormalizeSourceScreen(request.SourceScreen),
                AdjustedByUserId = actor.UserId,
                AdjustedByUsername = actor.Username,
                AdjustedByName = actorName,
                AdjustedByRole = actor.Role,
                CreatedAt = nowUtc
            });

            dbContext.AttendanceLogs.Remove(log);
            await dbContext.SaveChangesAsync(ct);

            await eventBus.PublishAsync(new AttendanceLogRemovedIntegrationEvent(
                Guid.NewGuid(),
                nowUtc,
                log.Id,
                employee.EmployeeId,
                employee.EmployeeCode,
                employee.DepartmentId,
                log.WorkDate,
                previousStatus,
                previousLateMinutes,
                employee.DepartmentCode,
                trimmedReason), ct);

            return Result.Success(new CancelAttendanceResponse(
                log.Id,
                employee.EmployeeId,
                employee.EmployeeCode,
                log.WorkDate,
                cancelMode,
                previousStatus,
                NewStatus: null,
                trimmedReason,
                "Đã gỡ bản ghi chấm công bị ghi nhầm và lưu đầy đủ vết kiểm toán."));
        }

        // Chế độ 2: REVOKE_PENALTY (Phạt kỷ luật / Trừ toàn bộ lương ngày công — giữ bản ghi đối chứng, chuyển trạng thái REVOKED)
        if (string.Equals(log.Status, "REVOKED", StringComparison.OrdinalIgnoreCase))
        {
            return Result.Failure<CancelAttendanceResponse>(
                new Error("ALREADY_REVOKED", "Bản ghi chấm công này đã ở trạng thái Hủy công (Trừ lương)."));
        }

        log.Status = "REVOKED";
        log.LateMinutes = 0;
        log.EarlyLeaveMinutes = 0;
        log.IsManuallyAdjusted = true;
        log.AdjustmentReason = trimmedReason;
        log.AdjustedByUserId = actor.UserId;
        log.AdjustedByName = actorName;
        log.AdjustedAt = nowUtc;
        log.UpdatedAt = nowUtc;

        dbContext.AttendanceAdjustmentAudits.Add(new AttendanceAdjustmentAudit
        {
            AttendanceLogId = log.Id,
            EmployeeId = employee.EmployeeId,
            EmployeeCode = employee.EmployeeCode,
            EmployeeFullName = employee.FullName,
            DepartmentId = employee.DepartmentId,
            WorkDate = log.WorkDate,
            ActionType = "REVOKE_PENALTY",
            PreviousStatus = previousStatus,
            NewStatus = "REVOKED",
            PreviousCheckInTime = previousCheckIn,
            NewCheckInTime = log.CheckInTime,
            PreviousCheckOutTime = previousCheckOut,
            NewCheckOutTime = log.CheckOutTime,
            PreviousLateMinutes = previousLateMinutes,
            NewLateMinutes = 0,
            PreviousEarlyLeaveMinutes = previousEarlyLeaveMinutes,
            NewEarlyLeaveMinutes = 0,
            PreviousSnapshotKey = previousSnapshotKey,
            IsStatusOverridden = true,
            Reason = trimmedReason,
            SourceScreen = NormalizeSourceScreen(request.SourceScreen),
            AdjustedByUserId = actor.UserId,
            AdjustedByUsername = actor.Username,
            AdjustedByName = actorName,
            AdjustedByRole = actor.Role,
            CreatedAt = nowUtc
        });

        await dbContext.SaveChangesAsync(ct);

        await eventBus.PublishAsync(new AttendanceLogAdjustedIntegrationEvent(
            Guid.NewGuid(),
            nowUtc,
            log.Id,
            employee.EmployeeId,
            employee.EmployeeCode,
            employee.DepartmentId,
            employee.DepartmentCode,
            log.WorkDate,
            previousStatus,
            previousLateMinutes,
            "REVOKED",
            NewLateMinutes: 0,
            ActionType: "REVOKE_PENALTY",
            Reason: trimmedReason), ct);

        var updatedRecord = await MapAttendanceRecordResponseAsync(
            log,
            employee.FullName,
            isDebounced: false,
            message: trimmedReason,
            ct,
            employee.DepartmentId);

        return Result.Success(new CancelAttendanceResponse(
            log.Id,
            employee.EmployeeId,
            employee.EmployeeCode,
            log.WorkDate,
            cancelMode,
            previousStatus,
            NewStatus: "REVOKED",
            trimmedReason,
            "Đã hủy công (trừ lương ngày công) và giữ nguyên giờ/ảnh đối chứng.",
            updatedRecord));
    }

    public async Task<Result<IReadOnlyList<AttendanceAdjustmentAuditResponse>>> GetAttendanceAuditsAsync(
        ActorContext actor,
        Guid? employeeId = null,
        DateOnly? fromDate = null,
        DateOnly? toDate = null,
        CancellationToken ct = default)
    {
        if (!AllowedAdjustmentRoles.Contains(actor.Role))
        {
            return Result.Failure<IReadOnlyList<AttendanceAdjustmentAuditResponse>>(
                new Error("FORBIDDEN_ROLE", "Vai trò của bạn không có quyền xem lịch sử điều chỉnh công."));
        }

        IQueryable<AttendanceAdjustmentAudit> query = dbContext.AttendanceAdjustmentAudits;

        if (string.Equals(actor.Role, "DEPT_LEAD", StringComparison.OrdinalIgnoreCase))
        {
            if (!actor.DepartmentId.HasValue)
            {
                return Result.Failure<IReadOnlyList<AttendanceAdjustmentAuditResponse>>(
                    new Error("FORBIDDEN_DEPARTMENT", "Tài khoản Trưởng bộ phận chưa được gán phòng ban."));
            }

            var deptId = actor.DepartmentId.Value;
            query = query.Where(a => a.DepartmentId == deptId);
        }

        if (employeeId.HasValue)
        {
            query = query.Where(a => a.EmployeeId == employeeId.Value);
        }

        if (fromDate.HasValue || toDate.HasValue)
        {
            var start = fromDate ?? toDate!.Value;
            var end = toDate ?? fromDate!.Value;
            if (end < start)
            {
                (start, end) = (end, start);
            }

            query = query.Where(a => a.WorkDate >= start && a.WorkDate <= end);
        }

        var items = await query
            .OrderByDescending(a => a.CreatedAt)
            .Take(500)
            .Select(a => new AttendanceAdjustmentAuditResponse(
                a.Id,
                a.AttendanceLogId,
                a.EmployeeId,
                a.EmployeeCode,
                a.EmployeeFullName,
                a.DepartmentId,
                a.WorkDate,
                a.ActionType,
                a.PreviousStatus,
                a.NewStatus,
                a.PreviousCheckInTime,
                a.NewCheckInTime,
                a.PreviousCheckOutTime,
                a.NewCheckOutTime,
                a.PreviousLateMinutes,
                a.NewLateMinutes,
                a.PreviousEarlyLeaveMinutes,
                a.NewEarlyLeaveMinutes,
                a.IsStatusOverridden,
                a.Reason,
                a.SourceScreen,
                a.AdjustedByUserId,
                a.AdjustedByUsername,
                a.AdjustedByName,
                a.AdjustedByRole,
                a.CreatedAt))
            .ToListAsync(ct);

        return Result.Success<IReadOnlyList<AttendanceAdjustmentAuditResponse>>(items);
    }

    public static DateOnly GetStartOfCurrentWeek(DateOnly today)
    {
        var dayOfWeek = (int)today.DayOfWeek;
        var daysFromMonday = dayOfWeek == 0 ? 6 : dayOfWeek - 1;
        return today.AddDays(-daysFromMonday);
    }

    public static Error? ValidateAdjustmentAuthorization(
        ActorContext actor,
        Guid targetDepartmentId,
        DateOnly workDate,
        DateOnly? referenceToday = null)
    {
        if (!AllowedAdjustmentRoles.Contains(actor.Role))
        {
            return new Error("FORBIDDEN_ROLE", "Chỉ ADMIN, HR hoặc Trưởng bộ phận (DEPT_LEAD) mới có quyền điều chỉnh/hủy công.");
        }

        if (string.Equals(actor.Role, "DEPT_LEAD", StringComparison.OrdinalIgnoreCase))
        {
            if (!actor.DepartmentId.HasValue || actor.DepartmentId.Value != targetDepartmentId)
            {
                return new Error("FORBIDDEN_DEPARTMENT", "Trưởng bộ phận chỉ được phép chỉnh sửa hoặc hủy công cho nhân sự thuộc phòng ban của mình.");
            }
        }

        var today = referenceToday ?? VietnamDateTime.Today;
        if (workDate > today)
        {
            return new Error("INVALID_WORK_DATE", "Không thể chỉnh sửa hoặc bổ sung công cho ngày trong tương lai.");
        }

        var currentWeekStart = GetStartOfCurrentWeek(today);
        if (workDate < currentWeekStart && !string.Equals(actor.Role, "ADMIN", StringComparison.OrdinalIgnoreCase))
        {
            return new Error(
                "FORBIDDEN_HISTORICAL_LOCK",
                $"Dữ liệu công từ tuần trước trở về trước (trước ngày {currentWeekStart:dd/MM/yyyy}) đã bị khóa. Chỉ Quản trị viên (ADMIN) mới có quyền chỉnh sửa hoặc hủy.");
        }

        return null;
    }

    private async Task<Shift?> ResolveShiftAsync(Guid? requestedShiftId, Guid? defaultShiftId, CancellationToken ct)
    {
        Shift? shift = null;
        if (requestedShiftId.HasValue)
        {
            shift = await dbContext.Shifts.FirstOrDefaultAsync(s => s.Id == requestedShiftId.Value, ct);
        }

        if (shift is null && defaultShiftId.HasValue)
        {
            shift = await dbContext.Shifts.FirstOrDefaultAsync(s => s.Id == defaultShiftId.Value, ct);
        }

        return shift ?? await dbContext.Shifts.OrderByDescending(s => s.IsDefault).FirstOrDefaultAsync(ct);
    }

    private async Task<(TimeOnly EffectiveStartTime, TimeOnly EffectiveEndTime)> ResolveEffectiveShiftWindowAsync(
        Guid employeeId,
        DateOnly workDate,
        Shift shift,
        CancellationToken ct)
    {
        var approvedLeavesToday = await dbContext.LeaveRequests
            .Where(l => l.EmployeeId == employeeId &&
                        l.ApprovalStatus == "APPROVED" &&
                        l.StartDate <= workDate &&
                        l.EndDate >= workDate)
            .ToListAsync(ct);

        var effectiveStartTime = shift.StartTime;
        var effectiveEndTime = shift.EndTime;

        foreach (var lv in approvedLeavesToday.OrderBy(x => x.StartDate).ThenBy(x => x.StartTime))
        {
            var dayStart = lv.StartDate < workDate ? TimeOnly.MinValue : lv.StartTime;
            var dayEnd = lv.EndDate > workDate ? TimeOnly.MaxValue : lv.EndTime;
            if (dayStart <= effectiveStartTime && dayEnd > effectiveStartTime)
            {
                effectiveStartTime = dayEnd < shift.EndTime ? dayEnd : shift.EndTime;
            }
        }

        foreach (var lv in approvedLeavesToday.OrderByDescending(x => x.EndDate).ThenByDescending(x => x.EndTime))
        {
            var dayStart = lv.StartDate < workDate ? TimeOnly.MinValue : lv.StartTime;
            var dayEnd = lv.EndDate > workDate ? TimeOnly.MaxValue : lv.EndTime;
            if (dayEnd >= effectiveEndTime && dayStart < effectiveEndTime)
            {
                effectiveEndTime = dayStart > shift.StartTime ? dayStart : shift.StartTime;
            }
        }

        return (effectiveStartTime, effectiveEndTime);
    }

    private sealed record EvaluatedAttendance(
        DateTimeOffset? CheckInTimeUtc,
        DateTimeOffset? CheckOutTimeUtc,
        string Status,
        int LateMinutes,
        int EarlyLeaveMinutes);

    private async Task<Result<EvaluatedAttendance>> EvaluateAdjustedAttendanceAsync(
        Guid employeeId,
        DateOnly workDate,
        Shift shift,
        DateTimeOffset? checkInTime,
        DateTimeOffset? checkOutTime,
        bool isStatusOverridden,
        string? overrideStatus,
        int? overrideLateMinutes,
        int? overrideEarlyLeaveMinutes,
        CancellationToken ct)
    {
        var checkInUtc = checkInTime?.ToUniversalTime();
        var checkOutUtc = checkOutTime?.ToUniversalTime();

        if (checkInUtc.HasValue && checkOutUtc.HasValue && checkOutUtc.Value <= checkInUtc.Value)
        {
            return Result.Failure<EvaluatedAttendance>(
                new Error("INVALID_TIME_RANGE", "Giờ ra (Check-out) phải lớn hơn giờ vào (Check-in)."));
        }

        var (effectiveStartTime, effectiveEndTime) = await ResolveEffectiveShiftWindowAsync(
            employeeId,
            workDate,
            shift,
            ct);

        string computedStatus;
        int computedLateMinutes = 0;
        int computedEarlyLeaveMinutes = 0;

        if (!checkInUtc.HasValue)
        {
            if (checkOutUtc.HasValue && !isStatusOverridden)
            {
                return Result.Failure<EvaluatedAttendance>(
                    new Error("CHECKIN_REQUIRED", "Vui lòng nhập giờ vào (Check-in) khi đã có giờ ra (Check-out)."));
            }

            computedStatus = "ABSENT";
        }
        else
        {
            var checkInLocal = VietnamDateTime.ToVietnamTimeOnly(checkInUtc.Value);
            var latestAllowedTime = effectiveStartTime.AddMinutes(shift.GraceMinutes);
            var isLate = checkInLocal > latestAllowedTime;
            computedLateMinutes = isLate
                ? Math.Max(1, (int)Math.Ceiling((checkInLocal - effectiveStartTime).TotalMinutes))
                : 0;
            computedStatus = isLate ? "LATE" : "ON_TIME";

            if (checkOutUtc.HasValue)
            {
                var checkOutLocal = VietnamDateTime.ToVietnamTimeOnly(checkOutUtc.Value);
                if (checkOutLocal < effectiveEndTime)
                {
                    computedEarlyLeaveMinutes = Math.Max(1, (int)Math.Ceiling((effectiveEndTime - checkOutLocal).TotalMinutes));
                    if (computedStatus == "ON_TIME")
                    {
                        computedStatus = "EARLY_LEAVE";
                    }
                }
            }
        }

        if (!isStatusOverridden)
        {
            return Result.Success(new EvaluatedAttendance(
                checkInUtc,
                checkOutUtc,
                computedStatus,
                computedLateMinutes,
                computedEarlyLeaveMinutes));
        }

        var normalizedOverride = (overrideStatus ?? string.Empty).Trim().ToUpperInvariant();
        if (!AllowedAttendanceStatuses.Contains(normalizedOverride))
        {
            return Result.Failure<EvaluatedAttendance>(
                new Error("INVALID_STATUS", $"Trạng thái ghi đè '{overrideStatus}' không hợp lệ."));
        }

        if (normalizedOverride == "ABSENT")
        {
            return Result.Success(new EvaluatedAttendance(null, null, "ABSENT", 0, 0));
        }

        if (normalizedOverride == "REVOKED")
        {
            return Result.Success(new EvaluatedAttendance(checkInUtc, checkOutUtc, "REVOKED", 0, 0));
        }

        if (normalizedOverride == "ON_TIME")
        {
            return Result.Success(new EvaluatedAttendance(
                checkInUtc,
                checkOutUtc,
                "ON_TIME",
                Math.Max(0, overrideLateMinutes ?? 0),
                Math.Max(0, overrideEarlyLeaveMinutes ?? 0)));
        }

        return Result.Success(new EvaluatedAttendance(
            checkInUtc,
            checkOutUtc,
            normalizedOverride,
            Math.Max(0, overrideLateMinutes ?? computedLateMinutes),
            Math.Max(0, overrideEarlyLeaveMinutes ?? computedEarlyLeaveMinutes)));
    }

    private static string? NormalizeSourceScreen(string? sourceScreen)
    {
        if (string.IsNullOrWhiteSpace(sourceScreen))
        {
            return null;
        }

        var trimmed = sourceScreen.Trim().ToUpperInvariant();
        return trimmed.Length > 50 ? trimmed[..50] : trimmed;
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
        var prepared = await PrepareLeaveEntityAsync(request, excludeLeaveId: null, ct);
        if (prepared.IsFailure)
        {
            return Result.Failure<LeaveRequestResponse>(prepared.Error);
        }

        var (leave, employee) = prepared.Value;
        dbContext.LeaveRequests.Add(leave);
        var removedEvents = await CleanupOverlappingAttendanceLogsAsync(leave, employee, ct);
        await dbContext.SaveChangesAsync(ct);

        await PublishLeaveCreatedEventAsync(leave, employee, ct);
        foreach (var removedEvt in removedEvents)
        {
            await eventBus.PublishAsync(removedEvt, ct);
        }

        return Result.Success(MapLeaveResponse(leave, employee.EmployeeCode, employee.FullName));
    }

    public async Task<Result<LeaveRequestResponse>> CancelLeaveRequestAsync(
        Guid leaveRequestId,
        CancellationToken ct = default)
    {
        var leave = await dbContext.LeaveRequests.FirstOrDefaultAsync(l => l.Id == leaveRequestId, ct);
        if (leave is null)
        {
            return Result.Failure<LeaveRequestResponse>(
                new Error("LEAVE_NOT_FOUND", "Không tìm thấy đơn xin nghỉ phép cần hủy."));
        }

        if (leave.ApprovalStatus is "CANCELLED" or "REJECTED")
        {
            return Result.Failure<LeaveRequestResponse>(
                new Error("LEAVE_ALREADY_CLOSED", $"Đơn nghỉ phép đang ở trạng thái '{leave.ApprovalStatus}', không thể hủy."));
        }

        leave.ApprovalStatus = "CANCELLED";
        await dbContext.SaveChangesAsync(ct);

        var emp = await employeeLookup.GetByIdAsync(leave.EmployeeId, ct);
        return Result.Success(MapLeaveResponse(leave, emp?.EmployeeCode, emp?.FullName));
    }

    public async Task<Result<LeaveRequestResponse>> ReplaceLeaveRequestAsync(
        Guid leaveRequestId,
        CreateLeaveRequestDto request,
        CancellationToken ct = default)
    {
        var existingLeave = await dbContext.LeaveRequests.FirstOrDefaultAsync(l => l.Id == leaveRequestId, ct);
        if (existingLeave is null)
        {
            return Result.Failure<LeaveRequestResponse>(
                new Error("LEAVE_NOT_FOUND", "Không tìm thấy đơn xin nghỉ phép cần thay thế."));
        }

        if (existingLeave.ApprovalStatus is "CANCELLED" or "REJECTED")
        {
            return Result.Failure<LeaveRequestResponse>(
                new Error("LEAVE_CANNOT_BE_REPLACED", $"Đơn nghỉ phép đang ở trạng thái '{existingLeave.ApprovalStatus}', không thể thay thế."));
        }

        var normalizedRequest = request.EmployeeId == Guid.Empty
            ? request with { EmployeeId = existingLeave.EmployeeId }
            : request;

        if (normalizedRequest.EmployeeId != existingLeave.EmployeeId)
        {
            return Result.Failure<LeaveRequestResponse>(
                new Error("EMPLOYEE_MISMATCH", "Không thể thay thế đơn nghỉ phép cho một nhân viên khác."));
        }

        var prepared = await PrepareLeaveEntityAsync(normalizedRequest, excludeLeaveId: leaveRequestId, ct);
        if (prepared.IsFailure)
        {
            return Result.Failure<LeaveRequestResponse>(prepared.Error);
        }

        var (newLeave, employee) = prepared.Value;
        existingLeave.ApprovalStatus = "CANCELLED";
        dbContext.LeaveRequests.Add(newLeave);
        var removedEvents = await CleanupOverlappingAttendanceLogsAsync(newLeave, employee, ct);
        await dbContext.SaveChangesAsync(ct);

        await PublishLeaveCreatedEventAsync(newLeave, employee, ct);
        foreach (var removedEvt in removedEvents)
        {
            await eventBus.PublishAsync(removedEvt, ct);
        }

        return Result.Success(MapLeaveResponse(newLeave, employee.EmployeeCode, employee.FullName));
    }

    private async Task<List<AttendanceLogRemovedIntegrationEvent>> CleanupOverlappingAttendanceLogsAsync(
        LeaveRequest leave,
        EmployeeContractDto employee,
        CancellationToken ct)
    {
        var removedEvents = new List<AttendanceLogRemovedIntegrationEvent>();
        if (string.Equals(leave.LeaveType, "OFFICIAL_DUTY", StringComparison.OrdinalIgnoreCase))
        {
            return removedEvents;
        }

        var leaveStart = leave.StartDate.ToDateTime(leave.StartTime);
        var leaveEnd = leave.EndDate.ToDateTime(leave.EndTime);

        var logs = await dbContext.AttendanceLogs
            .Where(x => x.EmployeeId == leave.EmployeeId &&
                        x.WorkDate >= leave.StartDate &&
                        x.WorkDate <= leave.EndDate)
            .ToListAsync(ct);

        foreach (var log in logs)
        {
            if (log.Status == "ABSENT" && !log.CheckInTime.HasValue)
            {
                dbContext.AttendanceLogs.Remove(log);
                removedEvents.Add(new AttendanceLogRemovedIntegrationEvent(
                    Guid.NewGuid(),
                    DateTimeOffset.UtcNow,
                    log.Id,
                    log.EmployeeId,
                    log.EmployeeCode,
                    employee.DepartmentId,
                    log.WorkDate,
                    log.Status,
                    log.LateMinutes,
                    employee.DepartmentCode,
                    leave.Reason));
                continue;
            }

            if (log.CheckInTime.HasValue)
            {
                var checkInLocal = VietnamDateTime.ToVietnamDateOnly(log.CheckInTime.Value)
                    .ToDateTime(VietnamDateTime.ToVietnamTimeOnly(log.CheckInTime.Value));

                if (leaveStart <= checkInLocal && checkInLocal <= leaveEnd)
                {
                    dbContext.AttendanceLogs.Remove(log);
                    removedEvents.Add(new AttendanceLogRemovedIntegrationEvent(
                        Guid.NewGuid(),
                        DateTimeOffset.UtcNow,
                        log.Id,
                        log.EmployeeId,
                        log.EmployeeCode,
                        employee.DepartmentId,
                        log.WorkDate,
                        log.Status,
                        log.LateMinutes,
                        employee.DepartmentCode,
                        leave.Reason));
                    continue;
                }
            }

            if (log.CheckOutTime.HasValue)
            {
                var checkOutLocal = VietnamDateTime.ToVietnamDateOnly(log.CheckOutTime.Value)
                    .ToDateTime(VietnamDateTime.ToVietnamTimeOnly(log.CheckOutTime.Value));

                if (leaveStart <= checkOutLocal && checkOutLocal <= leaveEnd)
                {
                    log.CheckOutTime = null;
                    log.EarlyLeaveMinutes = 0;
                    if (log.Status == "EARLY_LEAVE")
                    {
                        log.Status = log.LateMinutes > 0 ? "LATE" : "ON_TIME";
                    }
                    log.UpdatedAt = DateTimeOffset.UtcNow;
                }
            }
        }

        return removedEvents;
    }

    private async Task<Result<(LeaveRequest Leave, EmployeeContractDto Employee)>> PrepareLeaveEntityAsync(
        CreateLeaveRequestDto request,
        Guid? excludeLeaveId,
        CancellationToken ct)
    {
        if (request.EndDate < request.StartDate)
        {
            return Result.Failure<(LeaveRequest, EmployeeContractDto)>(
                new Error("INVALID_DATE_RANGE", "Ngày kết thúc nghỉ phép không được nhỏ hơn ngày bắt đầu."));
        }

        var normalizedLeaveType = string.IsNullOrWhiteSpace(request.LeaveType)
            ? "ANNUAL_LEAVE"
            : request.LeaveType.Trim().ToUpperInvariant();

        if (!AllowedLeaveTypes.Contains(normalizedLeaveType))
        {
            return Result.Failure<(LeaveRequest, EmployeeContractDto)>(
                new Error("INVALID_LEAVE_TYPE", $"Loại nghỉ phép '{request.LeaveType}' không hợp lệ."));
        }

        var employee = await employeeLookup.GetByIdAsync(request.EmployeeId, ct);
        if (employee is null || !employee.IsActive)
        {
            return Result.Failure<(LeaveRequest, EmployeeContractDto)>(
                new Error("EMPLOYEE_NOT_FOUND", "Không tìm thấy hồ sơ nhân viên hoặc nhân viên đã ngừng làm việc."));
        }

        // Lấy ca làm việc của nhân viên (hoặc ca mặc định) để gán giá trị default cho StartTime và EndTime
        Shift? shift = null;
        if (employee.DefaultShiftId.HasValue)
        {
            shift = await dbContext.Shifts.FirstOrDefaultAsync(s => s.Id == employee.DefaultShiftId.Value, ct);
        }

        shift ??= await dbContext.Shifts.OrderByDescending(s => s.IsDefault).FirstOrDefaultAsync(ct);

        var resolvedStartTime = request.StartTime ?? shift?.StartTime ?? new TimeOnly(8, 0);
        var resolvedEndTime = request.EndTime ?? shift?.EndTime ?? new TimeOnly(17, 30);

        if (request.StartDate == request.EndDate && resolvedEndTime <= resolvedStartTime)
        {
            return Result.Failure<(LeaveRequest, EmployeeContractDto)>(
                new Error("INVALID_TIME_RANGE", "Giờ kết thúc phải lớn hơn giờ bắt đầu khi đăng ký trong cùng một ngày."));
        }

        // Kiểm tra trùng lặp khoảng thời gian liên tục (StartDate+StartTime .. EndDate+EndTime) với các đơn còn hiệu lực
        var overlapQuery = dbContext.LeaveRequests
            .Where(l => l.EmployeeId == request.EmployeeId &&
                        l.ApprovalStatus != "REJECTED" &&
                        l.ApprovalStatus != "CANCELLED" &&
                        l.StartDate <= request.EndDate &&
                        l.EndDate >= request.StartDate);

        if (excludeLeaveId.HasValue)
        {
            overlapQuery = overlapQuery.Where(l => l.Id != excludeLeaveId.Value);
        }

        var reqStartDt = request.StartDate.ToDateTime(resolvedStartTime);
        var reqEndDt = request.EndDate.ToDateTime(resolvedEndTime);
        var candidateLeaves = await overlapQuery.ToListAsync(ct);
        var overlappingLeave = candidateLeaves.FirstOrDefault(l =>
        {
            var existStartDt = l.StartDate.ToDateTime(l.StartTime);
            var existEndDt = l.EndDate.ToDateTime(l.EndTime);
            return existStartDt < reqEndDt && existEndDt > reqStartDt;
        });

        if (overlappingLeave is not null)
        {
            return Result.Failure<(LeaveRequest, EmployeeContractDto)>(
                new Error(
                    "LEAVE_OVERLAP",
                    $"Nhân viên đã có đơn nghỉ phép trùng khung giờ ({overlappingLeave.StartDate:dd/MM/yyyy} - {overlappingLeave.EndDate:dd/MM/yyyy}, {overlappingLeave.StartTime:HH\\:mm} - {overlappingLeave.EndTime:HH\\:mm}). Vui lòng hủy hoặc điều chỉnh đơn cũ."));
        }

        bool isPaid = normalizedLeaveType switch
        {
            "OFFICIAL_DUTY" => true,
            "SUDDENLY_ALLOWED_LEAVE" => false,
            "UNPAID_LEAVE" => false,
            _ => request.IsPaid ?? true
        };

        var leave = new LeaveRequest
        {
            EmployeeId = request.EmployeeId,
            StartDate = request.StartDate,
            EndDate = request.EndDate,
            StartTime = resolvedStartTime,
            EndTime = resolvedEndTime,
            LeaveType = normalizedLeaveType,
            IsPaid = isPaid,
            Reason = request.Reason,
            ApprovalStatus = "APPROVED"
        };

        return Result.Success((leave, employee));
    }

    private Task PublishLeaveCreatedEventAsync(
        LeaveRequest leave,
        EmployeeContractDto employee,
        CancellationToken ct)
    {
        return eventBus.PublishAsync(new LeaveRequestCreatedIntegrationEvent(
            Guid.NewGuid(),
            DateTimeOffset.UtcNow,
            leave.Id,
            leave.EmployeeId,
            employee.EmployeeCode,
            employee.DepartmentId,
            leave.StartDate,
            leave.EndDate,
            leave.StartTime,
            leave.EndTime,
            leave.LeaveType,
            leave.IsPaid,
            leave.ApprovalStatus), ct);
    }

    private static LeaveRequestResponse MapLeaveResponse(
        LeaveRequest leave,
        string? employeeCode,
        string? employeeName) => new(
            leave.Id,
            leave.EmployeeId,
            leave.StartDate,
            leave.EndDate,
            leave.StartTime,
            leave.EndTime,
            leave.LeaveType,
            leave.IsPaid,
            leave.Reason,
            leave.ApprovalStatus,
            leave.CreatedAt,
            employeeCode,
            employeeName);

    public async Task<IReadOnlyList<LeaveRequestResponse>> GetLeaveRequestsAsync(
        DateOnly? date = null,
        CancellationToken ct = default)
    {
        var query = dbContext.LeaveRequests.AsQueryable();
        if (date.HasValue)
        {
            query = query.Where(l => l.StartDate <= date.Value && l.EndDate >= date.Value);
        }

        var leaves = await query
            .OrderByDescending(l => l.StartDate)
            .ThenByDescending(l => l.StartTime)
            .ToListAsync(ct);

        var responses = new List<LeaveRequestResponse>(leaves.Count);
        foreach (var l in leaves)
        {
            var emp = await employeeLookup.GetByIdAsync(l.EmployeeId, ct);
            responses.Add(new LeaveRequestResponse(
                l.Id,
                l.EmployeeId,
                l.StartDate,
                l.EndDate,
                l.StartTime,
                l.EndTime,
                l.LeaveType,
                l.IsPaid,
                l.Reason,
                l.ApprovalStatus,
                l.CreatedAt,
                emp?.EmployeeCode,
                emp?.FullName));
        }

        return responses;
    }

    public async Task<LeaveLookupResultDto> CheckApprovedLeaveAsync(
        Guid employeeId,
        DateTimeOffset checkTimeUtc,
        CancellationToken cancellationToken = default)
    {
        var checkDate = VietnamDateTime.ToVietnamDateOnly(checkTimeUtc);
        var checkTime = VietnamDateTime.ToVietnamTimeOnly(checkTimeUtc);

        var matched = await FindActiveLeaveAtAsync(
            employeeId,
            checkDate,
            checkTime,
            includeOfficialDuty: true,
            cancellationToken);

        if (matched is not null)
        {
            return new LeaveLookupResultDto(
                HasApprovedLeave: true,
                LeaveRequestId: matched.Id,
                EmployeeId: matched.EmployeeId,
                LeaveType: matched.LeaveType,
                IsPaid: matched.IsPaid,
                StartDate: matched.StartDate,
                EndDate: matched.EndDate,
                StartTime: matched.StartTime,
                EndTime: matched.EndTime);
        }

        return new LeaveLookupResultDto(
            HasApprovedLeave: false,
            LeaveRequestId: null,
            EmployeeId: employeeId,
            LeaveType: null,
            IsPaid: false,
            StartDate: null,
            EndDate: null,
            StartTime: null,
            EndTime: null);
    }

    private async Task<LeaveRequest?> FindActiveLeaveAtAsync(
        Guid employeeId,
        DateOnly targetDate,
        TimeOnly targetTime,
        bool includeOfficialDuty,
        CancellationToken ct)
    {
        var targetDateTime = targetDate.ToDateTime(targetTime);
        var candidates = await dbContext.LeaveRequests
            .Where(l => l.EmployeeId == employeeId &&
                        l.ApprovalStatus == "APPROVED" &&
                        l.StartDate <= targetDate &&
                        l.EndDate >= targetDate)
            .OrderByDescending(l => l.IsPaid)
            .ThenByDescending(l => l.CreatedAt)
            .ToListAsync(ct);

        return candidates.FirstOrDefault(l =>
        {
            if (!includeOfficialDuty && string.Equals(l.LeaveType, "OFFICIAL_DUTY", StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            var leaveStart = l.StartDate.ToDateTime(l.StartTime);
            var leaveEnd = l.EndDate.ToDateTime(l.EndTime);
            return leaveStart <= targetDateTime && targetDateTime <= leaveEnd;
        });
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
        CancellationToken ct,
        Guid? departmentId = null)
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
            snapshotPresignedUrl,
            log.IsManuallyAdjusted,
            log.AdjustmentReason,
            log.AdjustedByUserId,
            log.AdjustedByName,
            log.AdjustedAt,
            departmentId);
    }

    public async Task<bool> HasEmployeeCheckedInTodayAsync(
        Guid employeeId,
        DateOnly workDate,
        CancellationToken ct = default)
    {
        var previousDate = workDate.AddDays(-1);
        return await dbContext.AttendanceLogs
            .AnyAsync(x => x.EmployeeId == employeeId &&
                           (x.WorkDate == workDate || x.WorkDate == previousDate) &&
                           x.CheckInTime != null &&
                           x.Status != "ABSENT" &&
                           x.Status != "REVOKED", ct);
    }

    public async Task<WorkScheduleValidationResult> ValidateEmployeePresenceTimeAsync(
        Guid employeeId,
        DateTimeOffset presenceTimeUtc,
        int gracePeriodMinutes = 20,
        CancellationToken ct = default)
    {
        var employee = await employeeLookup.GetByIdAsync(employeeId, ct);
        if (employee is null || !employee.IsActive)
        {
            return new WorkScheduleValidationResult(
                IsAuthorizedToWork: false,
                IsWithinDefaultShift: false,
                IsWithinGracePeriod: false,
                IsWithinApprovedOt: false,
                ShiftName: string.Empty,
                ShiftStart: null,
                ShiftEnd: null,
                ApprovedOtId: null,
                OtStart: null,
                OtEnd: null,
                SummaryMessage: "Nhân viên không tồn tại hoặc đã ngừng làm việc.");
        }

        Shift? shift = null;
        if (employee.DefaultShiftId.HasValue)
        {
            shift = await dbContext.Shifts.FirstOrDefaultAsync(s => s.Id == employee.DefaultShiftId.Value, ct);
        }
        shift ??= await dbContext.Shifts.OrderByDescending(s => s.IsDefault).FirstOrDefaultAsync(ct);

        // Quy đổi về giờ làm việc địa phương (Vietnam / System local time)
        var localTime = presenceTimeUtc.ToOffset(TimeSpan.FromHours(7));
        var currentTime = TimeOnly.FromDateTime(localTime.DateTime);
        var dayOfWeek = localTime.DayOfWeek;
        var isWeekend = dayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday;

        // 1. Kiểm tra ca làm thêm ngoài giờ (OT) đã được phê duyệt (APPROVED)
        var otCheck = await overtimeLookup.CheckApprovedOvertimeAsync(employeeId, presenceTimeUtc, ct);

        // 2. Kiểm tra ca làm việc hành chính chuẩn (không tính cuối tuần nếu là ca hành chính mặc định)
        bool isWithinShift = false;
        bool isWithinGrace = false;
        string shiftName = shift?.ShiftName ?? "Ca hành chính mặc định";
        TimeOnly? shiftStart = shift?.StartTime;
        TimeOnly? shiftEnd = shift?.EndTime;

        if (shift is not null && !isWeekend)
        {
            var graceEnd = shift.EndTime.AddMinutes(gracePeriodMinutes);
            if (shift.EndTime < shift.StartTime)
            {
                // Ca làm việc qua đêm
                isWithinShift = currentTime >= shift.StartTime || currentTime <= shift.EndTime;
                isWithinGrace = !isWithinShift && currentTime > shift.EndTime && currentTime <= graceEnd;
            }
            else
            {
                isWithinShift = currentTime >= shift.StartTime && currentTime <= shift.EndTime;
                isWithinGrace = !isWithinShift && currentTime > shift.EndTime && currentTime <= graceEnd;
            }
        }

        bool isAuthorized = isWithinShift || isWithinGrace || otCheck.HasApprovedOvertime;

        string summary;
        if (otCheck.HasApprovedOvertime)
        {
            summary = $"Nhân viên có lịch làm thêm ngoài giờ (OT: {otCheck.StartTime:HH:mm} - {otCheck.EndTime:HH:mm}) đã được phê duyệt.";
        }
        else if (isWithinShift)
        {
            summary = $"Nhân viên đang trong ca làm việc ({shiftName}: {shiftStart:HH:mm} - {shiftEnd:HH:mm}).";
        }
        else if (isWithinGrace)
        {
            summary = $"Nhân viên đang trong thời gian ân hạn {gracePeriodMinutes} phút sau ca làm việc ({shiftEnd:HH:mm}).";
        }
        else if (isWeekend)
        {
            summary = $"Ngày cuối tuần ({dayOfWeek}): Nhân viên hiện diện nhưng chưa được phê duyệt làm thêm giờ (OT).";
        }
        else
        {
            summary = $"Nhân viên hiện diện ngoài giờ làm việc ({currentTime:HH:mm}) mà chưa được phê duyệt làm thêm giờ (OT).";
        }

        return new WorkScheduleValidationResult(
            IsAuthorizedToWork: isAuthorized,
            IsWithinDefaultShift: isWithinShift,
            IsWithinGracePeriod: isWithinGrace,
            IsWithinApprovedOt: otCheck.HasApprovedOvertime,
            ShiftName: shiftName,
            ShiftStart: shiftStart,
            ShiftEnd: shiftEnd,
            ApprovedOtId: otCheck.OtRegistrationId,
            OtStart: otCheck.StartTime,
            OtEnd: otCheck.EndTime,
            SummaryMessage: summary);
    }
}
