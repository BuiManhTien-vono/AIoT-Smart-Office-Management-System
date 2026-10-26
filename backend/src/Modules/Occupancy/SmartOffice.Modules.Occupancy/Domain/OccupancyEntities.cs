using SmartOffice.SharedKernel.Domain;

namespace SmartOffice.Modules.Occupancy.Domain;

public sealed class Camera : BaseEntity
{
    public string CameraCode { get; set; } = string.Empty;
    public string CameraName { get; set; } = string.Empty;
    public string CameraType { get; set; } = "DESK";
    public Guid? DepartmentId { get; set; }
    public string StreamSource { get; set; } = string.Empty;
    public string? CalibrationFrameKey { get; set; }
    public bool IsOnline { get; set; } = true;
}

public sealed class Seat : BaseEntity
{
    public string SeatCode { get; set; } = string.Empty;
    public string SeatName { get; set; } = string.Empty;
    public string ZoneType { get; set; } = "WORK_DESK";
    public Guid CameraId { get; set; }
    public Guid DepartmentId { get; set; }
    public Guid? AssignedEmployeeId { get; set; }
    public string PolygonPointsJson { get; set; } = "[]";
    public string CurrentState { get; set; } = "EMPTY";
    public int ActiveSecondsToday { get; set; }
    public DateTimeOffset StateUpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class SeatOccupancyLog : BaseEntity
{
    public Guid SeatId { get; set; }
    public Guid? DetectedEmployeeId { get; set; }
    public string PreviousState { get; set; } = string.Empty;
    public string NewState { get; set; } = string.Empty;
    public int DurationSeconds { get; set; }
    public DateTimeOffset RecordedAt { get; set; } = DateTimeOffset.UtcNow;
}

