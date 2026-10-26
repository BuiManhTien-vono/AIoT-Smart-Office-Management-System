using SmartOffice.SharedKernel.Domain;

namespace SmartOffice.Modules.Attendance.Domain;

public sealed class Shift : BaseEntity
{
    public string ShiftCode { get; set; } = string.Empty;
    public string ShiftName { get; set; } = string.Empty;
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
    public int GraceMinutes { get; set; } = 15;
    public TimeOnly LunchStart { get; set; } = new(12, 0);
    public TimeOnly LunchEnd { get; set; } = new(13, 30);
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
    public string Status { get; set; } = "ON_TIME";
    public int LateMinutes { get; set; }
    public int EarlyLeaveMinutes { get; set; }
    public float MatchConfidence { get; set; }
    public string? CheckinSnapshotKey { get; set; }
}

public sealed class LeaveRequest : BaseEntity
{
    public Guid EmployeeId { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public string LeaveType { get; set; } = "ANNUAL_LEAVE";
    public string? Reason { get; set; }
    public string ApprovalStatus { get; set; } = "APPROVED";
    public Guid? ApprovedByUserId { get; set; }
}
