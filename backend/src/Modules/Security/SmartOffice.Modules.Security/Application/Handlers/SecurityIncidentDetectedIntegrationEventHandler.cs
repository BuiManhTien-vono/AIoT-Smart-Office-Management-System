using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SmartOffice.Modules.Security.Domain;
using SmartOffice.Modules.Security.Infrastructure;
using SmartOffice.SharedKernel.Contracts;
using SmartOffice.SharedKernel.Events;

namespace SmartOffice.Modules.Security.Application.Handlers;

/// <summary>
/// Lắng nghe sự kiện phát hiện sự cố an ninh từ các Module khác (ví dụ Module Occupancy phát hiện
/// người lạ chiếm bàn chưa check-in hoặc hiện diện ngoài giờ chưa có đơn OT) để tự động lưu vết
/// vào bảng security.incidents của Module Security và gửi Telegram tới chính nhân viên liên quan.
/// </summary>
public sealed class SecurityIncidentDetectedIntegrationEventHandler(
    SecurityDbContext dbContext,
    IEmployeeTelegramNotifier? telegram = null,
    ILogger<SecurityIncidentDetectedIntegrationEventHandler>? logger = null)
    : IIntegrationEventHandler<SecurityIncidentDetectedIntegrationEvent>
{
    public async Task HandleAsync(
        SecurityIncidentDetectedIntegrationEvent integrationEvent,
        CancellationToken cancellationToken = default)
    {
        // Tránh trùng lặp nếu sự cố đã được lưu trước đó
        var exists = await dbContext.SecurityIncidents.AnyAsync(x => x.Id == integrationEvent.IncidentId, cancellationToken);
        if (exists)
        {
            return;
        }

        var detectedAt = integrationEvent.OccurredOnUtc;
        var dateFolder = detectedAt.ToString("yyyy-MM-dd");
        var snapshotKey = string.IsNullOrWhiteSpace(integrationEvent.SnapshotObjectKey)
            ? $"security_evidence/{dateFolder}/incident_{integrationEvent.IncidentId:N}_snapshot.jpg"
            : integrationEvent.SnapshotObjectKey.Trim();

        var severity = integrationEvent.AlertLevel == "LEVEL_3_BREACH"
            ? "CRITICAL"
            : integrationEvent.AlertLevel == "LEVEL_2_UNAUTH"
                ? "HIGH"
                : "MEDIUM";

        // Gửi Telegram chỉ cho nhân viên liên quan tới bàn làm việc (người lạ tại bàn -> gửi cho chủ bàn; ngoài giờ -> gửi cho NV đó)
        bool telegramSent = false;
        if (telegram is not null && integrationEvent.DetectedEmployeeId.HasValue && !string.IsNullOrWhiteSpace(integrationEvent.SeatCode))
        {
            if (integrationEvent.IncidentType == "STRANGER_AT_UNCHECKED_DESK")
            {
                telegramSent = await telegram.SendToEmployeeAsync(
                    integrationEvent.DetectedEmployeeId.Value,
                    $"🚨 Cảnh báo bàn làm việc: Phát hiện người lạ ngồi tại bàn {integrationEvent.SeatCode} của bạn trong khi bạn chưa điểm danh vào công ty.",
                    cancellationToken);
            }
            else if (integrationEvent.IncidentType == "UNREGISTERED_AFTER_HOURS_PRESENCE")
            {
                telegramSent = await telegram.SendToEmployeeAsync(
                    integrationEvent.DetectedEmployeeId.Value,
                    $"⚠️ Cảnh báo ngoài giờ: Bạn đang hiện diện tại bàn {integrationEvent.SeatCode} ngoài ca làm việc mà chưa có đơn OT được phê duyệt.",
                    cancellationToken);
            }
        }

        var incident = new SecurityIncident
        {
            Id = integrationEvent.IncidentId,
            CameraId = integrationEvent.CameraId,
            DetectedEmployeeId = integrationEvent.DetectedEmployeeId,
            IncidentType = integrationEvent.IncidentType ?? "STRANGER_AT_UNCHECKED_DESK",
            SeatCode = integrationEvent.SeatCode,
            Severity = severity,
            AlertLevel = integrationEvent.AlertLevel,
            SnapshotObjectKey = snapshotKey,
            TelegramSent = telegramSent,
            TicketStatus = "OPEN",
            DetectedAt = detectedAt
        };

        dbContext.SecurityIncidents.Add(incident);
        await dbContext.SaveChangesAsync(cancellationToken);

        logger?.LogWarning(
            "[SECURITY-PERSIST] Đã lưu sự cố an ninh [{Type}] tại vị trí [{Seat}] vào CSDL Security (TelegramSent={Tele}). Mã sự cố: {Id}",
            incident.IncidentType,
            incident.SeatCode ?? "GATE",
            incident.TelegramSent,
            incident.Id);
    }
}
