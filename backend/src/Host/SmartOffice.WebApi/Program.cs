using SmartOffice.Infrastructure;
using SmartOffice.Modules.Attendance;
using SmartOffice.Modules.Biometrics;
using SmartOffice.Modules.Occupancy;
using SmartOffice.Modules.Reporting;
using SmartOffice.Modules.Security;
using SmartOffice.WebApi.Middleware;

var builder = WebApplication.CreateBuilder(args);

// 1. Đăng ký Controllers từ toàn bộ các Module và SignalR Real-time Hub
builder.Services.AddControllers();
builder.Services.AddSignalR();

// 2. Đăng ký Hạ tầng dùng chung (In-Memory Event Bus, Object Storage...)
builder.Services.AddSharedInfrastructure();

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

// Middleware xử lý ngoại lệ tập trung
app.UseMiddleware<GlobalExceptionMiddleware>();

app.UseCors("AllowFrontend");
app.UseAuthorization();

app.MapControllers();

// Endpoint kiểm tra trạng thái kiến trúc Modular Monolith và 5 Schema độc lập
app.MapGet("/api/health", () => Results.Ok(new
{
    system = "Smart Office Computer Vision Backend (Modular Monolith)",
    status = "Healthy",
    modules = new[]
    {
        new { module = "Biometrics", schema = "biometrics", dbContext = "BiometricsDbContext" },
        new { module = "Attendance", schema = "attendance", dbContext = "AttendanceDbContext" },
        new { module = "Occupancy",  schema = "occupancy",  dbContext = "OccupancyDbContext" },
        new { module = "Security",   schema = "security",   dbContext = "SecurityDbContext" },
        new { module = "Reporting",  schema = "reporting",  dbContext = "ReportingDbContext" }
    },
    timestamp = DateTimeOffset.UtcNow
}));

app.Run();
