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
        services.AddScoped<IOvertimeLookupContract, DummyOvertimeLookup>();
        services.AddScoped<IAttendanceService, AttendanceService>();
        services.AddScoped<ILeaveLookupContract, AttendanceService>();

        // Đăng ký Event Handlers (Phương thức 1 - InMemoryEventBus)
        services.AddScoped<IIntegrationEventHandler<EmployeeRegisteredIntegrationEvent>, EmployeeRegisteredEventHandler>();
        services.AddScoped<IIntegrationEventHandler<AttendanceCheckedIntegrationEvent>, AttendanceCheckedEventHandler>();
        services.AddScoped<IIntegrationEventHandler<AttendanceLogRemovedIntegrationEvent>, AttendanceLogRemovedEventHandler>();

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

    private sealed class DummyOvertimeLookup : IOvertimeLookupContract
    {
        public Task<OvertimeLookupResultDto> CheckApprovedOvertimeAsync(
            Guid employeeId,
            DateTimeOffset checkTimeUtc,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult(new OvertimeLookupResultDto(
                false, null, employeeId, string.Empty, null, null, null));
        }
    }

    [Fact]
    public async Task Attendance_LeaveRequest_Should_Support_OfficialDuty_And_SuddenlyAllowedLeave_With_ShiftTimeDefaults()
    {
        using var provider = BuildModularServiceProvider(nameof(Attendance_LeaveRequest_Should_Support_OfficialDuty_And_SuddenlyAllowedLeave_With_ShiftTimeDefaults));
        using var scope = provider.CreateScope();

        var biometricsService = scope.ServiceProvider.GetRequiredService<IBiometricsService>();
        var attendanceService = scope.ServiceProvider.GetRequiredService<IAttendanceService>();

        var dept = (await biometricsService.CreateDepartmentAsync(
            new CreateDepartmentRequest("DEPT_OPS", "Phòng Vận hành", null))).Value;

        var shift = (await attendanceService.CreateShiftAsync(
            new CreateShiftRequest("SHIFT_STD", "Ca Chuẩn", new TimeOnly(8, 30), new TimeOnly(18, 0), GraceMinutes: 15, IsDefault: true))).Value;

        var emp = (await biometricsService.CreateEmployeeAsync(
            new CreateEmployeeRequest("NV501", "Đỗ Minh Tuấn", null, null, dept.Id, shift.Id, null))).Value;

        var workDate = new DateOnly(2026, 11, 17);

        // 1. Tạo đơn official_duty không truyền StartTime/EndTime -> Mặc định theo đầu/cuối ca (08:30 - 18:00) và IsPaid = true
        var officialDutyRes = await attendanceService.CreateLeaveRequestAsync(new CreateLeaveRequestDto(
            emp.Id,
            workDate,
            workDate,
            LeaveType: "official_duty",
            Reason: "Họp chiến lược phòng ban"));

        Assert.True(officialDutyRes.IsSuccess);
        Assert.Equal("OFFICIAL_DUTY", officialDutyRes.Value.LeaveType);
        Assert.True(officialDutyRes.Value.IsPaid);
        Assert.Equal(new TimeOnly(8, 30), officialDutyRes.Value.StartTime);
        Assert.Equal(new TimeOnly(18, 0), officialDutyRes.Value.EndTime);

        // 2. Tạo đơn suddenly_allowed_leave buổi chiều (15:00 - 18:00) -> IsPaid = false, và khi check-out lúc 15:05 không bị tính EARLY_LEAVE
        var nextWorkDate = workDate.AddDays(1);
        var suddenLeaveRes = await attendanceService.CreateLeaveRequestAsync(new CreateLeaveRequestDto(
            emp.Id,
            nextWorkDate,
            nextWorkDate,
            LeaveType: "suddenly_allowed_leave",
            Reason: "Nghỉ đột xuất giải quyết việc cá nhân",
            StartTime: new TimeOnly(15, 0),
            EndTime: new TimeOnly(18, 0)));

        Assert.True(suddenLeaveRes.IsSuccess);
        Assert.Equal("SUDDENLY_ALLOWED_LEAVE", suddenLeaveRes.Value.LeaveType);
        Assert.False(suddenLeaveRes.Value.IsPaid);
        Assert.Equal(new TimeOnly(15, 0), suddenLeaveRes.Value.StartTime);
        Assert.Equal(new TimeOnly(18, 0), suddenLeaveRes.Value.EndTime);

        // Check-in đúng giờ lúc 08:25 (trước khung giờ nghỉ 15:00 - 18:00) -> Hợp lệ ON_TIME
        var checkInRes = await attendanceService.ProcessCheckInOutAsync(new CheckAttendanceRequest(
            emp.Id, null, 0.95f, null, new DateTimeOffset(2026, 11, 18, 8, 25, 0, TimeSpan.Zero)));
        Assert.True(checkInRes.IsSuccess);
        Assert.Equal("ON_TIME", checkInRes.Value.Status);

        // Nếu quét mặt lúc 15:05 (đang trong khung giờ nghỉ phép 15:00 - 18:00) -> Chặn chấm công EMPLOYEE_ON_LEAVE
        var checkOutDuringLeaveRes = await attendanceService.ProcessCheckInOutAsync(new CheckAttendanceRequest(
            emp.Id, null, 0.95f, null, new DateTimeOffset(2026, 11, 18, 15, 5, 0, TimeSpan.Zero)));
        Assert.True(checkOutDuringLeaveRes.IsFailure);
        Assert.Equal("EMPLOYEE_ON_LEAVE", checkOutDuringLeaveRes.Error.Code);

        // 3. Kiểm tra chặn khung giờ không hợp lệ trong cùng ngày (EndTime <= StartTime)
        var invalidTimeRes = await attendanceService.CreateLeaveRequestAsync(new CreateLeaveRequestDto(
            emp.Id,
            nextWorkDate,
            nextWorkDate,
            LeaveType: "official_duty",
            Reason: "Sai khung giờ",
            StartTime: new TimeOnly(16, 0),
            EndTime: new TimeOnly(14, 0)));

        Assert.True(invalidTimeRes.IsFailure);
        Assert.Equal("INVALID_TIME_RANGE", invalidTimeRes.Error.Code);

        // 4. Kiểm tra chặn tạo đơn trùng lặp khung giờ (LEAVE_OVERLAP)
        var overlapRes = await attendanceService.CreateLeaveRequestAsync(new CreateLeaveRequestDto(
            emp.Id,
            nextWorkDate,
            nextWorkDate,
            LeaveType: "suddenly_allowed_leave",
            Reason: "Tạo trùng khung giờ chiều",
            StartTime: new TimeOnly(14, 0),
            EndTime: new TimeOnly(17, 0)));

        Assert.True(overlapRes.IsFailure);
        Assert.Equal("LEAVE_OVERLAP", overlapRes.Error.Code);

        // 5. Thay thế đơn cũ (15:00 - 18:00) bằng đơn mới (14:00 - 18:00) -> Đơn cũ CANCELLED, đơn mới APPROVED
        var replaceRes = await attendanceService.ReplaceLeaveRequestAsync(
            suddenLeaveRes.Value.Id,
            new CreateLeaveRequestDto(
                emp.Id,
                nextWorkDate,
                nextWorkDate,
                LeaveType: "suddenly_allowed_leave",
                Reason: "Điều chỉnh xin nghỉ sớm hơn từ 14:00",
                StartTime: new TimeOnly(14, 0),
                EndTime: new TimeOnly(18, 0)));

        Assert.True(replaceRes.IsSuccess);
        Assert.Equal(new TimeOnly(14, 0), replaceRes.Value.StartTime);

        var leavesOnNextDay = await attendanceService.GetLeaveRequestsAsync(nextWorkDate);
        Assert.Contains(leavesOnNextDay, l => l.Id == suddenLeaveRes.Value.Id && l.ApprovalStatus == "CANCELLED");
        Assert.Contains(leavesOnNextDay, l => l.Id == replaceRes.Value.Id && l.ApprovalStatus == "APPROVED");

        // Lúc 14:05 đã bước vào đơn mới (14:00 - 18:00) -> Camera chấm công tiếp tục chặn EMPLOYEE_ON_LEAVE
        var checkOutAfterReplace = await attendanceService.ProcessCheckInOutAsync(new CheckAttendanceRequest(
            emp.Id, null, 0.95f, null, new DateTimeOffset(2026, 11, 18, 14, 5, 0, TimeSpan.Zero)));
        Assert.True(checkOutAfterReplace.IsFailure);
        Assert.Equal("EMPLOYEE_ON_LEAVE", checkOutAfterReplace.Error.Code);

        // 6. Hủy đơn mới -> Cho phép tạo lại đơn khác vào khung giờ đó
        var cancelRes = await attendanceService.CancelLeaveRequestAsync(replaceRes.Value.Id);
        Assert.True(cancelRes.IsSuccess);
        Assert.Equal("CANCELLED", cancelRes.Value.ApprovalStatus);

        var recreateAfterCancel = await attendanceService.CreateLeaveRequestAsync(new CreateLeaveRequestDto(
            emp.Id,
            nextWorkDate,
            nextWorkDate,
            LeaveType: "official_duty",
            Reason: "Đăng ký họp sau khi hủy đơn nghỉ",
            StartTime: new TimeOnly(14, 0),
            EndTime: new TimeOnly(16, 0)));
        Assert.True(recreateAfterCancel.IsSuccess);
    }

    [Fact]
    public async Task Attendance_LongLeave_Should_Block_CheckIn_And_Ignore_Work_Across_Full_Range_Until_EndDate_EndTime()
    {
        using var provider = BuildModularServiceProvider(nameof(Attendance_LongLeave_Should_Block_CheckIn_And_Ignore_Work_Across_Full_Range_Until_EndDate_EndTime));
        using var scope = provider.CreateScope();

        var biometricsService = scope.ServiceProvider.GetRequiredService<IBiometricsService>();
        var attendanceService = scope.ServiceProvider.GetRequiredService<IAttendanceService>();
        var leaveLookup = scope.ServiceProvider.GetRequiredService<ILeaveLookupContract>();

        var dept = (await biometricsService.CreateDepartmentAsync(
            new CreateDepartmentRequest("DEPT_LONG", "Phòng Dự án", null))).Value;
        var shift = (await attendanceService.CreateShiftAsync(
            new CreateShiftRequest("SHIFT_HC", "Ca Hành Chính", new TimeOnly(8, 0), new TimeOnly(17, 30), GraceMinutes: 15, IsDefault: true))).Value;
        var emp = (await biometricsService.CreateEmployeeAsync(
            new CreateEmployeeRequest("NV801", "Phạm Gia Bảo", null, null, dept.Id, shift.Id, null))).Value;

        // Đăng ký nghỉ dài ngày từ 20/11 14:00 đến 22/11 12:00
        var startDate = new DateOnly(2026, 11, 20);
        var endDate = new DateOnly(2026, 11, 22);
        var createRes = await attendanceService.CreateLeaveRequestAsync(new CreateLeaveRequestDto(
            emp.Id,
            startDate,
            endDate,
            LeaveType: "ANNUAL_LEAVE",
            Reason: "Nghỉ phép dài ngày về quê",
            StartTime: new TimeOnly(14, 0),
            EndTime: new TimeOnly(12, 0)));
        Assert.True(createRes.IsSuccess);

        // 1. Ngày đầu (20/11) trước 14:00 -> Chấm công bình thường
        var morningDay1 = await attendanceService.ProcessCheckInOutAsync(new CheckAttendanceRequest(
            emp.Id, null, 0.95f, null, new DateTimeOffset(2026, 11, 20, 8, 5, 0, TimeSpan.FromHours(7))));
        Assert.True(morningDay1.IsSuccess);
        Assert.Equal("ON_TIME", morningDay1.Value.Status);

        // 2. Ngày đầu (20/11) lúc 14:10 -> Đang trong kỳ nghỉ phép -> Không ghi nhận chấm công!
        var afternoonDay1 = await attendanceService.ProcessCheckInOutAsync(new CheckAttendanceRequest(
            emp.Id, null, 0.95f, null, new DateTimeOffset(2026, 11, 20, 14, 10, 0, TimeSpan.FromHours(7))));
        Assert.True(afternoonDay1.IsFailure);
        Assert.Equal("EMPLOYEE_ON_LEAVE", afternoonDay1.Error.Code);

        // 3. Ngày ở giữa (21/11) cả sáng sớm 07:30 và tối 20:00 -> Đều bị chặn chấm công & được miễn trừ liên tục!
        var earlyDay2 = await attendanceService.ProcessCheckInOutAsync(new CheckAttendanceRequest(
            emp.Id, null, 0.95f, null, new DateTimeOffset(2026, 11, 21, 7, 30, 0, TimeSpan.FromHours(7))));
        Assert.True(earlyDay2.IsFailure);
        Assert.Equal("EMPLOYEE_ON_LEAVE", earlyDay2.Error.Code);

        var eveningDay2Check = await leaveLookup.CheckApprovedLeaveAsync(
            emp.Id, new DateTimeOffset(2026, 11, 21, 20, 0, 0, TimeSpan.FromHours(7)));
        Assert.True(eveningDay2Check.HasApprovedLeave);

        // Không có AttendanceLog nào được tạo cho ngày 21/11
        var day2Logs = await attendanceService.GetDailyAttendanceLogsAsync(new DateOnly(2026, 11, 21));
        Assert.Empty(day2Logs);

        // 4. Ngày kết thúc (22/11) lúc 11:30 (trước 12:00) -> Vẫn đang nghỉ phép -> Chặn chấm công
        var beforeEndDay3 = await attendanceService.ProcessCheckInOutAsync(new CheckAttendanceRequest(
            emp.Id, null, 0.95f, null, new DateTimeOffset(2026, 11, 22, 11, 30, 0, TimeSpan.FromHours(7))));
        Assert.True(beforeEndDay3.IsFailure);
        Assert.Equal("EMPLOYEE_ON_LEAVE", beforeEndDay3.Error.Code);

        // 5. Ngày kết thúc (22/11) lúc 12:05 (sau giờ kết thúc 12:00) -> Hết nghỉ phép, chấm công hợp lệ ON_TIME
        var afterEndDay3 = await attendanceService.ProcessCheckInOutAsync(new CheckAttendanceRequest(
            emp.Id, null, 0.95f, null, new DateTimeOffset(2026, 11, 22, 12, 5, 0, TimeSpan.FromHours(7))));
        Assert.True(afterEndDay3.IsSuccess);
        Assert.Equal("ON_TIME", afterEndDay3.Value.Status);

        var afterEndLookup = await leaveLookup.CheckApprovedLeaveAsync(
            emp.Id, new DateTimeOffset(2026, 11, 22, 12, 5, 0, TimeSpan.FromHours(7)));
        Assert.False(afterEndLookup.HasApprovedLeave);
    }

    [Fact]
    public async Task Attendance_LeaveApproval_Should_Remove_Overlapping_CheckIn_And_Preserve_Valid_History()
    {
        using var provider = BuildModularServiceProvider(nameof(Attendance_LeaveApproval_Should_Remove_Overlapping_CheckIn_And_Preserve_Valid_History));
        using var scope = provider.CreateScope();

        var biometricsService = scope.ServiceProvider.GetRequiredService<IBiometricsService>();
        var attendanceService = scope.ServiceProvider.GetRequiredService<IAttendanceService>();
        var reportingDb = scope.ServiceProvider.GetRequiredService<ReportingDbContext>();

        var dept = (await biometricsService.CreateDepartmentAsync(
            new CreateDepartmentRequest("DEPT_CLN", "Phòng Kiểm thử", null))).Value;
        var shift = (await attendanceService.CreateShiftAsync(
            new CreateShiftRequest("SHIFT_CLN", "Ca Hành Chính", new TimeOnly(8, 0), new TimeOnly(17, 30), GraceMinutes: 15, IsDefault: true))).Value;
        var emp = (await biometricsService.CreateEmployeeAsync(
            new CreateEmployeeRequest("NV901", "Trần Quốc Tuấn", null, null, dept.Id, shift.Id, null))).Value;

        var day1 = new DateOnly(2026, 11, 20);

        // 1. Nhân viên lỡ chấm công lúc 08:25 (LATE) -> Đã lưu AttendanceLog và tăng PresentCount = 1, LateCount = 1
        var accidentalCheckIn = await attendanceService.ProcessCheckInOutAsync(new CheckAttendanceRequest(
            emp.Id, null, 0.95f, null, new DateTimeOffset(2026, 11, 20, 8, 25, 0, TimeSpan.FromHours(7))));
        Assert.True(accidentalCheckIn.IsSuccess);
        Assert.Single(await attendanceService.GetDailyAttendanceLogsAsync(day1));

        // 2. Sau đó tạo đơn nghỉ phép phủ vào thời điểm lỡ chấm công (08:00 - 17:30)
        // -> Lịch sử lỡ chấm công phải bị xóa, Reporting phải trừ lại PresentCount/LateCount về 0, và nhân viên vẫn IsActive = true
        var leaveRes = await attendanceService.CreateLeaveRequestAsync(new CreateLeaveRequestDto(
            emp.Id, day1, day1, "ANNUAL_LEAVE", "Nghỉ phép cả ngày"));
        Assert.True(leaveRes.IsSuccess);

        Assert.Empty(await attendanceService.GetDailyAttendanceLogsAsync(day1));

        var summaryAfterLeave = await reportingDb.DailyDepartmentSummaries
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.DepartmentId == dept.Id && x.SummaryDate == day1);
        Assert.NotNull(summaryAfterLeave);
        Assert.Equal(0, summaryAfterLeave.PresentCount);
        Assert.Equal(0, summaryAfterLeave.LateCount);

        var empAfterLeave = (await biometricsService.GetEmployeeByIdAsync(emp.Id)).Value;
        Assert.True(empAfterLeave.IsActive);

        // 3. Quét lại camera trong giờ nghỉ phép -> Phải báo chính xác "Nhân viên đang trong thời gian nghỉ phép"
        var retryRes = await attendanceService.ProcessCheckInOutAsync(new CheckAttendanceRequest(
            emp.Id, null, 0.95f, null, new DateTimeOffset(2026, 11, 20, 10, 0, 0, TimeSpan.FromHours(7))));
        Assert.True(retryRes.IsFailure);
        Assert.Equal("EMPLOYEE_ON_LEAVE", retryRes.Error.Code);
        Assert.Equal("Nhân viên đang trong thời gian nghỉ phép", retryRes.Error.Message);

        // 4. Ngày hôm sau: Check-in sáng hợp lệ (08:05) rồi chiều mới xin nghỉ đột xuất (14:00 - 17:30)
        // -> Lịch sử check-in hợp lệ buổi sáng PHẢI được giữ nguyên (không bị ngắt/xóa)
        var day2 = new DateOnly(2026, 11, 21);
        var validMorning = await attendanceService.ProcessCheckInOutAsync(new CheckAttendanceRequest(
            emp.Id, null, 0.95f, null, new DateTimeOffset(2026, 11, 21, 8, 5, 0, TimeSpan.FromHours(7))));
        Assert.True(validMorning.IsSuccess);

        var afternoonSuddenLeave = await attendanceService.CreateLeaveRequestAsync(new CreateLeaveRequestDto(
            emp.Id, day2, day2, "SUDDENLY_ALLOWED_LEAVE", "Nghỉ đột xuất buổi chiều",
            new TimeOnly(14, 0), new TimeOnly(17, 30)));
        Assert.True(afternoonSuddenLeave.IsSuccess);

        var day2Logs = await attendanceService.GetDailyAttendanceLogsAsync(day2);
        Assert.Single(day2Logs);
        Assert.Equal("ON_TIME", day2Logs[0].Status);
    }
}
