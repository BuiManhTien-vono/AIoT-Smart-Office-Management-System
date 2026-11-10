namespace SmartOffice.Modules.Security.Application.DTOs;

public sealed record EvaluateNightGuardDetectionRequest(
    Guid CameraId,
    Guid? DepartmentId = null,
    Guid? DetectedEmployeeId = null,
    float? MatchConfidence = null,
    string? SnapshotObjectKey = null,
    string? VideoClipObjectKey = null,
    DateTimeOffset? DetectedAtUtc = null,
    bool IsSpoofingAttempt = false);

public sealed record ResolveSecurityIncidentRequest(
    string TicketStatus,
    string ResolutionNote,
    Guid? ResolvedByUserId = null);

public sealed record SecurityIncidentResponse(
    Guid Id,
    Guid CameraId,
    Guid? DetectedEmployeeId,
    string? DetectedEmployeeCode,
    string? DetectedEmployeeName,
    string AlertLevel,
    string SnapshotObjectKey,
    string? SnapshotPresignedUrl,
    string? VideoClipObjectKey,
    string? VideoClipPresignedUrl,
    bool TelegramSent,
    string TicketStatus,
    string? ResolutionNote,
    Guid? ResolvedByUserId,
    DateTimeOffset DetectedAt,
    DateTimeOffset? ResolvedAt,
    string ActionSummary);

public sealed record SecurityEvidenceUploadResponse(
    Guid IncidentId,
    string EvidenceType,
    string ObjectKey,
    string PresignedViewUrl,
    int ExpiryMinutes);

public sealed record NightGuardStatusResponse(
    DateTimeOffset CheckedAtUtc,
    bool IsNightGuardActive,
    string Reason);
