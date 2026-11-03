using Microsoft.EntityFrameworkCore;
using SmartOffice.Infrastructure;
using SmartOffice.Modules.Attendance;
using SmartOffice.Modules.Attendance.Domain;
using SmartOffice.Modules.Attendance.Infrastructure;
using SmartOffice.Modules.Biometrics;
using SmartOffice.Modules.Biometrics.Domain;
using SmartOffice.Modules.Biometrics.Infrastructure;
using SmartOffice.Modules.Occupancy;
using SmartOffice.Modules.Occupancy.Domain;
using SmartOffice.Modules.Occupancy.Endpoints;
using SmartOffice.Modules.Occupancy.Infrastructure;
using SmartOffice.Modules.Reporting;
using SmartOffice.Modules.Reporting.Application.Services;
using SmartOffice.Modules.Reporting.Domain;
using SmartOffice.Modules.Reporting.Infrastructure;
using SmartOffice.Modules.Security;
using SmartOffice.WebApi.Middleware;
using SmartOffice.WebApi.Swagger;

var builder = WebApplication.CreateBuilder(args);

// 1. Đăng ký Controllers, API Explorer (Swagger/OpenAPI) và SignalR Real-time Hub
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSignalR();

// 2. Đăng ký Hạ tầng dùng chung (In-Memory Event Bus, Object Storage S3/R2/MinIO...)
builder.Services.AddSharedInfrastructure(builder.Configuration);

// 3. Đăng ký 5 Module Nghiệp vụ độc lập (Mỗi Module sở hữu DbContext & Schema riêng)
builder.Services
    .AddBiometricsModule(builder.Configuration)
    .AddAttendanceModule(builder.Configuration)
    .AddOccupancyModule(builder.Configuration)
    .AddSecurityModule(builder.Configuration)
    .AddReportingModule(builder.Configuration);

// 4. Cấu hình CORS cho giao diện Web React
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.SetIsOriginAllowed(_ => true)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

var app = builder.Build();

// Khởi tạo dữ liệu mẫu (Seed Data) phục vụ kiểm thử Swagger
await SeedInitialDemoDataAsync(app.Services);

// Middleware xử lý ngoại lệ tập trung
app.UseMiddleware<GlobalExceptionMiddleware>();

app.UseCors("AllowFrontend");
app.UseAuthorization();

// 5. Map Swagger UI (/swagger) và OpenAPI JSON (/swagger/v1/swagger.json)
app.MapSmartOfficeSwagger();

app.MapControllers();

// 6. Map SignalR Hub cho Live Seat Map & Cảnh báo hiện diện thời gian thực (W2-4)
app.MapHub<OccupancyHub>("/hubs/occupancy");

// Endpoint kiểm tra trạng thái kiến trúc Modular Monolith và 5 Schema độc lập
app.MapGet("/api/health", () => Results.Ok(new
{
    system = "Smart Office Computer Vision Backend (Modular Monolith)",
    status = "Healthy",
    swaggerUrl = "/swagger",
    openApiSpecUrl = "/swagger/v1/swagger.json",
    modules = new[]
    {
        new { module = "Biometrics", schema = "biometrics", dbContext = "BiometricsDbContext" },
        new { module = "Attendance", schema = "attendance", dbContext = "AttendanceDbContext" },
        new { module = "Occupancy",  schema = "occupancy",  dbContext = "OccupancyDbContext" },
        new { module = "Security",   schema = "security",   dbContext = "SecurityDbContext" },
        new { module = "Reporting",  schema = "reporting",  dbContext = "ReportingDbContext" }
    },
    hubs = new[] { "/hubs/occupancy" },
    timestamp = DateTimeOffset.UtcNow
}));

app.Run();

static async Task SeedInitialDemoDataAsync(IServiceProvider rootProvider)
{
    using var scope = rootProvider.CreateScope();
    var bioDb = scope.ServiceProvider.GetRequiredService<BiometricsDbContext>();
    var attDb = scope.ServiceProvider.GetRequiredService<AttendanceDbContext>();
    var occDb = scope.ServiceProvider.GetRequiredService<OccupancyDbContext>();
    var repDb = scope.ServiceProvider.GetRequiredService<ReportingDbContext>();

    try
    {
        var deptItId = Guid.Parse("11111111-1111-1111-1111-111111111101");
        var deptHrId = Guid.Parse("11111111-1111-1111-1111-111111111102");
        var shiftHcId = Guid.Parse("22222222-2222-2222-2222-222222222201");
        var camGateId = Guid.Parse("33333333-3333-3333-3333-333333333301");
        var camDeskId = Guid.Parse("33333333-3333-3333-3333-333333333302");

        if (!await bioDb.Departments.AnyAsync())
        {
            bioDb.Departments.AddRange(
                new Department
                {
                    Id = deptItId,
                    DepartmentCode = "DEPT_IT",
                    DepartmentName = "Phòng Kỹ thuật Phần mềm & AI",
                    Description = "Phát triển hệ thống và vận hành hạ tầng"
                },
                new Department
                {
                    Id = deptHrId,
                    DepartmentCode = "DEPT_HR",
                    DepartmentName = "Phòng Hành chính Nhân sự",
                    Description = "Quản trị nhân sự và tổng hợp bảng công"
                });
            await bioDb.SaveChangesAsync();
        }

        if (!await attDb.Shifts.AnyAsync())
        {
            attDb.Shifts.Add(new Shift
            {
                Id = shiftHcId,
                ShiftCode = "SHIFT_HC",
                ShiftName = "Ca Hành chính Tiêu chuẩn",
                StartTime = new TimeOnly(8, 0),
                EndTime = new TimeOnly(17, 30),
                GraceMinutes = 15,
                LunchStart = new TimeOnly(12, 0),
                LunchEnd = new TimeOnly(13, 30),
                IsDefault = true
            });
            await attDb.SaveChangesAsync();
        }

        if (!await occDb.Cameras.AnyAsync())
        {
            occDb.Cameras.AddRange(
                new Camera
                {
                    Id = camGateId,
                    CameraCode = "CAM_GATE_01",
                    CameraName = "Camera Cửa Sảnh Chính",
                    CameraType = "GATE",
                    DepartmentId = deptItId,
                    StreamSource = "rtsp://localhost:8554/gate01",
                    IsOnline = true
                },
                new Camera
                {
                    Id = camDeskId,
                    CameraCode = "CAM_DESK_IT",
                    CameraName = "Camera Phòng Kỹ thuật",
                    CameraType = "DESK",
                    DepartmentId = deptItId,
                    StreamSource = "rtsp://localhost:8554/desk_it",
                    IsOnline = true
                });
            await occDb.SaveChangesAsync();
        }

        if (!await repDb.Users.AnyAsync())
        {
            repDb.Users.Add(new AppUser
            {
                Username = "admin_smartoffice",
                PasswordHash = ReportingService.HashPassword("Admin@123"),
                FullName = "Quản trị viên Hệ thống",
                Role = "ADMIN",
                IsActive = true
            });
            await repDb.SaveChangesAsync();
        }
    }
    catch
    {
        // Bỏ qua nếu kết nối PostgreSQL ngoài chưa khởi tạo schema
    }
}
