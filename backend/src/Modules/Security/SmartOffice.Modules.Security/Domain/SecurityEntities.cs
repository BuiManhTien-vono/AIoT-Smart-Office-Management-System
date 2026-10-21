using SmartOffice.SharedKernel.Domain;

namespace SmartOffice.Modules.Security.Domain;

public sealed class OtRegistration : BaseEntity
{
    public Guid EmployeeId { get; set; }
    public string EmployeeCode { get; set; } = string.Empty;
    public DateOnly OtDate { get; set; }
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
    public string? Reason { get; set; }
    public string ApprovalStatus { get; set; } = "APPROVED";
    public Guid? ApprovedByUserId { get; set; }
}

public sealed class SecurityIncident : BaseEntity
{
    public Guid CameraId { get; set; }
    public Guid? DetectedEmployeeId { get; set; }
    public string AlertLevel { get; set; } = "LEVEL_3_BREACH";
    public string SnapshotObjectKey { get; set; } = string.Empty;
    public string? VideoClipObjectKey { get; set; }
    public bool TelegramSent { get; set; }
    public string TicketStatus { get; set; } = "OPEN";
    public string? ResolutionNote { get; set; }
    public Guid? ResolvedByUserId { get; set; }
    public DateTimeOffset DetectedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ResolvedAt { get; set; }
}
