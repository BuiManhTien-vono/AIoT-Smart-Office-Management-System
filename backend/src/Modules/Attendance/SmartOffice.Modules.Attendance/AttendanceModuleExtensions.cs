using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SmartOffice.Modules.Attendance.Application.Services;
using SmartOffice.Modules.Attendance.Infrastructure;

namespace SmartOffice.Modules.Attendance;

public static class AttendanceModuleExtensions
{
    public static IServiceCollection AddAttendanceModule(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Database");

        services.AddDbContext<AttendanceDbContext>(options =>
            options.UseNpgsql(connectionString, npgsql =>
                npgsql.MigrationsHistoryTable("__EFMigrationsHistory", AttendanceDbContext.SchemaName)));

        services.AddScoped<IAttendanceService, AttendanceService>();

        return services;
    }
}
