namespace SmartOffice.Modules.Attendance.Application.DTOs;

public sealed record CreateShiftRequest(
    string ShiftCode,
    string ShiftName,
    TimeOnly StartTime,
    TimeOnly EndTime,
    int GraceMinutes = 15,
    TimeOnly? LunchStart = null,
    TimeOnly? LunchEnd = null,
    bool IsDefault = false);

public sealed record ShiftResponse(
    Guid Id,
    string ShiftCode,
    string ShiftName,
    TimeOnly StartTime,
    TimeOnly EndTime,
    int GraceMinutes,
    TimeOnly? LunchStart,
    TimeOnly? LunchEnd,
    bool IsDefault);

public sealed record CheckAttendanceRequest(
    Guid EmployeeId,
    Guid? GateCameraId,
    float MatchConfidence = 0.92f,
    string? SnapshotObjectKey = null,
    DateTimeOffset? TimestampUtc = null);

public sealed record AttendanceRecordResponse(
    Guid Id,
    Guid EmployeeId,
    string EmployeeCode,
    string EmployeeFullName,
    Guid ShiftId,
    DateOnly WorkDate,
    DateTimeOffset? CheckInTime,
    DateTimeOffset? CheckOutTime,
    string Status,
    int LateMinutes,
    int EarlyLeaveMinutes,
    float MatchConfidence,
    bool IsDebounced,
    string Message,
    string? CheckinSnapshotKey = null,
    string? CheckinSnapshotPresignedUrl = null,
    bool IsManuallyAdjusted = false,
    string? AdjustmentReason = null,
    Guid? AdjustedByUserId = null,
    string? AdjustedByName = null,
    DateTimeOffset? AdjustedAt = null,
    Guid? DepartmentId = null);

public sealed record AdjustAttendanceRequest(
    DateTimeOffset? CheckInTime,
    DateTimeOffset? CheckOutTime,
    Guid? ShiftId,
    bool IsStatusOverridden,
    string? OverrideStatus,
    int? OverrideLateMinutes,
    int? OverrideEarlyLeaveMinutes,
    string Reason,
    string? SourceScreen = null);

public sealed record ManualAttendanceRequest(
    Guid EmployeeId,
    DateOnly WorkDate,
    DateTimeOffset? CheckInTime,
    DateTimeOffset? CheckOutTime,
    Guid? ShiftId,
    bool IsStatusOverridden,
    string? OverrideStatus,
    int? OverrideLateMinutes,
    int? OverrideEarlyLeaveMinutes,
    string Reason,
    string? SourceScreen = null);

public sealed record CancelAttendanceRequest(
    string CancelMode,
    string Reason,
    string? SourceScreen = null);

public sealed record CancelAttendanceResponse(
    Guid AttendanceLogId,
    Guid EmployeeId,
    string EmployeeCode,
    DateOnly WorkDate,
    string CancelMode,
    string? PreviousStatus,
    string? NewStatus,
    string Reason,
    string Message,
    AttendanceRecordResponse? UpdatedRecord = null);

public sealed record AttendanceAdjustmentAuditResponse(
    Guid Id,
    Guid AttendanceLogId,
    Guid EmployeeId,
    string EmployeeCode,
    string EmployeeFullName,
    Guid DepartmentId,
    DateOnly WorkDate,
    string ActionType,
    string? PreviousStatus,
    string? NewStatus,
    DateTimeOffset? PreviousCheckInTime,
    DateTimeOffset? NewCheckInTime,
    DateTimeOffset? PreviousCheckOutTime,
    DateTimeOffset? NewCheckOutTime,
    int PreviousLateMinutes,
    int NewLateMinutes,
    int PreviousEarlyLeaveMinutes,
    int NewEarlyLeaveMinutes,
    bool IsStatusOverridden,
    string Reason,
    string? SourceScreen,
    Guid AdjustedByUserId,
    string AdjustedByUsername,
    string AdjustedByName,
    string AdjustedByRole,
    DateTimeOffset CreatedAt);

public sealed record AttendanceSnapshotUploadResponse(
    Guid AttendanceLogId,
    string EmployeeCode,
    string ObjectKey,
    string PresignedViewUrl,
    int ExpiryMinutes);

public sealed record CreateLeaveRequestDto(
    Guid EmployeeId,
    DateOnly StartDate,
    DateOnly EndDate,
    string LeaveType = "ANNUAL_LEAVE",
    string? Reason = null,
    TimeOnly? StartTime = null,
    TimeOnly? EndTime = null,
    bool? IsPaid = null);

public sealed record LeaveRequestResponse(
    Guid Id,
    Guid EmployeeId,
    DateOnly StartDate,
    DateOnly EndDate,
    TimeOnly StartTime,
    TimeOnly EndTime,
    string LeaveType,
    bool IsPaid,
    string? Reason,
    string ApprovalStatus,
    DateTimeOffset CreatedAt,
    string? EmployeeCode = null,
    string? EmployeeName = null);

public sealed record DailyAbsentProcessResponse(
    DateOnly WorkDate,
    int TotalActiveEmployees,
    int PresentOrCheckedInCount,
    int OnApprovedLeaveCount,
    int NewlyMarkedAbsentCount,
    IReadOnlyList<string> AbsentEmployeeCodes);
