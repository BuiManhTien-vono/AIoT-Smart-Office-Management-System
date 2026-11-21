using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartOffice.Infrastructure;
using SmartOffice.Modules.Attendance.Application.DTOs;
using SmartOffice.Modules.Attendance.Application.Services;
using SmartOffice.Modules.Attendance.Endpoints;
using SmartOffice.Modules.Attendance.Infrastructure;
using SmartOffice.Modules.Biometrics.Application.DTOs;
using SmartOffice.Modules.Biometrics.Application.Services;
using SmartOffice.Modules.Biometrics.Infrastructure;
using SmartOffice.Modules.Reporting.Application.Handlers;
using SmartOffice.Modules.Reporting.Application.Services;
using SmartOffice.Modules.Reporting.Infrastructure;
using SmartOffice.SharedKernel.Common;
using SmartOffice.SharedKernel.Contracts;
using SmartOffice.SharedKernel.Events;
using SmartOffice.SharedKernel.Security;

namespace SmartOffice.UnitTests;

public class AttendanceAdjustmentAndAuditTests
{
    private static ServiceProvider BuildServiceProvider(string dbName)
    {
        var services = new ServiceCollection();
        services.AddSharedInfrastructure();

        services.AddDbContext<BiometricsDbContext>(o => o.UseInMemoryDatabase($"{dbName}_biometrics"));
        services.AddDbContext<AttendanceDbContext>(o => o.UseInMemoryDatabase($"{dbName}_attendance"));
        services.AddDbContext<ReportingDbContext>(o => o.UseInMemoryDatabase($"{dbName}_reporting"));

        services.AddScoped<IBiometricsService, BiometricsService>();
        services.AddScoped<IEmployeeLookupContract, BiometricsEmployeeLookupService>();
        services.AddScoped<IOvertimeLookupContract, DummyOvertimeLookup>();
        services.AddScoped<IAttendanceService, AttendanceService>();
        services.AddScoped<IReportingService, ReportingService>();

        services.AddScoped<IIntegrationEventHandler<EmployeeRegisteredIntegrationEvent>, EmployeeRegisteredEventHandler>();
        services.AddScoped<IIntegrationEventHandler<AttendanceCheckedIntegrationEvent>, AttendanceCheckedEventHandler>();
        services.AddScoped<IIntegrationEventHandler<AttendanceLogRemovedIntegrationEvent>, AttendanceLogRemovedEventHandler>();
        services.AddScoped<IIntegrationEventHandler<AttendanceLogAdjustedIntegrationEvent>, AttendanceLogAdjustedEventHandler>();
        services.AddScoped<IIntegrationEventHandler<AttendanceAbsentMarkedIntegrationEvent>, AttendanceAbsentMarkedEventHandler>();

        return services.BuildServiceProvider();
    }

    private sealed class DummyOvertimeLookup : IOvertimeLookupContract
    {
        public Task<OvertimeLookupResultDto> CheckApprovedOvertimeAsync(
            Guid employeeId,
            DateTimeOffset checkTimeUtc,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(new OvertimeLookupResultDto(false, null, employeeId, string.Empty, null, null, null));
    }

    private static DateTimeOffset VietnamAt(DateOnly date, int hour, int minute) =>
        new DateTimeOffset(date.Year, date.Month, date.Day, hour, minute, 0, TimeSpan.FromHours(7));

    [Fact]
    public void JwtTokenHelper_Should_Validate_Valid_Token_And_Reject_Tampered_Or_Expired()
    {
        var userId = Guid.NewGuid();
        var deptId = Guid.NewGuid();

        var validToken = JwtTokenHelper.GenerateToken(userId, "lead_it", "Trưởng phòng IT", "DEPT_LEAD", deptId);
        Assert.True(JwtTokenHelper.TryValidateToken(validToken, out var principal, out var actor, out var errorCode));
        Assert.Null(errorCode);
        Assert.NotNull(principal);
        Assert.NotNull(actor);
        Assert.Equal(userId, actor!.UserId);
        Assert.Equal("DEPT_LEAD", actor.Role);
        Assert.Equal(deptId, actor.DepartmentId);

        // Chữ ký bị sửa đổi -> từ chối
        var tampered = validToken[..^2] + (validToken.EndsWith("aa") ? "bb" : "aa");
        Assert.False(JwtTokenHelper.TryValidateToken(tampered, out _, out _, out var tamperErr));
        Assert.Equal("TOKEN_INVALID_SIGNATURE", tamperErr);

        // Token hết hạn -> từ chối
        var expiredToken = JwtTokenHelper.GenerateToken(userId, "admin", "Admin", "ADMIN", null, expirySeconds: -10);
        Assert.False(JwtTokenHelper.TryValidateToken(expiredToken, out _, out _, out var expErr));
        Assert.Equal("TOKEN_EXPIRED", expErr);
    }

    [Fact]
    public async Task AttendanceController_Should_Return_401_Without_Jwt_And_403_On_Forbidden_Role()
    {
        using var provider = BuildServiceProvider(nameof(AttendanceController_Should_Return_401_Without_Jwt_And_403_On_Forbidden_Role));
        using var scope = provider.CreateScope();

        var attendanceService = scope.ServiceProvider.GetRequiredService<IAttendanceService>();
        var controller = new AttendanceController(attendanceService)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };

        // Không có JWT -> 401 Unauthorized
        var unauthRes = await controller.GetAudits(null, null, null, CancellationToken.None);
        Assert.IsType<UnauthorizedObjectResult>(unauthRes);

        // Có JWT vai trò SECURITY -> 403 Forbidden
        var secToken = JwtTokenHelper.GenerateToken(Guid.NewGuid(), "sec01", "Bảo vệ", "SECURITY", null);
        Assert.True(JwtTokenHelper.TryValidateToken(secToken, out var secPrincipal, out _, out _));
        controller.HttpContext.User = secPrincipal!;

        var forbidRes = await controller.GetAudits(null, null, null, CancellationToken.None);
        var objRes = Assert.IsType<ObjectResult>(forbidRes);
        Assert.Equal(StatusCodes.Status403Forbidden, objRes.StatusCode);
    }

    [Fact]
    public async Task Authorization_Should_Enforce_Department_Scope_And_Historical_Week_Lock()
    {
        using var provider = BuildServiceProvider(nameof(Authorization_Should_Enforce_Department_Scope_And_Historical_Week_Lock));
        using var scope = provider.CreateScope();

        var bio = scope.ServiceProvider.GetRequiredService<IBiometricsService>();
        var att = scope.ServiceProvider.GetRequiredService<IAttendanceService>();

        var deptIt = (await bio.CreateDepartmentAsync(new CreateDepartmentRequest("DEPT_IT", "CNTT", null))).Value;
        var deptHr = (await bio.CreateDepartmentAsync(new CreateDepartmentRequest("DEPT_HR", "Nhân sự", null))).Value;
        var shift = (await att.CreateShiftAsync(new CreateShiftRequest("SHIFT_HC", "Ca HC", new TimeOnly(8, 0), new TimeOnly(17, 30), 15, IsDefault: true))).Value;

        var empIt = (await bio.CreateEmployeeAsync(new CreateEmployeeRequest("IT01", "Nguyễn Văn IT", null, null, deptIt.Id, shift.Id, null))).Value;
        var empHr = (await bio.CreateEmployeeAsync(new CreateEmployeeRequest("HR01", "Trần Thị HR", null, null, deptHr.Id, shift.Id, null))).Value;

        var admin = new ActorContext(Guid.NewGuid(), "admin", "Quản trị", "ADMIN", null);
        var hr = new ActorContext(Guid.NewGuid(), "hr01", "Nhân sự", "HR", deptHr.Id);
        var leadIt = new ActorContext(Guid.NewGuid(), "lead_it", "Trưởng phòng IT", "DEPT_LEAD", deptIt.Id);
        var security = new ActorContext(Guid.NewGuid(), "sec01", "An ninh", "SECURITY", null);

        var today = VietnamDateTime.Today;
        var currentWeekStart = AttendanceService.GetStartOfCurrentWeek(today);
        var lastWeekDay = currentWeekStart.AddDays(-1); // Chủ nhật tuần trước

        // 1. SECURITY không được bổ sung công
        var secAttempt = await att.CreateManualAttendanceLogAsync(new ManualAttendanceRequest(
            empIt.Id, today, VietnamAt(today, 8, 5), null, shift.Id, false, null, null, null, "Thử sửa trái phép"), security);
        Assert.True(secAttempt.IsFailure);
        Assert.Equal("FORBIDDEN_ROLE", secAttempt.Error.Code);

        // 2. DEPT_LEAD phòng IT KHÔNG được thao tác nhân viên phòng HR
        var crossDeptAttempt = await att.CreateManualAttendanceLogAsync(new ManualAttendanceRequest(
            empHr.Id, today, VietnamAt(today, 8, 5), null, shift.Id, false, null, null, null, "Sửa sang phòng khác"), leadIt);
        Assert.True(crossDeptAttempt.IsFailure);
        Assert.Equal("FORBIDDEN_DEPARTMENT", crossDeptAttempt.Error.Code);

        // 3. DEPT_LEAD phòng IT ĐƯỢC bổ sung công trong tuần hiện tại cho nhân viên phòng IT
        var leadSameDept = await att.CreateManualAttendanceLogAsync(new ManualAttendanceRequest(
            empIt.Id, today, VietnamAt(today, 8, 10), VietnamAt(today, 17, 35), shift.Id, false, null, null, null, "Quên quét mặt sáng nay", "DAILY_LOG"), leadIt);
        Assert.True(leadSameDept.IsSuccess);
        Assert.Equal("ON_TIME", leadSameDept.Value.Status);

        // 4. HR KHÔNG được sửa/bổ sung công từ tuần trước trở về trước
        var hrPastAttempt = await att.CreateManualAttendanceLogAsync(new ManualAttendanceRequest(
            empHr.Id, lastWeekDay, VietnamAt(lastWeekDay, 8, 0), VietnamAt(lastWeekDay, 17, 30), shift.Id, false, null, null, null, "Bổ sung công tuần trước"), hr);
        Assert.True(hrPastAttempt.IsFailure);
        Assert.Equal("FORBIDDEN_HISTORICAL_LOCK", hrPastAttempt.Error.Code);

        // 5. DEPT_LEAD cũng KHÔNG được bổ sung công tuần trước
        var leadPastAttempt = await att.CreateManualAttendanceLogAsync(new ManualAttendanceRequest(
            empIt.Id, lastWeekDay, VietnamAt(lastWeekDay, 8, 0), VietnamAt(lastWeekDay, 17, 30), shift.Id, false, null, null, null, "Bổ sung công tuần trước"), leadIt);
        Assert.True(leadPastAttempt.IsFailure);
        Assert.Equal("FORBIDDEN_HISTORICAL_LOCK", leadPastAttempt.Error.Code);

        // 6. Chỉ ADMIN được bổ sung công từ tuần trước trở về trước
        var adminPast = await att.CreateManualAttendanceLogAsync(new ManualAttendanceRequest(
            empHr.Id, lastWeekDay, VietnamAt(lastWeekDay, 8, 5), VietnamAt(lastWeekDay, 17, 35), shift.Id, false, null, null, null, "Admin bổ sung công lịch sử tuần trước", "REPORTING_HUB"), admin);
        Assert.True(adminPast.IsSuccess);
        Assert.Equal("ON_TIME", adminPast.Value.Status);

        // 7. DEPT_LEAD xem audit chỉ thấy phòng ban mình (IT01), không thấy HR01
        var leadAudits = await att.GetAttendanceAuditsAsync(leadIt);
        Assert.True(leadAudits.IsSuccess);
        Assert.Single(leadAudits.Value);
        Assert.Equal("IT01", leadAudits.Value[0].EmployeeCode);

        // 8. ADMIN/HR thấy toàn bộ audit (cả IT01 và HR01)
        var hrAudits = await att.GetAttendanceAuditsAsync(hr);
        Assert.True(hrAudits.IsSuccess);
        Assert.Equal(2, hrAudits.Value.Count);
    }

    [Fact]
    public async Task Adjust_AutoRecalculate_ManualOverride_And_Sync_Reporting()
    {
        using var provider = BuildServiceProvider(nameof(Adjust_AutoRecalculate_ManualOverride_And_Sync_Reporting));
        using var scope = provider.CreateScope();

        var bio = scope.ServiceProvider.GetRequiredService<IBiometricsService>();
        var att = scope.ServiceProvider.GetRequiredService<IAttendanceService>();
        var attDb = scope.ServiceProvider.GetRequiredService<AttendanceDbContext>();
        var repDb = scope.ServiceProvider.GetRequiredService<ReportingDbContext>();

        var dept = (await bio.CreateDepartmentAsync(new CreateDepartmentRequest("DEPT_AI", "Phòng AI", null))).Value;
        var shift = (await att.CreateShiftAsync(new CreateShiftRequest("SHIFT_HC", "Ca HC", new TimeOnly(8, 0), new TimeOnly(17, 30), 15, IsDefault: true))).Value;
        var emp = (await bio.CreateEmployeeAsync(new CreateEmployeeRequest("AI01", "Lê Văn AI", null, null, dept.Id, shift.Id, null))).Value;

        var today = VietnamDateTime.Today;
        var hr = new ActorContext(Guid.NewGuid(), "hr01", "Nhân sự A", "HR", dept.Id);

        // 1. Check-in trễ lúc 08:30 (LATE 30p) -> Reporting: Present=1, Late=1
        var checkIn = await att.ProcessCheckInOutAsync(new CheckAttendanceRequest(
            emp.Id, null, 0.94f, "snap/ai01.jpg", VietnamAt(today, 8, 30)));
        Assert.True(checkIn.IsSuccess);
        Assert.Equal("LATE", checkIn.Value.Status);
        Assert.Equal(30, checkIn.Value.LateMinutes);

        var summary1 = await repDb.DailyDepartmentSummaries.AsNoTracking()
            .FirstAsync(x => x.DepartmentId == dept.Id && x.SummaryDate == today);
        Assert.Equal(1, summary1.PresentCount);
        Assert.Equal(1, summary1.LateCount);

        // 2. HR sửa giờ vào về 08:05, ra 17:00 (tự tính lại theo ca -> EARLY_LEAVE 30p, Late=0)
        var adjAuto = await att.AdjustAttendanceLogAsync(
            checkIn.Value.Id,
            new AdjustAttendanceRequest(
                VietnamAt(today, 8, 5),
                VietnamAt(today, 17, 0),
                shift.Id,
                IsStatusOverridden: false,
                OverrideStatus: null,
                OverrideLateMinutes: null,
                OverrideEarlyLeaveMinutes: null,
                Reason: "Camera cổng treo lúc sáng nên nhận diện muộn",
                SourceScreen: "DAILY_LOG"),
            hr);

        Assert.True(adjAuto.IsSuccess);
        Assert.Equal("EARLY_LEAVE", adjAuto.Value.Status);
        Assert.Equal(0, adjAuto.Value.LateMinutes);
        Assert.Equal(30, adjAuto.Value.EarlyLeaveMinutes);
        Assert.True(adjAuto.Value.IsManuallyAdjusted);
        Assert.Equal("snap/ai01.jpg", adjAuto.Value.CheckinSnapshotKey); // Giữ nguyên ảnh đối chứng

        var summary2 = await repDb.DailyDepartmentSummaries.AsNoTracking()
            .FirstAsync(x => x.DepartmentId == dept.Id && x.SummaryDate == today);
        Assert.Equal(1, summary2.PresentCount);
        Assert.Equal(0, summary2.LateCount);

        // 3. HR tích "ghi đè thủ công": dù giờ vào 08:40 vẫn cho ON_TIME (miễn phạt)
        var adjOverride = await att.AdjustAttendanceLogAsync(
            checkIn.Value.Id,
            new AdjustAttendanceRequest(
                VietnamAt(today, 8, 40),
                VietnamAt(today, 17, 35),
                shift.Id,
                IsStatusOverridden: true,
                OverrideStatus: "ON_TIME",
                OverrideLateMinutes: 0,
                OverrideEarlyLeaveMinutes: 0,
                Reason: "Miễn phạt đi muộn do họp đột xuất với khách hàng",
                SourceScreen: "REPORTING_HUB"),
            hr);

        Assert.True(adjOverride.IsSuccess);
        Assert.Equal("ON_TIME", adjOverride.Value.Status);
        Assert.Equal(0, adjOverride.Value.LateMinutes);
        Assert.Equal(0, adjOverride.Value.EarlyLeaveMinutes);

        var audits = await attDb.AttendanceAdjustmentAudits.AsNoTracking()
            .Where(a => a.EmployeeId == emp.Id)
            .OrderBy(a => a.CreatedAt)
            .ToListAsync();
        Assert.Equal(2, audits.Count);
        Assert.False(audits[0].IsStatusOverridden);
        Assert.Equal("LATE", audits[0].PreviousStatus);
        Assert.Equal("EARLY_LEAVE", audits[0].NewStatus);
        Assert.True(audits[1].IsStatusOverridden);
        Assert.Equal("EARLY_LEAVE", audits[1].PreviousStatus);
        Assert.Equal("ON_TIME", audits[1].NewStatus);
    }

    [Fact]
    public async Task Cancel_Modes_VoidErroneous_And_RevokePenalty_Should_Audit_And_Sync_RevokedCount()
    {
        using var provider = BuildServiceProvider(nameof(Cancel_Modes_VoidErroneous_And_RevokePenalty_Should_Audit_And_Sync_RevokedCount));
        using var scope = provider.CreateScope();

        var bio = scope.ServiceProvider.GetRequiredService<IBiometricsService>();
        var att = scope.ServiceProvider.GetRequiredService<IAttendanceService>();
        var attDb = scope.ServiceProvider.GetRequiredService<AttendanceDbContext>();
        var repDb = scope.ServiceProvider.GetRequiredService<ReportingDbContext>();
        var repService = scope.ServiceProvider.GetRequiredService<IReportingService>();

        var dept = (await bio.CreateDepartmentAsync(new CreateDepartmentRequest("DEPT_QA", "Phòng QA", null))).Value;
        var shift = (await att.CreateShiftAsync(new CreateShiftRequest("SHIFT_HC", "Ca HC", new TimeOnly(8, 0), new TimeOnly(17, 30), 15, IsDefault: true))).Value;
        var emp1 = (await bio.CreateEmployeeAsync(new CreateEmployeeRequest("QA01", "Phạm Văn Một", null, null, dept.Id, shift.Id, null))).Value;
        var emp2 = (await bio.CreateEmployeeAsync(new CreateEmployeeRequest("QA02", "Phạm Thị Hai", null, null, dept.Id, shift.Id, null))).Value;

        var admin = new ActorContext(Guid.NewGuid(), "admin", "Giám đốc", "ADMIN", null);
        var today = VietnamDateTime.Today;
        var historicalDay = AttendanceService.GetStartOfCurrentWeek(today).AddDays(-3); // Tuần trước

        // Tạo 2 bản ghi công lịch sử bởi Admin (emp1: LATE, emp2: ON_TIME)
        var log1 = (await att.CreateManualAttendanceLogAsync(new ManualAttendanceRequest(
            emp1.Id, historicalDay, VietnamAt(historicalDay, 8, 30), VietnamAt(historicalDay, 17, 35),
            shift.Id, false, null, null, null, "Dữ liệu lịch sử đi muộn"), admin)).Value;
        var log2 = (await att.CreateManualAttendanceLogAsync(new ManualAttendanceRequest(
            emp2.Id, historicalDay, VietnamAt(historicalDay, 8, 5), VietnamAt(historicalDay, 17, 35),
            shift.Id, false, null, null, null, "Dữ liệu lịch sử đúng giờ"), admin)).Value;

        var summaryInitial = await repDb.DailyDepartmentSummaries.AsNoTracking()
            .FirstAsync(x => x.DepartmentId == dept.Id && x.SummaryDate == historicalDay);
        Assert.Equal(2, summaryInitial.PresentCount);
        Assert.Equal(1, summaryInitial.LateCount);
        Assert.Equal(0, summaryInitial.RevokedCount);
        Assert.Equal("DEPT_QA", summaryInitial.DepartmentCode);

        // CHẾ ĐỘ 1: VOID_ERRONEOUS trên log1 (ghi nhầm trong ngày nghỉ phép)
        var voidRes = await att.CancelAttendanceLogAsync(
            log1.Id,
            new CancelAttendanceRequest("VOID_ERRONEOUS", "Lỗi hệ thống ghi nhầm công trong ngày nghỉ phép năm", "REPORTING_HUB"),
            admin);
        Assert.True(voidRes.IsSuccess);
        Assert.Null(voidRes.Value.NewStatus);

        // Bản ghi đã bị gỡ khỏi attendance_logs nhưng audit vẫn còn nguyên
        Assert.Null(await attDb.AttendanceLogs.AsNoTracking().FirstOrDefaultAsync(x => x.Id == log1.Id));
        var voidAudit = await attDb.AttendanceAdjustmentAudits.AsNoTracking()
            .FirstOrDefaultAsync(x => x.AttendanceLogId == log1.Id && x.ActionType == "VOID_ERRONEOUS");
        Assert.NotNull(voidAudit);
        Assert.Equal("LATE", voidAudit!.PreviousStatus);
        Assert.Null(voidAudit.NewStatus);

        // Reporting trừ PresentCount từ 2 -> 1, LateCount từ 1 -> 0, không tăng Absent hay Revoked
        var summaryAfterVoid = await repDb.DailyDepartmentSummaries.AsNoTracking()
            .FirstAsync(x => x.DepartmentId == dept.Id && x.SummaryDate == historicalDay);
        Assert.Equal(1, summaryAfterVoid.PresentCount);
        Assert.Equal(0, summaryAfterVoid.LateCount);
        Assert.Equal(0, summaryAfterVoid.AbsentCount);
        Assert.Equal(0, summaryAfterVoid.RevokedCount);

        // CHẾ ĐỘ 2: REVOKE_PENALTY trên log2 (phạt trừ toàn bộ lương ngày công)
        var revokeRes = await att.CancelAttendanceLogAsync(
            log2.Id,
            new CancelAttendanceRequest("REVOKE_PENALTY", "Kỷ luật vi phạm nội quy, trừ toàn bộ lương ngày công", "REPORTING_HUB"),
            admin);
        Assert.True(revokeRes.IsSuccess);
        Assert.Equal("REVOKED", revokeRes.Value.NewStatus);
        Assert.NotNull(revokeRes.Value.UpdatedRecord);
        Assert.NotNull(revokeRes.Value.UpdatedRecord!.CheckInTime); // Giữ nguyên giờ đối chứng

        // Reporting trừ PresentCount 1 -> 0 và tăng RevokedCount 0 -> 1
        var summaryAfterRevoke = await repDb.DailyDepartmentSummaries.AsNoTracking()
            .FirstAsync(x => x.DepartmentId == dept.Id && x.SummaryDate == historicalDay);
        Assert.Equal(0, summaryAfterRevoke.PresentCount);
        Assert.Equal(1, summaryAfterRevoke.RevokedCount);

        // Kiểm tra MonthlyDepartmentReport trả đúng TotalRevokedManDays = 1 và CSV có cột RevokedCount
        var monthly = await repService.GetMonthlyReportAsync(historicalDay.Year, historicalDay.Month, dept.Id);
        Assert.Equal(1, monthly.TotalRevokedManDays);
        var csvText = System.Text.Encoding.UTF8.GetString(
            await repService.ExportMonthlyReportCsvAsync(historicalDay.Year, historicalDay.Month, dept.Id));
        Assert.Contains("RevokedCount", csvText);

        // Camera AI quét lại cho nhân viên đã bị REVOKED -> bị chặn không được ghi đè!
        var cameraOverwriteAttempt = await att.ProcessCheckInOutAsync(new CheckAttendanceRequest(
            emp2.Id, null, 0.95f, null, VietnamAt(historicalDay, 17, 40)));
        Assert.True(cameraOverwriteAttempt.IsFailure);
        Assert.Equal("ATTENDANCE_REVOKED", cameraOverwriteAttempt.Error.Code);

        // Admin hoàn tác REVOKED -> ON_TIME: Reporting tự giảm RevokedCount 1 -> 0 và tăng PresentCount 0 -> 1
        var restoreRes = await att.AdjustAttendanceLogAsync(
            log2.Id,
            new AdjustAttendanceRequest(
                VietnamAt(historicalDay, 8, 5),
                VietnamAt(historicalDay, 17, 35),
                shift.Id,
                IsStatusOverridden: false,
                OverrideStatus: null,
                OverrideLateMinutes: null,
                OverrideEarlyLeaveMinutes: null,
                Reason: "Giám đốc hủy quyết định kỷ luật sau khi xem xét lại"),
            admin);
        Assert.True(restoreRes.IsSuccess);
        Assert.Equal("ON_TIME", restoreRes.Value.Status);

        var summaryAfterRestore = await repDb.DailyDepartmentSummaries.AsNoTracking()
            .FirstAsync(x => x.DepartmentId == dept.Id && x.SummaryDate == historicalDay);
        Assert.Equal(1, summaryAfterRestore.PresentCount);
        Assert.Equal(0, summaryAfterRestore.RevokedCount);
    }
}

