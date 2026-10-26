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
    TimeOnly LunchStart,
    TimeOnly LunchEnd,
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
    string Message);

public sealed record CreateLeaveRequestDto(
    Guid EmployeeId,
    DateOnly StartDate,
    DateOnly EndDate,
    string LeaveType = "ANNUAL_LEAVE",
    string? Reason = null);

public sealed record LeaveRequestResponse(
    Guid Id,
    Guid EmployeeId,
    DateOnly StartDate,
    DateOnly EndDate,
    string LeaveType,
    string? Reason,
    string ApprovalStatus,
    DateTimeOffset CreatedAt);
