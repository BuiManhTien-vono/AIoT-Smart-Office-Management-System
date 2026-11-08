using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartOffice.Infrastructure;
using SmartOffice.Infrastructure.Storage;
using SmartOffice.Modules.Attendance.Application.DTOs;
using SmartOffice.Modules.Attendance.Application.Services;
using SmartOffice.Modules.Attendance.Infrastructure;
using SmartOffice.Modules.Biometrics.Application.DTOs;
using SmartOffice.Modules.Biometrics.Application.Services;
using SmartOffice.Modules.Biometrics.Infrastructure;
using SmartOffice.Modules.Occupancy.Application.DTOs;
using SmartOffice.Modules.Occupancy.Application.Handlers;
using SmartOffice.Modules.Occupancy.Application.Services;
using SmartOffice.Modules.Occupancy.Domain;
using SmartOffice.Modules.Occupancy.Infrastructure;
using SmartOffice.Modules.Reporting.Application.DTOs;
using SmartOffice.Modules.Reporting.Application.Handlers;
using SmartOffice.Modules.Reporting.Application.Services;
using SmartOffice.Modules.Reporting.Infrastructure;
using SmartOffice.Modules.Security.Application.DTOs;
using SmartOffice.Modules.Security.Application.Services;
using SmartOffice.Modules.Security.Infrastructure;
using SmartOffice.SharedKernel.Contracts;
using SmartOffice.SharedKernel.Events;

namespace SmartOffice.UnitTests;

public class Week2OccupancyStorageAndOtTests
{
    private static ServiceProvider BuildFullModularServiceProvider(string dbName)
    {
        var services = new ServiceCollection();

        services.AddSharedInfrastructure();

        services.AddDbContext<BiometricsDbContext>(o => o.UseInMemoryDatabase($"{dbName}_biometrics"));
        services.AddDbContext<AttendanceDbContext>(o => o.UseInMemoryDatabase($"{dbName}_attendance"));
        services.AddDbContext<OccupancyDbContext>(o => o.UseInMemoryDatabase($"{dbName}_occupancy"));
        services.AddDbContext<SecurityDbContext>(o => o.UseInMemoryDatabase($"{dbName}_security"));
        services.AddDbContext<ReportingDbContext>(o => o.UseInMemoryDatabase($"{dbName}_reporting"));

        // Services & Contracts của cả 5 Module
        services.AddScoped<IBiometricsService, BiometricsService>();
        services.AddScoped<IEmployeeLookupContract, BiometricsEmployeeLookupService>();
        services.AddScoped<IAttendanceService, AttendanceService>();
        services.AddScoped<IOccupancyService, OccupancyService>();
        services.AddScoped<IOtService, OtService>();
        services.AddScoped<IOvertimeLookupContract, OtService>();
        services.AddScoped<ISecurityIncidentService, SecurityIncidentService>();
        services.AddScoped<IReportingService, ReportingService>();

        // Event Handlers
        services.AddScoped<IIntegrationEventHandler<EmployeeRegisteredIntegrationEvent>, EmployeeRegisteredEventHandler>();
        services.AddScoped<IIntegrationEventHandler<AttendanceCheckedIntegrationEvent>, AttendanceCheckedEventHandler>();
        services.AddScoped<IIntegrationEventHandler<AttendanceAbsentMarkedIntegrationEvent>, AttendanceAbsentMarkedEventHandler>();
        services.AddScoped<IIntegrationEventHandler<ProlongedAbsenceDetectedIntegrationEvent>, ProlongedAbsenceDetectedEventHandler>();
        services.AddScoped<IIntegrationEventHandler<SecurityIncidentDetectedIntegrationEvent>, SecurityIncidentDetectedEventHandler>();
        services.AddScoped<IIntegrationEventHandler<SeatStateChangedIntegrationEvent>, SeatStateChangedRealtimeHandler>();
        services.AddScoped<IIntegrationEventHandler<WrongSeatDetectedIntegrationEvent>, WrongSeatRealtimeHandler>();

        return services.BuildServiceProvider();
    }

    [Fact]
    public void PolygonValidator_And_RayCasting_Should_Validate_Normalized_Polygons_And_PointInPolygon()
    {
        // 1. Ít hơn 3 đỉnh -> Lỗi POLYGON_TOO_FEW_VERTICES
        var tooFew = PolygonValidator.Validate([new(0.1, 0.1), new(0.5, 0.5)]);
        Assert.True(tooFew.IsFailure);
        Assert.Equal("POLYGON_TOO_FEW_VERTICES", tooFew.Error.Code);

        // 2. Tọa độ ngoài miền [0.0, 1.0] -> Lỗi POLYGON_COORDINATE_OUT_OF_RANGE
        var outOfRange = PolygonValidator.Validate([new(0.1, 0.1), new(1.25, 0.1), new(0.5, 0.6)]);
        Assert.True(outOfRange.IsFailure);
        Assert.Equal("POLYGON_COORDINATE_OUT_OF_RANGE", outOfRange.Error.Code);

        // 3. Các đỉnh thẳng hàng (diện tích = 0) -> Lỗi POLYGON_ZERO_AREA
        var collinear = PolygonValidator.Validate([new(0.1, 0.1), new(0.2, 0.2), new(0.3, 0.3)]);
        Assert.True(collinear.IsFailure);
        Assert.Equal("POLYGON_ZERO_AREA", collinear.Error.Code);

        // 4. Đa giác bàn làm việc hợp lệ [0.10, 0.40] x [0.20, 0.60]
        var validDeskPolygon = new List<PolygonPointDto>
        {
            new(0.10, 0.20),
            new(0.40, 0.20),
            new(0.40, 0.60),
            new(0.10, 0.60)
        };
        var validResult = PolygonValidator.Validate(validDeskPolygon, "WORK_DESK");
        Assert.True(validResult.IsSuccess);

        // 5. Kiểm tra Ray Casting (FR-OCC-01)
        Assert.True(PolygonValidator.IsPointInPolygon(0.25, 0.45, validDeskPolygon));
        Assert.False(PolygonValidator.IsPointInPolygon(0.75, 0.45, validDeskPolygon));
    }

    [Fact]
    public async Task Occupancy_FSM_AntiFlicker_LunchMute_WrongSeat_And_ReportingEventSync_Should_Work_EndToEnd()
    {
        using var provider = BuildFullModularServiceProvider(nameof(Occupancy_FSM_AntiFlicker_LunchMute_WrongSeat_And_ReportingEventSync_Should_Work_EndToEnd));
        using var scope = provider.CreateScope();

        var biometricsService = scope.ServiceProvider.GetRequiredService<IBiometricsService>();
        var occupancyService = scope.ServiceProvider.GetRequiredService<IOccupancyService>();
        var reportingDb = scope.ServiceProvider.GetRequiredService<ReportingDbContext>();

        var dept = (await biometricsService.CreateDepartmentAsync(
            new CreateDepartmentRequest("DEPT_IT", "Phòng Kỹ thuật", null))).Value;

        var empOwner = (await biometricsService.CreateEmployeeAsync(
            new CreateEmployeeRequest("NV001", "Nguyễn Văn Chủ Bàn", null, null, dept.Id, null, null))).Value;

        var empOther = (await biometricsService.CreateEmployeeAsync(
            new CreateEmployeeRequest("NV002", "Trần Văn Ngồi Nhầm", null, null, dept.Id, null, null))).Value;

        var camera = (await occupancyService.CreateCameraAsync(
            new CreateCameraRequest("CAM_DESK_IT", "Camera Phòng IT", "rtsp://localhost:8554/desk_it", "DESK", dept.Id))).Value;

        await using var frameStream = new MemoryStream(Encoding.UTF8.GetBytes("fake-jpeg-calibration-frame-bytes"));
        var uploadFrameResult = await occupancyService.UploadCalibrationFrameAsync(camera.Id, frameStream, "image/jpeg");
        Assert.True(uploadFrameResult.IsSuccess);
        Assert.Equal("calibration/cam_desk_it_frame.jpg", uploadFrameResult.Value.ObjectKey);
        Assert.Contains("X-Amz-Algorithm=AWS4-HMAC-SHA256", uploadFrameResult.Value.PresignedUrl);

        var polygon = new List<PolygonPointDto>
        {
            new(0.12, 0.40),
            new(0.28, 0.40),
            new(0.28, 0.65),
            new(0.12, 0.65)
        };
        var seatResult = await occupancyService.CreateSeatAsync(
            new CreateSeatRequest("SEAT_IT_01", "Bàn IT Số 01", camera.Id, dept.Id, empOwner.Id, polygon));
        Assert.True(seatResult.IsSuccess);
        Assert.Equal(SeatStateMachine.StateEmpty, seatResult.Value.CurrentState);

        var zoneConfig = await occupancyService.GetCameraZoneConfigAsync("CAM_DESK_IT");
        Assert.True(zoneConfig.IsSuccess);
        Assert.Single(zoneConfig.Value.Zones);

        var baseDate = new DateTimeOffset(2026, 11, 3, 9, 0, 0, TimeSpan.Zero);

        // [09:00:00] NV001 ngồi vào bàn -> Chuyển EMPTY -> PRESENT
        var sync1 = (await occupancyService.SyncOccupancyStateAsync(new OccupancyStateSyncRequest(
            "CAM_DESK_IT",
            baseDate,
            FrameSequence: 1,
            [new SeatObservationInput("SEAT_IT_01", IsOccupied: true, DetectedEmployeeId: empOwner.Id)]))).Value;

        Assert.Equal(1, sync1.TransitionsCount);
        Assert.Equal(SeatStateMachine.StatePresent, sync1.Results[0].NewState);

        // [09:05:00] NV001 tiếp tục ngồi làm việc -> Giữ PRESENT, cộng dồn ActiveSecondsToday = 300s
        var sync2 = (await occupancyService.SyncOccupancyStateAsync(new OccupancyStateSyncRequest(
            "CAM_DESK_IT",
            baseDate.AddMinutes(5),
            FrameSequence: 2,
            [new SeatObservationInput("SEAT_IT_01", IsOccupied: true, DetectedEmployeeId: empOwner.Id)]))).Value;

        Assert.Equal(0, sync2.TransitionsCount);
        Assert.Equal(300, sync2.Results[0].ActiveSecondsToday);

        // [09:05:02] Nhiễu cử động nhỏ 2 giây / 8 frames (< 3s / 15 frames) -> Anti-Flicker giữ nguyên PRESENT!
        var syncFlicker = (await occupancyService.SyncOccupancyStateAsync(new OccupancyStateSyncRequest(
            "CAM_DESK_IT",
            baseDate.AddMinutes(5).AddSeconds(2),
            FrameSequence: 3,
            [new SeatObservationInput("SEAT_IT_01", IsOccupied: false, UnoccupiedContinuousFrames: 8, UnoccupiedContinuousSeconds: 2)]))).Value;

        Assert.Equal(0, syncFlicker.TransitionsCount);
        Assert.Equal(SeatStateMachine.StatePresent, syncFlicker.Results[0].NewState);

        // [09:06:00] Rời bàn 60 giây / 45 frames (>= 3s & < 15p) -> Chuyển PRESENT -> TEMP_AWAY
        var syncTempAway = (await occupancyService.SyncOccupancyStateAsync(new OccupancyStateSyncRequest(
            "CAM_DESK_IT",
            baseDate.AddMinutes(6),
            FrameSequence: 4,
            [new SeatObservationInput("SEAT_IT_01", IsOccupied: false, UnoccupiedContinuousFrames: 45, UnoccupiedContinuousSeconds: 60)]))).Value;

        Assert.Equal(1, syncTempAway.TransitionsCount);
        Assert.Equal(SeatStateMachine.StateTempAway, syncTempAway.Results[0].NewState);

        // [12:25:00] Trong giờ nghỉ trưa (12:00 - 13:30), vắng 25 phút (1500s >= 900s) -> Lunchtime Mute giữ TEMP_AWAY!
        var lunchTime = new DateTimeOffset(2026, 11, 3, 12, 25, 0, TimeSpan.Zero);
        var syncLunchMute = (await occupancyService.SyncOccupancyStateAsync(new OccupancyStateSyncRequest(
            "CAM_DESK_IT",
            lunchTime,
            FrameSequence: 5,
            [new SeatObservationInput("SEAT_IT_01", IsOccupied: false, UnoccupiedContinuousFrames: 500, UnoccupiedContinuousSeconds: 1500)]))).Value;

        Assert.Equal(SeatStateMachine.StateTempAway, syncLunchMute.Results[0].NewState);
        Assert.True(syncLunchMute.Results[0].IsLunchMuted);
        Assert.False(syncLunchMute.Results[0].ProlongedAbsenceAlertTriggered);

        // [14:00:00] Ngoài giờ nghỉ trưa, vắng 16 phút (960s >= 900s) -> Chuyển sang PROLONGED_AWAY & bắn Event sang Reporting!
        var afternoonTime = new DateTimeOffset(2026, 11, 3, 14, 0, 0, TimeSpan.Zero);
        var syncProlonged = (await occupancyService.SyncOccupancyStateAsync(new OccupancyStateSyncRequest(
            "CAM_DESK_IT",
            afternoonTime,
            FrameSequence: 6,
            [new SeatObservationInput("SEAT_IT_01", IsOccupied: false, UnoccupiedContinuousFrames: 600, UnoccupiedContinuousSeconds: 960)]))).Value;

        Assert.Equal(1, syncProlonged.TransitionsCount);
        Assert.Equal(SeatStateMachine.StateProlongedAway, syncProlonged.Results[0].NewState);
        Assert.True(syncProlonged.Results[0].ProlongedAbsenceAlertTriggered);

        var summary = await reportingDb.DailyDepartmentSummaries
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.DepartmentId == dept.Id && x.SummaryDate == new DateOnly(2026, 11, 3));
        Assert.NotNull(summary);
        Assert.Equal(1, summary.ProlongedAwayEvents);

        // [14:10:00] Nhân viên NV002 ngồi nhầm vào bàn của NV001 -> Chuyển sang WRONG_SEAT!
        var syncWrongSeat = (await occupancyService.SyncOccupancyStateAsync(new OccupancyStateSyncRequest(
            "CAM_DESK_IT",
            afternoonTime.AddMinutes(10),
            FrameSequence: 7,
            [new SeatObservationInput("SEAT_IT_01", IsOccupied: true, DetectedEmployeeId: empOther.Id)]))).Value;

        Assert.Equal(1, syncWrongSeat.TransitionsCount);
        Assert.Equal(SeatStateMachine.StateWrongSeat, syncWrongSeat.Results[0].NewState);
        Assert.True(syncWrongSeat.Results[0].WrongSeatAlertTriggered);

        var logs = await occupancyService.GetOccupancyLogsAsync(seatResult.Value.Id);
        Assert.Equal(4, logs.Count);
    }

    [Fact]
    public async Task Security_Overtime_IncidentDecisionTree_DailyAbsent_And_ReportingService_Should_Work_EndToEnd()
    {
        using var provider = BuildFullModularServiceProvider(nameof(Security_Overtime_IncidentDecisionTree_DailyAbsent_And_ReportingService_Should_Work_EndToEnd));
        using var scope = provider.CreateScope();

        var biometricsService = scope.ServiceProvider.GetRequiredService<IBiometricsService>();
        var attendanceService = scope.ServiceProvider.GetRequiredService<IAttendanceService>();
        var otService = scope.ServiceProvider.GetRequiredService<IOtService>();
        var incidentService = scope.ServiceProvider.GetRequiredService<ISecurityIncidentService>();
        var reportingService = scope.ServiceProvider.GetRequiredService<IReportingService>();

        var workDate = new DateOnly(2026, 11, 3);

        // 1. Tạo phòng ban, ca làm việc và 3 nhân viên (NV1 có OT, NV2 nghỉ phép, NV3 vắng không phép)
        var dept = (await biometricsService.CreateDepartmentAsync(
            new CreateDepartmentRequest("DEPT_SEC", "Phòng An ninh & Vận hành", null))).Value;

        var shift = (await attendanceService.CreateShiftAsync(
            new CreateShiftRequest("SHIFT_HC", "Ca Hành Chính", new TimeOnly(8, 0), new TimeOnly(17, 30), 15, IsDefault: true))).Value;

        var empWithOt = (await biometricsService.CreateEmployeeAsync(
            new CreateEmployeeRequest("NV201", "Phạm Văn Có OT", null, null, dept.Id, shift.Id, null))).Value;

        var empOnLeave = (await biometricsService.CreateEmployeeAsync(
            new CreateEmployeeRequest("NV202", "Lê Thị Nghỉ Phép", null, null, dept.Id, shift.Id, null))).Value;

        var empAbsent = (await biometricsService.CreateEmployeeAsync(
            new CreateEmployeeRequest("NV203", "Hoàng Văn Vắng Mặt", null, null, dept.Id, shift.Id, null))).Value;

        // 2. NV201 chấm công buổi sáng, NV202 có đơn nghỉ phép APPROVED, NV203 không đi làm -> Chạy tiến trình chốt ABSENT (FR-ATT-06)
        await attendanceService.ProcessCheckInOutAsync(new CheckAttendanceRequest(
            empWithOt.Id, null, 0.95f, null, new DateTimeOffset(2026, 11, 3, 7, 55, 0, TimeSpan.Zero)));

        await attendanceService.CreateLeaveRequestAsync(new CreateLeaveRequestDto(
            empOnLeave.Id, workDate, workDate, "ANNUAL_LEAVE", "Nghỉ phép năm"));

        var absentProcess = (await attendanceService.MarkDailyAbsentEmployeesAsync(workDate)).Value;
        Assert.Equal(1, absentProcess.NewlyMarkedAbsentCount);
        Assert.Contains("NV203", absentProcess.AbsentEmployeeCodes);

        // 3. Đăng ký OT qua nửa đêm (22:00 -> 02:00) cho NV201 và kiểm tra Cây quyết định 3 mức (FR-SEC-02)
        await otService.CreateOtRegistrationAsync(new CreateOtRegistrationRequest(
            empWithOt.Id, workDate, new TimeOnly(22, 0), new TimeOnly(2, 0), "Trực nâng cấp server", "APPROVED"));

        var cameraId = Guid.NewGuid();
        var nightTime = new DateTimeOffset(2026, 11, 3, 23, 15, 0, TimeSpan.Zero);

        // Nhánh Mức 1: NV201 có OT hợp lệ -> LEVEL_1_OT (Tự động ACKNOWLEDGED, không tính cảnh báo vi phạm)
        var level1 = (await incidentService.EvaluateAndRecordDetectionAsync(new EvaluateNightGuardDetectionRequest(
            cameraId, dept.Id, empWithOt.Id, 0.93f, null, null, nightTime))).Value;
        Assert.Equal(SecurityIncidentService.AlertLevel1ApprovedOt, level1.AlertLevel);
        Assert.Equal(SecurityIncidentService.TicketAcknowledged, level1.TicketStatus);

        // Nhánh Mức 2: NV203 không đăng ký OT mà xuất hiện ban đêm -> LEVEL_2_UNAUTH
        var level2 = (await incidentService.EvaluateAndRecordDetectionAsync(new EvaluateNightGuardDetectionRequest(
            cameraId, dept.Id, empAbsent.Id, 0.89f, null, null, nightTime.AddMinutes(5)))).Value;
        Assert.Equal(SecurityIncidentService.AlertLevel2UnauthorizedPresence, level2.AlertLevel);
        Assert.Equal(SecurityIncidentService.TicketOpen, level2.TicketStatus);

        // Nhánh Mức 3: Người lạ (UNKNOWN - DetectedEmployeeId = null) -> LEVEL_3_BREACH + TelegramSent = true
        var level3 = (await incidentService.EvaluateAndRecordDetectionAsync(new EvaluateNightGuardDetectionRequest(
            cameraId, dept.Id, null, 0.42f, null, null, nightTime.AddMinutes(10)))).Value;
        Assert.Equal(SecurityIncidentService.AlertLevel3SecurityBreach, level3.AlertLevel);
        Assert.True(level3.TelegramSent);
        Assert.NotNull(level3.SnapshotPresignedUrl);
        Assert.NotNull(level3.VideoClipPresignedUrl);

        // Bảo vệ đóng biên bản sự cố Mức 3 (ACKNOWLEDGED)
        var resolved = await incidentService.ResolveIncidentTicketAsync(
            level3.Id,
            new ResolveSecurityIncidentRequest("ACKNOWLEDGED", "Đã kiểm tra hiện trường, nhân viên vệ sinh tòa nhà."));
        Assert.True(resolved.IsSuccess);
        Assert.Equal("ACKNOWLEDGED", resolved.Value.TicketStatus);

        // 4. Kiểm tra Module 5 (ReportingService): RBAC User Auth + Báo cáo Tháng + Xuất CSV
        var createLead = await reportingService.CreateUserAsync(
            new CreateAppUserRequest("lead_sec", "Lead@1234", "Trưởng phòng An ninh", "DEPT_LEAD", dept.Id));
        Assert.True(createLead.IsSuccess);

        var loginResult = await reportingService.AuthenticateAsync(new LoginRequest("lead_sec", "Lead@1234"));
        Assert.True(loginResult.IsSuccess);
        Assert.False(string.IsNullOrWhiteSpace(loginResult.Value.AccessToken));

        var monthlyReport = await reportingService.GetMonthlyReportAsync(2026, 11, dept.Id);
        Assert.Equal(1, monthlyReport.TotalPresentManDays);
        Assert.Equal(1, monthlyReport.TotalAbsentManDays);
        Assert.Equal(2, monthlyReport.TotalSecurityAlerts); // Mức 2 + Mức 3 = 2 cảnh báo

        var csvBytes = await reportingService.ExportMonthlyReportCsvAsync(2026, 11, dept.Id);
        var csvText = Encoding.UTF8.GetString(csvBytes);
        Assert.Contains("SummaryDate,DepartmentCode,TotalEmployees,PresentCount,LateCount,AbsentCount", csvText);
    }

    [Fact]
    public async Task ObjectStorage_MinIO_PresignedGetPut_And_ModuleMediaUploads_Should_Work_EndToEnd()
    {
        using var provider = BuildFullModularServiceProvider(nameof(ObjectStorage_MinIO_PresignedGetPut_And_ModuleMediaUploads_Should_Work_EndToEnd));
        using var scope = provider.CreateScope();

        var biometricsService = scope.ServiceProvider.GetRequiredService<IBiometricsService>();
        var attendanceService = scope.ServiceProvider.GetRequiredService<IAttendanceService>();
        var incidentService = scope.ServiceProvider.GetRequiredService<ISecurityIncidentService>();

        // 1. Kiểm tra chặn Path Traversal trong S3ObjectStorageService
        Assert.Throws<ArgumentException>(() => S3ObjectStorageService.NormalizeAndValidateKey("../etc/passwd"));
        Assert.Throws<ArgumentException>(() => S3ObjectStorageService.NormalizeAndValidateKey("biometrics//avatar.jpg"));

        // 2. Tạo Phòng ban + Nhân viên + Ca làm việc
        var dept = (await biometricsService.CreateDepartmentAsync(
            new CreateDepartmentRequest("DEPT_MEDIA", "Phòng Truyền thông Số", null))).Value;

        var shift = (await attendanceService.CreateShiftAsync(
            new CreateShiftRequest("SHIFT_MEDIA", "Ca Sáng", new TimeOnly(8, 0), new TimeOnly(17, 0), 15, IsDefault: true))).Value;

        var emp = (await biometricsService.CreateEmployeeAsync(
            new CreateEmployeeRequest("NV301", "Trần Minh Quân", "quan@smartoffice.vn", null, dept.Id, shift.Id, null))).Value;

        // 3. Module 1 (Biometrics): Upload Avatar + Upload Sample Image + Cấp Presigned PUT URL
        await using var avatarStream = new MemoryStream(Encoding.UTF8.GetBytes("fake-avatar-jpeg-bytes"));
        var avatarUpload = await biometricsService.UploadEmployeeAvatarAsync(emp.Id, avatarStream, "image/jpeg");
        Assert.True(avatarUpload.IsSuccess);
        Assert.Equal("biometrics/nv301/avatar.jpg", avatarUpload.Value.ObjectKey);
        Assert.Contains("X-Amz-Algorithm=AWS4-HMAC-SHA256", avatarUpload.Value.PresignedViewUrl);
        Assert.Contains("content-type%3Bhost", avatarUpload.Value.PresignedUploadUrl);

        var empAfterAvatar = (await biometricsService.GetEmployeeByIdAsync(emp.Id)).Value;
        Assert.NotNull(empAfterAvatar.AvatarPresignedUrl);
        Assert.Contains("biometrics/nv301/avatar.jpg", empAfterAvatar.AvatarPresignedUrl);

        var presignedPutResult = await biometricsService.GetBiometricPresignedUploadUrlAsync(emp.Id, "LEFT_PROFILE", "image/jpeg");
        Assert.True(presignedPutResult.IsSuccess);
        Assert.Contains("X-Amz-SignedHeaders=content-type%3Bhost", presignedPutResult.Value.PresignedUploadUrl);

        // 4. Module 2 (Attendance): Chấm công và Upload Snapshot thực tế lên MinIO/S3
        var checkIn = (await attendanceService.ProcessCheckInOutAsync(new CheckAttendanceRequest(
            emp.Id, null, 0.96f, null, new DateTimeOffset(2026, 11, 6, 7, 50, 0, TimeSpan.Zero)))).Value;

        await using var checkinStream = new MemoryStream(Encoding.UTF8.GetBytes("fake-checkin-snapshot-bytes"));
        var snapUpload = await attendanceService.UploadAttendanceSnapshotAsync(checkIn.Id, checkinStream, "image/jpeg");
        Assert.True(snapUpload.IsSuccess);
        Assert.Contains("attendance_snapshots/2026-11-06/nv301_", snapUpload.Value.ObjectKey);
        Assert.Contains("X-Amz-Algorithm=AWS4-HMAC-SHA256", snapUpload.Value.PresignedViewUrl);

        // 5. Module 4 (Security): Tạo sự cố Mức 3 và Upload Video Clip bằng chứng 10s
        var incident = (await incidentService.EvaluateAndRecordDetectionAsync(new EvaluateNightGuardDetectionRequest(
            Guid.NewGuid(), dept.Id, null, 0.35f, null, null, new DateTimeOffset(2026, 11, 6, 23, 30, 0, TimeSpan.Zero)))).Value;

        await using var videoClipStream = new MemoryStream(Encoding.UTF8.GetBytes("fake-mp4-video-evidence-10s"));
        var evidenceUpload = await incidentService.UploadIncidentEvidenceAsync(incident.Id, "VIDEO_CLIP", videoClipStream, "video/mp4");
        Assert.True(evidenceUpload.IsSuccess);
        Assert.Equal("VIDEO_CLIP", evidenceUpload.Value.EvidenceType);
        Assert.Contains("clip10s.mp4", evidenceUpload.Value.ObjectKey);
        Assert.Contains("X-Amz-Algorithm=AWS4-HMAC-SHA256", evidenceUpload.Value.PresignedViewUrl);
    }
}
