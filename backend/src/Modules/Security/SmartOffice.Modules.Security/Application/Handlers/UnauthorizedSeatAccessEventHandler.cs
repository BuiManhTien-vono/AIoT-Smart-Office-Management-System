using SmartOffice.Modules.Security.Application.Services;
using SmartOffice.Modules.Security.Domain;
using SmartOffice.Modules.Security.Infrastructure;
using SmartOffice.SharedKernel.Events;

namespace SmartOffice.Modules.Security.Application.Handlers;

/// <summary>
/// Lắng nghe sự kiện xâm nhập vị trí bàn làm việc của nhân viên đang nghỉ phép từ Module Occupancy,
/// tự động tạo hồ sơ sự cố an ninh (LEVEL_3_BREACH nếu là người lạ chưa nhận diện, LEVEL_2_UNAUTH nếu là nhân viên khác)
/// và phát tiếp SecurityIncidentDetectedIntegrationEvent sang Module Reporting / SignalR Dashboard.
/// </summary>
public sealed class UnauthorizedSeatAccessEventHandler(
    SecurityDbContext dbContext,
    IInMemoryEventBus eventBus) : IIntegrationEventHandler<UnauthorizedSeatAccessDetectedIntegrationEvent>
{
    public async Task HandleAsync(
        UnauthorizedSeatAccessDetectedIntegrationEvent integrationEvent,
        CancellationToken cancellationToken = default)
    {
        bool isUnknownStranger = !integrationEvent.DetectedEmployeeId.HasValue;
        string alertLevel = isUnknownStranger
            ? SecurityIncidentService.AlertLevel3SecurityBreach
            : SecurityIncidentService.AlertLevel2UnauthorizedPresence;

        var detectedAt = integrationEvent.OccurredOnUtc;
        var dateFolder = detectedAt.ToString("yyyy-MM-dd");

        var incident = new SecurityIncident
        {
            CameraId = integrationEvent.CameraId,
            DetectedEmployeeId = integrationEvent.DetectedEmployeeId,
            AlertLevel = alertLevel,
            TicketStatus = SecurityIncidentService.TicketOpen,
            TelegramSent = isUnknownStranger,
            DetectedAt = detectedAt,
            ResolutionNote = isUnknownStranger
                ? $"Phát hiện người lạ (UNKNOWN) ngồi vào bàn {integrationEvent.SeatCode} khi chủ bàn đang nghỉ phép ({integrationEvent.LeaveType ?? "APPROVED_LEAVE"})."
                : $"Phát hiện nhân viên khác ngồi vào bàn {integrationEvent.SeatCode} khi chủ bàn đang nghỉ phép ({integrationEvent.LeaveType ?? "APPROVED_LEAVE"})."
        };

        incident.SnapshotObjectKey = $"security_evidence/{dateFolder}/incident_{incident.Id:N}_snapshot.jpg";
        incident.VideoClipObjectKey = isUnknownStranger
            ? $"security_evidence/{dateFolder}/incident_{incident.Id:N}_clip10s.mp4"
            : null;

        dbContext.SecurityIncidents.Add(incident);
        await dbContext.SaveChangesAsync(cancellationToken);

        await eventBus.PublishAsync(new SecurityIncidentDetectedIntegrationEvent(
            Guid.NewGuid(),
            detectedAt,
            incident.Id,
            incident.CameraId,
            integrationEvent.DepartmentId,
            incident.DetectedEmployeeId,
            incident.AlertLevel,
            incident.SnapshotObjectKey), cancellationToken);
    }
}

