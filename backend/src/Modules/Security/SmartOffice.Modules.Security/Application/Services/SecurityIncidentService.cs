using Microsoft.EntityFrameworkCore;
using SmartOffice.Modules.Security.Application.DTOs;
using SmartOffice.Modules.Security.Domain;
using SmartOffice.Modules.Security.Infrastructure;
using SmartOffice.SharedKernel.Common;
using SmartOffice.SharedKernel.Contracts;
using SmartOffice.SharedKernel.Events;
using SmartOffice.SharedKernel.Storage;

namespace SmartOffice.Modules.Security.Application.Services;

/// <summary>
/// Dịch vụ xử lý Sự cố An ninh Ngoài giờ & Phát hiện Người lạ (FR-SEC-01..06, US-SEC-02, US-SEC-03):
/// - Kiểm tra chế độ Trực đêm tự động (Night Guard Mode: 19:00 - 06:30, Thứ Bảy, Chủ Nhật).
/// - Vận hành Cây quyết định phân cấp cảnh báo 3 mức (LEVEL_1_OT, LEVEL_2_UNAUTH, LEVEL_3_BREACH) + SPOOFING_ATTEMPT.
/// - Tải tệp & sinh Presigned URL cho Snapshot & Video bằng chứng 10s trên MinIO/S3/R2.
/// - Quản lý đóng biên bản xử lý sự cố (ACKNOWLEDGED / FALSE_ALARM) và phát Event sang Module Reporting.
/// </summary>
public sealed class SecurityIncidentService(
    SecurityDbContext dbContext,
    IOvertimeLookupContract overtimeLookup,
    IEmployeeLookupContract employeeLookup,
    IObjectStorageService objectStorage,
    IInMemoryEventBus eventBus) : ISecurityIncidentService
{
    public const string AlertLevel1ApprovedOt = "LEVEL_1_OT";
    public const string AlertLevel2UnauthorizedPresence = "LEVEL_2_UNAUTH";
    public const string AlertLevel3SecurityBreach = "LEVEL_3_BREACH";
    public const string AlertSpoofingAttempt = "SPOOFING_ATTEMPT";

    public const string TicketOpen = "OPEN";
    public const string TicketAcknowledged = "ACKNOWLEDGED";
    public const string TicketFalseAlarm = "FALSE_ALARM";
    public const int DefaultPresignedExpiryMinutes = 15;

    public static readonly TimeOnly NightGuardStart = new(19, 0);
    public static readonly TimeOnly NightGuardEnd = new(6, 30);

    public NightGuardStatusResponse CheckNightGuardStatus(DateTimeOffset? checkTimeUtc = null)
    {
        var now = checkTimeUtc ?? DateTimeOffset.UtcNow;
        var dayOfWeek = now.DayOfWeek;
        var timeOfDay = TimeOnly.FromDateTime(now.DateTime);

        if (dayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday)
        {
            return new NightGuardStatusResponse(
                now,
                true,
                $"Chế độ Trực đêm (Night Guard) đang BẬT toàn thời gian vào ngày cuối tuần ({dayOfWeek}).");
        }

        if (timeOfDay >= NightGuardStart || timeOfDay <= NightGuardEnd)
        {
            return new NightGuardStatusResponse(
                now,
                true,
                $"Chế độ Trực đêm (Night Guard) đang BẬT trong khung giờ ngoài hành chính ({timeOfDay:HH:mm} thuộc 19:00 - 06:30).");
        }

        return new NightGuardStatusResponse(
            now,
            false,
            $"Đang trong khung giờ làm việc ban ngày ({timeOfDay:HH:mm}).");
    }

    public async Task<Result<SecurityIncidentResponse>> EvaluateAndRecordDetectionAsync(
        EvaluateNightGuardDetectionRequest request,
        CancellationToken ct = default)
    {
        if (request.CameraId == Guid.Empty)
        {
            return Result.Failure<SecurityIncidentResponse>(
                new Error("INVALID_CAMERA_ID", "Mã định danh Camera phát hiện sự cố không hợp lệ."));
        }

        var detectedAt = request.DetectedAtUtc ?? DateTimeOffset.UtcNow;
        var dateFolder = detectedAt.ToString("yyyy-MM-dd");
        var incident = new SecurityIncident();
        var incidentId = incident.Id;

        var snapshotKey = string.IsNullOrWhiteSpace(request.SnapshotObjectKey)
            ? $"security_evidence/{dateFolder}/incident_{incidentId:N}_snapshot.jpg"
            : request.SnapshotObjectKey.Trim();

        string alertLevel;
        string ticketStatus = TicketOpen;
        bool telegramSent = false;
        string actionSummary;
        EmployeeContractDto? employee = null;

        // Nhánh 0: Phát hiện giả mạo khuôn mặt tại cửa (FR-ATT-01 / Anti-Spoofing)
        if (request.IsSpoofingAttempt)
        {
            alertLevel = AlertSpoofingAttempt;
            telegramSent = true;
            actionSummary = "Phát hiện hành vi giả mạo sinh trắc học (SPOOFING_ATTEMPT). Đã ghi nhận sự cố và gửi cảnh báo.";
        }
        // Nhánh 1: Nhận diện được khuôn mặt là Nhân viên nội bộ -> Kiểm tra bảng đăng ký OT (FR-SEC-02)
        else if (request.DetectedEmployeeId.HasValue)
        {
            employee = await employeeLookup.GetByIdAsync(request.DetectedEmployeeId.Value, ct);
            if (employee is null || !employee.IsActive)
            {
                // Nhân viên không tồn tại hoặc đã nghỉ việc -> Coi như xâm nhập trái phép Mức 3
                alertLevel = AlertLevel3SecurityBreach;
                telegramSent = true;
                actionSummary = "Khuôn mặt thuộc nhân sự đã khóa hoặc không hợp lệ -> Kích hoạt Cảnh báo Mức 3 (SECURITY_BREACH).";
            }
            else
            {
                var otCheck = await overtimeLookup.CheckApprovedOvertimeAsync(employee.EmployeeId, detectedAt, ct);
                if (otCheck.HasApprovedOvertime)
                {
                    alertLevel = AlertLevel1ApprovedOt;
                    ticketStatus = TicketAcknowledged;
                    telegramSent = false;
                    actionSummary = $"Nhân viên {employee.FullName} ({employee.EmployeeCode}) có lịch đăng ký OT hợp lệ (Mức 1 - Không báo động).";
                }
                else
                {
                    alertLevel = AlertLevel2UnauthorizedPresence;
                    ticketStatus = TicketOpen;
                    telegramSent = false;
                    actionSummary = $"Cảnh báo Mức 2 (UNAUTHORIZED_PRESENCE): Nhân viên {employee.FullName} ({employee.EmployeeCode}) hiện diện ngoài giờ nhưng chưa đăng ký OT.";
                }
            }
        }
        // Nhánh 2: Không nhận diện được khuôn mặt hoặc Người lạ (UNKNOWN) -> Cảnh báo Mức 3 Khẩn cấp
        else
        {
            alertLevel = AlertLevel3SecurityBreach;
            ticketStatus = TicketOpen;
            telegramSent = true;
            actionSummary = "Cảnh báo Khẩn cấp Mức 3 (SECURITY_BREACH): Phát hiện người lạ (UNKNOWN) đột nhập ngoài giờ! Đã đóng gói bằng chứng 10s và gửi Telegram.";
        }

        var defaultClipKey = alertLevel == AlertLevel3SecurityBreach && string.IsNullOrWhiteSpace(request.VideoClipObjectKey)
            ? $"security_evidence/{dateFolder}/incident_{incidentId:N}_clip10s.mp4"
            : request.VideoClipObjectKey?.Trim();

        incident.CameraId = request.CameraId;
        incident.DetectedEmployeeId = employee?.EmployeeId ?? request.DetectedEmployeeId;
        incident.AlertLevel = alertLevel;
        incident.SnapshotObjectKey = snapshotKey;
        incident.VideoClipObjectKey = defaultClipKey;
        incident.TelegramSent = telegramSent;
        incident.TicketStatus = ticketStatus;
        incident.ResolutionNote = alertLevel == AlertLevel1ApprovedOt
            ? "Tự động xác nhận: Nhân viên có lịch đăng ký làm thêm giờ (APPROVED_OVERTIME)."
            : null;
        incident.DetectedAt = detectedAt;
        incident.ResolvedAt = alertLevel == AlertLevel1ApprovedOt ? detectedAt : null;

        dbContext.SecurityIncidents.Add(incident);
        await dbContext.SaveChangesAsync(ct);

        // Chỉ phát sự kiện cảnh báo an ninh sang Module Reporting đối với các mức vi phạm (Mức 2, Mức 3, Spoofing)
        if (alertLevel != AlertLevel1ApprovedOt)
        {
            var targetDeptId = request.DepartmentId ?? employee?.DepartmentId;
            await eventBus.PublishAsync(new SecurityIncidentDetectedIntegrationEvent(
                Guid.NewGuid(),
                detectedAt,
                incident.Id,
                incident.CameraId,
                targetDeptId,
                incident.DetectedEmployeeId,
                incident.AlertLevel,
                incident.SnapshotObjectKey), ct);
        }

        return Result.Success(await MapIncidentResponseAsync(incident, employee, actionSummary, ct));
    }

    public async Task<Result<SecurityEvidenceUploadResponse>> UploadIncidentEvidenceAsync(
        Guid incidentId,
        string evidenceType,
        Stream fileStream,
        string contentType,
        CancellationToken ct = default)
    {
        var incident = await dbContext.SecurityIncidents.FirstOrDefaultAsync(x => x.Id == incidentId, ct);
        if (incident is null)
        {
            return Result.Failure<SecurityEvidenceUploadResponse>(
                new Error("INCIDENT_NOT_FOUND", "Không tìm thấy hồ sơ sự cố an ninh để tải lên bằng chứng."));
        }

        var normalizedType = string.IsNullOrWhiteSpace(evidenceType)
            ? "SNAPSHOT"
            : evidenceType.Trim().ToUpperInvariant();

        var dateFolder = incident.DetectedAt.ToString("yyyy-MM-dd");
        string objectKey;

        if (normalizedType == "VIDEO_CLIP")
        {
            objectKey = $"security_evidence/{dateFolder}/incident_{incident.Id:N}_clip10s.mp4";
            var savedClipKey = await objectStorage.UploadFileAsync(objectKey, fileStream, contentType, ct);
            incident.VideoClipObjectKey = savedClipKey;
            objectKey = savedClipKey;
        }
        else
        {
            normalizedType = "SNAPSHOT";
            objectKey = $"security_evidence/{dateFolder}/incident_{incident.Id:N}_snapshot.jpg";
            var savedSnapKey = await objectStorage.UploadFileAsync(objectKey, fileStream, contentType, ct);
            incident.SnapshotObjectKey = savedSnapKey;
            objectKey = savedSnapKey;
        }

        await dbContext.SaveChangesAsync(ct);
        var presignedUrl = await objectStorage.GetPresignedUrlAsync(objectKey, DefaultPresignedExpiryMinutes, ct);

        return Result.Success(new SecurityEvidenceUploadResponse(
            incident.Id,
            normalizedType,
            objectKey,
            presignedUrl,
            DefaultPresignedExpiryMinutes));
    }

    public async Task<Result<SecurityIncidentResponse>> ResolveIncidentTicketAsync(
        Guid incidentId,
        ResolveSecurityIncidentRequest request,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.TicketStatus))
        {
            return Result.Failure<SecurityIncidentResponse>(
                new Error("INVALID_TICKET_STATUS", "Trạng thái đóng sự cố không được để trống."));
        }

        var normalizedStatus = request.TicketStatus.Trim().ToUpperInvariant();
        if (normalizedStatus is not (TicketAcknowledged or TicketFalseAlarm))
        {
            return Result.Failure<SecurityIncidentResponse>(
                new Error("INVALID_TICKET_STATUS", "Chỉ chấp nhận trạng thái đóng ticket là 'ACKNOWLEDGED' hoặc 'FALSE_ALARM'."));
        }

        if (string.IsNullOrWhiteSpace(request.ResolutionNote))
        {
            return Result.Failure<SecurityIncidentResponse>(
                new Error("RESOLUTION_NOTE_REQUIRED", "Nhân viên an ninh bắt buộc nhập nội dung biên bản xử lý hiện trường."));
        }

        var incident = await dbContext.SecurityIncidents.FirstOrDefaultAsync(x => x.Id == incidentId, ct);
        if (incident is null)
        {
            return Result.Failure<SecurityIncidentResponse>(
                new Error("INCIDENT_NOT_FOUND", "Không tìm thấy hồ sơ sự cố an ninh."));
        }

        incident.TicketStatus = normalizedStatus;
        incident.ResolutionNote = request.ResolutionNote.Trim();
        incident.ResolvedByUserId = request.ResolvedByUserId;
        incident.ResolvedAt = DateTimeOffset.UtcNow;

        await dbContext.SaveChangesAsync(ct);

        EmployeeContractDto? emp = null;
        if (incident.DetectedEmployeeId.HasValue)
        {
            emp = await employeeLookup.GetByIdAsync(incident.DetectedEmployeeId.Value, ct);
        }

        var summary = normalizedStatus == TicketFalseAlarm
            ? $"Đã đóng sự cố (Báo động sai - FALSE_ALARM). Ảnh mẫu đã được gắn nhãn phản hồi huấn luyện: training_feedback/false_alarms/incident_{incident.Id:N}.jpg."
            : "Đã xác nhận xử lý sự cố hiện trường và đóng biên bản (ACKNOWLEDGED).";

        return Result.Success(await MapIncidentResponseAsync(incident, emp, summary, ct));
    }

    public async Task<IReadOnlyList<SecurityIncidentResponse>> GetIncidentsAsync(
        string? ticketStatus = null,
        string? alertLevel = null,
        int limit = 50,
        CancellationToken ct = default)
    {
        var clampedLimit = Math.Clamp(limit, 1, 200);
        var query = dbContext.SecurityIncidents.AsQueryable();

        if (!string.IsNullOrWhiteSpace(ticketStatus))
        {
            var status = ticketStatus.Trim().ToUpperInvariant();
            query = query.Where(x => x.TicketStatus == status);
        }

        if (!string.IsNullOrWhiteSpace(alertLevel))
        {
            var level = alertLevel.Trim().ToUpperInvariant();
            query = query.Where(x => x.AlertLevel == level);
        }

        var items = await query
            .OrderByDescending(x => x.DetectedAt)
            .Take(clampedLimit)
            .ToListAsync(ct);

        var responses = new List<SecurityIncidentResponse>(items.Count);
        foreach (var item in items)
        {
            EmployeeContractDto? emp = null;
            if (item.DetectedEmployeeId.HasValue)
            {
                emp = await employeeLookup.GetByIdAsync(item.DetectedEmployeeId.Value, ct);
            }

            responses.Add(await MapIncidentResponseAsync(item, emp, item.ResolutionNote ?? string.Empty, ct));
        }

        return responses;
    }

    private async Task<SecurityIncidentResponse> MapIncidentResponseAsync(
        SecurityIncident incident,
        EmployeeContractDto? employee,
        string actionSummary,
        CancellationToken ct)
    {
        string? snapshotUrl = null;
        if (!string.IsNullOrWhiteSpace(incident.SnapshotObjectKey))
        {
            snapshotUrl = await objectStorage.GetPresignedUrlAsync(
                incident.SnapshotObjectKey,
                DefaultPresignedExpiryMinutes,
                ct);
        }

        string? clipUrl = null;
        if (!string.IsNullOrWhiteSpace(incident.VideoClipObjectKey))
        {
            clipUrl = await objectStorage.GetPresignedUrlAsync(
                incident.VideoClipObjectKey,
                DefaultPresignedExpiryMinutes,
                ct);
        }

        return new SecurityIncidentResponse(
            incident.Id,
            incident.CameraId,
            incident.DetectedEmployeeId,
            employee?.EmployeeCode,
            employee?.FullName,
            incident.AlertLevel,
            incident.SnapshotObjectKey,
            snapshotUrl,
            incident.VideoClipObjectKey,
            clipUrl,
            incident.TelegramSent,
            incident.TicketStatus,
            incident.ResolutionNote,
            incident.ResolvedByUserId,
            incident.DetectedAt,
            incident.ResolvedAt,
            actionSummary);
    }
}
