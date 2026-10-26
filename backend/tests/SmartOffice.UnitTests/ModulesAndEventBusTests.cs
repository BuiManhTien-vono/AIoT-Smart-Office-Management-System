using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartOffice.Infrastructure;
using SmartOffice.Modules.Attendance.Application.DTOs;
using SmartOffice.Modules.Attendance.Application.Services;
using SmartOffice.Modules.Attendance.Infrastructure;
using SmartOffice.Modules.Biometrics.Application.DTOs;
using SmartOffice.Modules.Biometrics.Application.Services;
using SmartOffice.Modules.Biometrics.Infrastructure;
using SmartOffice.Modules.Reporting.Application.Handlers;
using SmartOffice.Modules.Reporting.Infrastructure;
using SmartOffice.SharedKernel.Contracts;
using SmartOffice.SharedKernel.Events;

namespace SmartOffice.UnitTests;

public class ModulesAndEventBusTests
{
    private static ServiceProvider BuildModularServiceProvider(string dbName)
    {
        var services = new ServiceCollection();

        services.AddSharedInfrastructure();

        // Đăng ký 3 DbContext độc lập của 3 Module trên InMemory Database
        services.AddDbContext<BiometricsDbContext>(o => o.UseInMemoryDatabase($"{dbName}_biometrics"));
        services.AddDbContext<AttendanceDbContext>(o => o.UseInMemoryDatabase($"{dbName}_attendance"));
        services.AddDbContext<ReportingDbContext>(o => o.UseInMemoryDatabase($"{dbName}_reporting"));

        // Đăng ký Services & Contract Interface (Phương thức 2)
        services.AddScoped<IBiometricsService, BiometricsService>();
        services.AddScoped<IEmployeeLookupContract, BiometricsEmployeeLookupService>();
        services.AddScoped<IAttendanceService, AttendanceService>();

        // Đăng ký Event Handlers (Phương thức 1 - InMemoryEventBus)
        services.AddScoped<IIntegrationEventHandler<EmployeeRegisteredIntegrationEvent>, EmployeeRegisteredEventHandler>();
        services.AddScoped<IIntegrationEventHandler<AttendanceCheckedIntegrationEvent>, AttendanceCheckedEventHandler>();

        return services.BuildServiceProvider();
    }

    [Fact]
    public async Task Biometrics_Should_Detect_Duplicate_Face_And_Identify_1ToN()
    {
        using var provider = BuildModularServiceProvider(nameof(Biometrics_Should_Detect_Duplicate_Face_And_Identify_1ToN));
        using var scope = provider.CreateScope();
        var biometricsService = scope.ServiceProvider.GetRequiredService<IBiometricsService>();

        var dept = (await biometricsService.CreateDepartmentAsync(
            new CreateDepartmentRequest("DEPT_IT", "Phòng CNTT", null))).Value;

        var emp1 = (await biometricsService.CreateEmployeeAsync(
            new CreateEmployeeRequest("NV001", "Nguyễn Văn A", "a@test.com", null, dept.Id, null, null))).Value;

        var emp2 = (await biometricsService.CreateEmployeeAsync(
            new CreateEmployeeRequest("NV002", "Trần Thị B", "b@test.com", null, dept.Id, null, null))).Value;

        // Đăng ký vector mẫu cho NV001
        var vectorA = new float[] { 0.8f, 0.6f, 0.0f, 0.0f };
        var reg1 = await biometricsService.RegisterBiometricSampleAsync(
            emp1.Id,
            new RegisterBiometricVectorRequest(vectorA, "biometrics/NV001/sample_1.jpg", 135.0f));
        Assert.True(reg1.IsSuccess);

        // Thử đăng ký vector gần giống hệt (> 0.85) cho NV002 -> Phải báo lỗi trùng sinh trắc học!
        var duplicateAttempt = await biometricsService.RegisterBiometricSampleAsync(
            emp2.Id,
            new RegisterBiometricVectorRequest(new float[] { 0.81f, 0.59f, 0.0f, 0.0f }, "biometrics/NV002/sample_1.jpg", 140.0f));
        Assert.True(duplicateAttempt.IsFailure);
        Assert.Equal("DUPLICATE_BIOMETRIC", duplicateAttempt.Error.Code);

        // Nhận diện khuôn mặt 1:N với vector khớp NV001
        var matchResult = (await biometricsService.IdentifyByVectorAsync(
            new IdentifyFaceRequest(new float[] { 0.79f, 0.61f, 0.0f, 0.0f }))).Value;
        Assert.True(matchResult.IsMatched);
        Assert.Equal("NV001", matchResult.EmployeeCode);
    }

    [Fact]
    public async Task InterModule_Communication_Should_Sync_Biometrics_Attendance_And_Reporting()
    {
        using var provider = BuildModularServiceProvider(nameof(InterModule_Communication_Should_Sync_Biometrics_Attendance_And_Reporting));
        using var scope = provider.CreateScope();

        var biometricsService = scope.ServiceProvider.GetRequiredService<IBiometricsService>();
        var attendanceService = scope.ServiceProvider.GetRequiredService<IAttendanceService>();
        var reportingDb = scope.ServiceProvider.GetRequiredService<ReportingDbContext>();

        // 1. Tạo phòng ban và ca làm việc (08:00 - 17:30, ân hạn 15 phút)
        var dept = (await biometricsService.CreateDepartmentAsync(
            new CreateDepartmentRequest("DEPT_AI", "Phòng AI", null))).Value;

        var shift = (await attendanceService.CreateShiftAsync(
            new CreateShiftRequest("SHIFT_HC", "Ca Hành Chính", new TimeOnly(8, 0), new TimeOnly(17, 30), GraceMinutes: 15, IsDefault: true))).Value;

        // 2. Tạo nhân viên ở Module Biometrics -> Tự động bắn Event sang Module Reporting
        var emp = (await biometricsService.CreateEmployeeAsync(
            new CreateEmployeeRequest("NV101", "Lê Văn C", null, null, dept.Id, shift.Id, null))).Value;

        // Kiểm tra Module Reporting đã tự động cộng TotalEmployees = 1 qua InMemoryEventBus
        var summaryAfterRegister = await reportingDb.DailyDepartmentSummaries
            .FirstOrDefaultAsync(x => x.DepartmentId == dept.Id);
        Assert.NotNull(summaryAfterRegister);
        Assert.Equal(1, summaryAfterRegister.TotalEmployees);

        // 3. Nhân viên chấm công lúc 08:25 (Trễ 25 phút so với 08:00, vượt quá ân hạn 08:15)
        var checkInTime = new DateTimeOffset(DateTime.UtcNow.Year, DateTime.UtcNow.Month, DateTime.UtcNow.Day, 8, 25, 0, TimeSpan.Zero);
        var checkInResult = await attendanceService.ProcessCheckInOutAsync(
            new CheckAttendanceRequest(emp.Id, null, MatchConfidence: 0.95f, "attendance/nv101_in.jpg", checkInTime));

        Assert.True(checkInResult.IsSuccess);
        Assert.False(checkInResult.Value.IsDebounced);
        Assert.Equal("LATE", checkInResult.Value.Status);
        Assert.Equal(25, checkInResult.Value.LateMinutes);

        // 4. Quét lại sau 2 phút (08:27 < 300s) -> Bộ lọc Debounce 5 phút phải chặn lại!
        var debounceResult = await attendanceService.ProcessCheckInOutAsync(
            new CheckAttendanceRequest(emp.Id, null, MatchConfidence: 0.96f, null, checkInTime.AddMinutes(2)));
        Assert.True(debounceResult.IsSuccess);
        Assert.True(debounceResult.Value.IsDebounced);

        // 5. Kiểm tra Module Reporting đã tự động cập nhật PresentCount = 1 và LateCount = 1 qua InMemoryEventBus
        var summaryAfterCheckIn = await reportingDb.DailyDepartmentSummaries
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.DepartmentId == dept.Id && x.SummaryDate == DateOnly.FromDateTime(checkInTime.DateTime));
        Assert.NotNull(summaryAfterCheckIn);
        Assert.Equal(1, summaryAfterCheckIn.PresentCount);
        Assert.Equal(1, summaryAfterCheckIn.LateCount);
    }
}
