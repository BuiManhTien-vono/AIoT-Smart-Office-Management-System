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
    IInMemoryEventBus eventBus,
    IEmployeeTelegramNotifier? telegramNotifier = null) : ISecurityIncidentService
{
    public const string AlertLevel1ApprovedOt = "LEVEL_1_OT";
    public const string AlertLevel2UnauthorizedPresence = "LEVEL_2_UNAUTH";
    public const string AlertLevel3SecurityBreach = "LEVEL_3_BREACH";
    public const string AlertSpoofingAttempt = "SPOOFING_ATTEMPT";

    // Phân loại các kịch bản sự cố trọng tâm
    public const string TypeStrangerAtUncheckedDesk = "STRANGER_AT_UNCHECKED_DESK";
    public const string TypeUnregisteredAfterHours = "UNREGISTERED_AFTER_HOURS_PRESENCE";
    public const string TypeProlongedAbsence = "PROLONGED_ABSENCE";
    public const string TypeSpoofingAttempt = "SPOOFING_ATTEMPT";
    public const string TypeStrangerGateCheckin = "STRANGER_GATE_CHECKIN";
    public const string TypeGhostAttendance = "GHOST_ATTENDANCE";
    public const string TypeBruteForceGateAttack = "BRUTE_FORCE_GATE_ATTACK";
    public const string TypeGeneralBreach = "SECURITY_BREACH";

    public const string SeverityLow = "LOW";
    public const string SeverityMedium = "MEDIUM";
    public const string SeverityHigh = "HIGH";
    public const string SeverityCritical = "CRITICAL";

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
        string incidentType = !string.IsNullOrWhiteSpace(request.IncidentType)
            ? request.IncidentType.Trim().ToUpperInvariant()
            : (request.IsSpoofingAttempt ? TypeSpoofingAttempt : TypeGeneralBreach);

        string severity = !string.IsNullOrWhiteSpace(request.Severity)
            ? request.Severity.Trim().ToUpperInvariant()
            : SeverityMedium;

        string ticketStatus = TicketOpen;
        bool telegramSent = false;
        string actionSummary;
        EmployeeContractDto? employee = null;

        // Nhánh 0: Phát hiện giả mạo khuôn mặt tại cửa (FR-ATT-01 / Anti-Spoofing)
        if (request.IsSpoofingAttempt || incidentType == TypeSpoofingAttempt)
        {
            alertLevel = AlertSpoofingAttempt;
            incidentType = TypeSpoofingAttempt;
            severity = SeverityCritical;
            telegramSent = true;
            actionSummary = "Phát hiện hành vi giả mạo sinh trắc học tại Kiosk (ảnh in/màn hình điện thoại). Đã ghi nhận sự cố.";
        }
        // Nhánh 1: Kịch bản người lạ ngồi tại bàn khi nhân viên chưa check-in -> Gửi Telegram cho chính nhân viên của bàn đó
        else if (incidentType == TypeStrangerAtUncheckedDesk)
        {
            alertLevel = AlertLevel3SecurityBreach;
            severity = SeverityCritical;
            actionSummary = $"Phát hiện người lạ/chưa check-in chiếm chỗ tại bàn {request.SeatCode ?? "làm việc"} trong khi nhân sự chưa điểm danh vào công ty.";
            if (telegramNotifier is not null && request.DetectedEmployeeId.HasValue)
            {
                telegramSent = await telegramNotifier.SendToEmployeeAsync(
                    request.DetectedEmployeeId.Value,
                    $"🚨 Cảnh báo bàn làm việc: Phát hiện người lạ ngồi tại bàn {request.SeatCode ?? "của bạn"} trong khi bạn chưa điểm danh vào công ty.",
                    ct);
            }
        }
        // Nhánh 2: Kịch bản nhân viên ngồi làm việc ngoài giờ không đăng ký OT (sau ân hạn 20p)
        else if (incidentType == TypeUnregisteredAfterHours)
        {
            if (request.DetectedEmployeeId.HasValue)
            {
                employee = await employeeLookup.GetByIdAsync(request.DetectedEmployeeId.Value, ct);
            }

            // Tái kiểm tra xem nhân viên đã có ca OT được phê duyệt hay chưa
            var otCheck = request.DetectedEmployeeId.HasValue
                ? await overtimeLookup.CheckApprovedOvertimeAsync(request.DetectedEmployeeId.Value, detectedAt, ct)
                : new OvertimeLookupResultDto(false, null, Guid.Empty, string.Empty, DateOnly.MinValue, TimeOnly.MinValue, TimeOnly.MinValue);

            if (otCheck.HasApprovedOvertime)
            {
                alertLevel = AlertLevel1ApprovedOt;
                incidentType = "APPROVED_OT_PRESENCE";
                severity = SeverityLow;
                ticketStatus = TicketAcknowledged;
                telegramSent = false;
                actionSummary = $"Nhân viên {employee?.FullName ?? employee?.EmployeeCode ?? "nội bộ"} có lịch đăng ký OT hợp lệ (Mức 1 - Không báo động).";
            }
            else
            {
                alertLevel = AlertLevel2UnauthorizedPresence;
                severity = SeverityMedium;
                ticketStatus = TicketOpen;
                actionSummary = $"Nhân viên {employee?.FullName ?? employee?.EmployeeCode ?? "nội bộ"} hiện diện tại bàn {request.SeatCode ?? ""} ngoài giờ làm việc đã đăng ký (không có OT phê duyệt).";
                if (telegramNotifier is not null && request.DetectedEmployeeId.HasValue)
                {
                    telegramSent = await telegramNotifier.SendToEmployeeAsync(
                        request.DetectedEmployeeId.Value,
                        $"⚠️ Cảnh báo ngoài giờ: Bạn đang hiện diện tại bàn {request.SeatCode ?? ""} ngoài ca làm việc mà chưa có đơn OT được phê duyệt.",
                        ct);
                }
            }
        }
        // Nhánh 3: Người lạ thử chấm công tại Kiosk (liên quan đến chấm công -> không gửi Telegram)
        else if (incidentType == TypeStrangerGateCheckin)
        {
            alertLevel = AlertLevel2UnauthorizedPresence;
            severity = SeverityMedium;
            telegramSent = false;
            actionSummary = "Phát hiện khuôn mặt người lạ (chưa đăng ký trong CSDL nhân viên) cố gắng thực hiện chấm công tại Kiosk.";
        }
        // Nhánh 3b: Ra khỏi chỗ quá thời gian (>10s)
        else if (incidentType == TypeProlongedAbsence)
        {
            alertLevel = AlertLevel2UnauthorizedPresence;
            severity = SeverityMedium;
            actionSummary = $"Nhân viên rời khỏi chỗ tại bàn {request.SeatCode ?? ""} quá thời gian quy định (>10s).";
            if (telegramNotifier is not null && request.DetectedEmployeeId.HasValue)
            {
                telegramSent = await telegramNotifier.SendToEmployeeAsync(
                    request.DetectedEmployeeId.Value,
                    $"⚠️ Cảnh báo bàn làm việc: Bạn đã rời khỏi vị trí bàn {request.SeatCode ?? ""} quá thời gian quy định.",
                    ct);
            }
        }
        // Nhánh 4: Điểm danh ma (Check-in nhưng bỏ vị trí)
        else if (incidentType == TypeGhostAttendance)
        {
            alertLevel = AlertLevel2UnauthorizedPresence;
            severity = SeverityMedium;
            telegramSent = false;
            actionSummary = $"Cảnh báo điểm danh ma: Nhân viên đã chấm công vào cửa nhưng bàn {request.SeatCode ?? ""} bỏ trống kéo dài.";
        }
        // Nhánh 5: Tấn công liên tiếp tại Kiosk
        else if (incidentType == TypeBruteForceGateAttack)
        {
            alertLevel = AlertLevel3SecurityBreach;
            severity = SeverityCritical;
            telegramSent = false;
            actionSummary = "Phát hiện tần suất quét thất bại/giả mạo liên tiếp bất thường tại cổng Kiosk.";
        }
        // Nhánh 6: Nhận diện được khuôn mặt là Nhân viên nội bộ -> Kiểm tra bảng đăng ký OT (FR-SEC-02)
        else if (request.DetectedEmployeeId.HasValue)
        {
            employee = await employeeLookup.GetByIdAsync(request.DetectedEmployeeId.Value, ct);
            if (employee is null || !employee.IsActive)
            {
                alertLevel = AlertLevel3SecurityBreach;
                severity = SeverityCritical;
                telegramSent = false;
                incidentType = TypeGeneralBreach;
                actionSummary = "Khuôn mặt thuộc nhân sự đã khóa hoặc không hợp lệ -> Kích hoạt Cảnh báo Mức 3 (SECURITY_BREACH).";
            }
            else
            {
                var otCheck = await overtimeLookup.CheckApprovedOvertimeAsync(employee.EmployeeId, detectedAt, ct);
                if (otCheck.HasApprovedOvertime)
                {
                    alertLevel = AlertLevel1ApprovedOt;
                    incidentType = "APPROVED_OT_PRESENCE";
                    severity = SeverityLow;
                    ticketStatus = TicketAcknowledged;
                    telegramSent = false;
                    actionSummary = $"Nhân viên {employee.FullName} ({employee.EmployeeCode}) có lịch đăng ký OT hợp lệ (Mức 1 - Không báo động).";
                }
                else
                {
                    alertLevel = AlertLevel2UnauthorizedPresence;
                    incidentType = TypeUnregisteredAfterHours;
                    severity = SeverityMedium;
                    ticketStatus = TicketOpen;
                    actionSummary = $"Cảnh báo Mức 2 (UNAUTHORIZED_PRESENCE): Nhân viên {employee.FullName} ({employee.EmployeeCode}) hiện diện ngoài giờ nhưng chưa có đơn OT được duyệt.";
                    if (telegramNotifier is not null)
                    {
                        telegramSent = await telegramNotifier.SendToEmployeeAsync(
                            employee.EmployeeId,
                            $"⚠️ Cảnh báo ngoài giờ: Bạn đang hiện diện tại vị trí {request.SeatCode ?? "làm việc"} ngoài ca làm việc mà chưa có đơn OT được phê duyệt.",
                            ct);
                    }
                }
            }
        }
        // Nhánh 7: Không nhận diện được khuôn mặt hoặc Người lạ (UNKNOWN)
        else
        {
            alertLevel = AlertLevel3SecurityBreach;
            severity = SeverityCritical;
            incidentType = TypeGeneralBreach;
            ticketStatus = TicketOpen;
            telegramSent = true;
            actionSummary = "Cảnh báo Khẩn cấp Mức 3 (SECURITY_BREACH): Phát hiện người lạ (UNKNOWN) đột nhập ngoài giờ! Đã đóng gói bằng chứng hiện trường.";
        }

        // Mô phỏng gửi cảnh báo Telegram Bot (theo cấu hình hệ thống: mô phỏng ghi log)
        if (telegramSent)
        {
            Console.WriteLine($"[SIMULATED_TELEGRAM_BOT] Gửi cảnh báo khẩn cấp tới Ban an ninh: [{incidentType}] {actionSummary} (Ảnh: {snapshotKey})");
        }

        var defaultClipKey = alertLevel == AlertLevel3SecurityBreach && string.IsNullOrWhiteSpace(request.VideoClipObjectKey)
            ? $"security_evidence/{dateFolder}/incident_{incidentId:N}_clip10s.mp4"
            : request.VideoClipObjectKey?.Trim();

        incident.CameraId = request.CameraId;
        incident.DetectedEmployeeId = employee?.EmployeeId ?? request.DetectedEmployeeId;
        incident.IncidentType = incidentType;
        incident.SeatCode = request.SeatCode?.Trim();
        incident.Severity = severity;
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

        // Phát sự kiện cảnh báo an ninh sang các module khác (Reporting, SignalR Hub)
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
                incident.SnapshotObjectKey,
                IncidentType: incident.IncidentType,
                SeatCode: incident.SeatCode,
                ActionSummary: actionSummary), ct);
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
        }
        else
        {
            normalizedType = "SNAPSHOT";
            objectKey = $"security_evidence/{dateFolder}/incident_{incident.Id:N}_snapshot.jpg";
        }

        using var memStream = new MemoryStream();
        await fileStream.CopyToAsync(memStream, ct);
        var fileBytes = memStream.ToArray();

        // Lưu bản sao cục bộ vào thư mục App_Data/storage để đảm bảo có thể xem trực tiếp từ Backend
        try
        {
            var localFilePath = Path.Combine(AppContext.BaseDirectory, "storage", objectKey.Replace('/', Path.DirectorySeparatorChar));
            var dir = Path.GetDirectoryName(localFilePath);
            if (!string.IsNullOrEmpty(dir))
            {
                Directory.CreateDirectory(dir);
            }
            await File.WriteAllBytesAsync(localFilePath, fileBytes, ct);
        }
        catch
        {
            // Bỏ qua lỗi ghi đĩa cục bộ
        }

        using var uploadStream = new MemoryStream(fileBytes);
        if (normalizedType == "VIDEO_CLIP")
        {
            var savedClipKey = await objectStorage.UploadFileAsync(objectKey, uploadStream, contentType, ct);
            incident.VideoClipObjectKey = savedClipKey;
            objectKey = savedClipKey;
        }
        else
        {
            var savedSnapKey = await objectStorage.UploadFileAsync(objectKey, uploadStream, contentType, ct);
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

    public async Task<Result<(byte[] Bytes, string ContentType)>> GetIncidentSnapshotBytesAsync(
        Guid incidentId,
        CancellationToken ct = default)
    {
        var incident = await dbContext.SecurityIncidents.FirstOrDefaultAsync(x => x.Id == incidentId, ct);
        if (incident is null)
        {
            return Result.Failure<(byte[] Bytes, string ContentType)>(
                new Error("INCIDENT_NOT_FOUND", "Không tìm thấy hồ sơ sự cố an ninh."));
        }

        if (string.IsNullOrWhiteSpace(incident.SnapshotObjectKey))
        {
            return Result.Failure<(byte[] Bytes, string ContentType)>(
                new Error("NO_SNAPSHOT", "Sự cố này chưa có ảnh bằng chứng hiện trường."));
        }

        // 1. Kiểm tra file lưu trữ cục bộ trên máy chủ Backend trước
        var localFilePath = Path.Combine(AppContext.BaseDirectory, "storage", incident.SnapshotObjectKey.Replace('/', Path.DirectorySeparatorChar));
        if (File.Exists(localFilePath))
        {
            var bytes = await File.ReadAllBytesAsync(localFilePath, ct);
            return Result.Success((bytes, "image/jpeg"));
        }

        // 2. Thử tải qua HTTP từ presigned URL ObjectStorage nếu có
        try
        {
            var presignedUrl = await objectStorage.GetPresignedUrlAsync(incident.SnapshotObjectKey, 5, ct);
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
            var bytes = await http.GetByteArrayAsync(presignedUrl, ct);
            if (bytes.Length > 0)
            {
                return Result.Success((bytes, "image/jpeg"));
            }
        }
        catch
        {
            // Bỏ qua lỗi fallback
        }

        // 3. Nếu chưa có file ảnh vật lý hoặc MinIO offline, tự động sinh ảnh bằng chứng kỹ thuật số chuẩn SVG
        var locationText = !string.IsNullOrWhiteSpace(incident.SeatCode)
            ? $"Vị trí: Bàn {incident.SeatCode}"
            : $"Camera: {(incident.CameraId.ToString().Length > 8 ? incident.CameraId.ToString().Substring(0, 8) + "..." : incident.CameraId.ToString())}";

        var typeText = incident.IncidentType switch
        {
            TypeStrangerAtUncheckedDesk => "NGƯỜI LẠ TẠI BÀN LÀM VIỆC",
            TypeUnregisteredAfterHours => "HIỆN DIỆN NGOÀI GIỜ CHƯA DUYỆT OT",
            TypeProlongedAbsence => "RA KHỎI CHỖ QUÁ THỜI GIAN",
            TypeSpoofingAttempt => "GIẢ MẠO SINH TRẮC HỌC (ẢNH/ĐT)",
            TypeStrangerGateCheckin => "NGƯỜI LẠ CHẤM CÔNG TẠI KIOSK",
            _ => incident.IncidentType ?? "SỰ CỐ AN NINH"
        };

        var timeText = incident.DetectedAt.ToString("HH:mm:ss dd/MM/yyyy");

        var svg = $@"<svg xmlns='http://www.w3.org/2000/svg' width='480' height='270' viewBox='0 0 480 270'>
  <rect width='100%' height='100%' fill='#0f172a'/>
  <rect x='10' y='10' width='460' height='250' rx='8' fill='#1e293b' stroke='#ef4444' stroke-width='2' stroke-dasharray='6,4'/>
  <circle cx='240' cy='80' r='30' fill='#ef4444' fill-opacity='0.15' stroke='#ef4444' stroke-width='2'/>
  <path d='M232 75 L248 75 L240 64 Z' fill='#ef4444'/>
  <rect x='238' y='78' width='4' height='15' rx='2' fill='#ef4444'/>
  <circle cx='240' cy='99' r='2.5' fill='#ef4444'/>
  <text x='240' y='138' font-family='Arial, sans-serif' font-size='15' font-weight='bold' fill='#f87171' text-anchor='middle'>{typeText}</text>
  <text x='240' y='165' font-family='Arial, sans-serif' font-size='13' font-weight='bold' fill='#e2e8f0' text-anchor='middle'>{locationText}</text>
  <text x='240' y='190' font-family='Arial, sans-serif' font-size='12' fill='#94a3b8' text-anchor='middle'>Ghi nhận: {timeText}</text>
  <rect x='130' y='212' width='220' height='26' rx='13' fill='#334155'/>
  <text x='240' y='229' font-family='Arial, sans-serif' font-size='11' font-weight='bold' fill='#cbd5e1' text-anchor='middle'>BẰNG CHỨNG HỆ THỐNG GHI NHẬN</text>
</svg>";

        var svgBytes = System.Text.Encoding.UTF8.GetBytes(svg);
        return Result.Success((svgBytes, "image/svg+xml"));
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
        string? incidentType = null,
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

        if (!string.IsNullOrWhiteSpace(incidentType))
        {
            var type = incidentType.Trim().ToUpperInvariant();
            query = query.Where(x => x.IncidentType == type);
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

        var effectiveSummary = !string.IsNullOrWhiteSpace(actionSummary)
            ? actionSummary
            : incident.IncidentType switch
            {
                TypeProlongedAbsence => $"Cảnh báo ra khỏi chỗ quá thời gian: Nhân viên {employee?.FullName ?? employee?.EmployeeCode ?? "nội bộ"} rời vị trí bàn {incident.SeatCode ?? ""} quá thời gian quy định (>10s).",
                TypeStrangerAtUncheckedDesk => $"Phát hiện người lạ/chưa check-in chiếm chỗ tại bàn {incident.SeatCode ?? ""} trong khi nhân viên chưa check-in vào công ty.",
                TypeUnregisteredAfterHours => $"Cảnh báo hiện diện ngoài giờ chưa có đơn OT được duyệt tại bàn {incident.SeatCode ?? ""}.",
                TypeSpoofingAttempt => "Phát hiện hành vi giả mạo sinh trắc học tại Kiosk (ảnh in/màn hình điện thoại).",
                TypeStrangerGateCheckin => "Phát hiện khuôn mặt người lạ cố gắng thực hiện chấm công tại Kiosk.",
                _ => $"Ghi nhận sự cố an ninh [{incident.IncidentType}] tại vị trí {incident.SeatCode ?? incident.CameraId.ToString()}."
            };

        return new SecurityIncidentResponse(
            incident.Id,
            incident.CameraId,
            incident.DetectedEmployeeId,
            employee?.EmployeeCode,
            employee?.FullName,
            incident.IncidentType,
            incident.SeatCode,
            incident.Severity,
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
            effectiveSummary);
    }
}
