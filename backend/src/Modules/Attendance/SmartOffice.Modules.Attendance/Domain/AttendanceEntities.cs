using SmartOffice.SharedKernel.Domain;

namespace SmartOffice.Modules.Attendance.Domain;

public sealed class Shift : BaseEntity
{
    public string ShiftCode { get; set; } = string.Empty;
    public string ShiftName { get; set; } = string.Empty;
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
    public int GraceMinutes { get; set; } = 15;
    public TimeOnly? LunchStart { get; set; }
    public TimeOnly? LunchEnd { get; set; }
    public bool IsDefault { get; set; }
}

public sealed class AttendanceLog : BaseEntity
{
    public Guid EmployeeId { get; set; }
    public string EmployeeCode { get; set; } = string.Empty;
    public Guid ShiftId { get; set; }
    public Guid? GateCameraId { get; set; }
    public DateOnly WorkDate { get; set; }
    public DateTimeOffset? CheckInTime { get; set; }
    public DateTimeOffset? CheckOutTime { get; set; }
    public DateTimeOffset? LastSeenTime { get; set; }
    public string Status { get; set; } = "ON_TIME"; // ON_TIME, LATE, EARLY_LEAVE, ABSENT, REVOKED
    public int LateMinutes { get; set; }
    public int EarlyLeaveMinutes { get; set; }
    public float MatchConfidence { get; set; }
    public string? CheckinSnapshotKey { get; set; }
    public bool IsManuallyAdjusted { get; set; }
    public string? AdjustmentReason { get; set; }
    public Guid? AdjustedByUserId { get; set; }
    public string? AdjustedByName { get; set; }
    public DateTimeOffset? AdjustedAt { get; set; }
}

public sealed class AttendanceAdjustmentAudit : BaseEntity
{
    public Guid AttendanceLogId { get; set; }
    public Guid EmployeeId { get; set; }
    public string EmployeeCode { get; set; } = string.Empty;
    public string EmployeeFullName { get; set; } = string.Empty;
    public Guid DepartmentId { get; set; }
    public DateOnly WorkDate { get; set; }
    public string ActionType { get; set; } = "ADJUST"; // MANUAL_CREATE, ADJUST, REVOKE_PENALTY, VOID_ERRONEOUS
    public string? PreviousStatus { get; set; }
    public string? NewStatus { get; set; }
    public DateTimeOffset? PreviousCheckInTime { get; set; }
    public DateTimeOffset? NewCheckInTime { get; set; }
    public DateTimeOffset? PreviousCheckOutTime { get; set; }
    public DateTimeOffset? NewCheckOutTime { get; set; }
    public int PreviousLateMinutes { get; set; }
    public int NewLateMinutes { get; set; }
    public int PreviousEarlyLeaveMinutes { get; set; }
    public int NewEarlyLeaveMinutes { get; set; }
    public string? PreviousSnapshotKey { get; set; }
    public bool IsStatusOverridden { get; set; }
    public string Reason { get; set; } = string.Empty;
    public string? SourceScreen { get; set; }
    public Guid AdjustedByUserId { get; set; }
    public string AdjustedByUsername { get; set; } = string.Empty;
    public string AdjustedByName { get; set; } = string.Empty;
    public string AdjustedByRole { get; set; } = string.Empty;
}

public sealed class LeaveRequest : BaseEntity
{
    public Guid EmployeeId { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public TimeOnly StartTime { get; set; } = new(8, 0);
    public TimeOnly EndTime { get; set; } = new(17, 30);
    public string LeaveType { get; set; } = "ANNUAL_LEAVE";
    public bool IsPaid { get; set; } = true;
    public string? Reason { get; set; }
    public string ApprovalStatus { get; set; } = "APPROVED";
    public Guid? ApprovedByUserId { get; set; }
}

