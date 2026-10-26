using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SmartOffice.Modules.Reporting.Application.Handlers;
using SmartOffice.Modules.Reporting.Infrastructure;
using SmartOffice.SharedKernel.Events;

namespace SmartOffice.Modules.Reporting;

public static class ReportingModuleExtensions
{
    public static IServiceCollection AddReportingModule(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Database");

        services.AddDbContext<ReportingDbContext>(options =>
            options.UseNpgsql(connectionString, npgsql =>
                npgsql.MigrationsHistoryTable("__EFMigrationsHistory", ReportingDbContext.SchemaName)));

        // Đăng ký các bộ lắng nghe sự kiện tích hợp (In-Memory Event Bus Handlers - Buổi 6)
        services.AddScoped<IIntegrationEventHandler<EmployeeRegisteredIntegrationEvent>, EmployeeRegisteredEventHandler>();
        services.AddScoped<IIntegrationEventHandler<AttendanceCheckedIntegrationEvent>, AttendanceCheckedEventHandler>();

        return services;
    }
}
