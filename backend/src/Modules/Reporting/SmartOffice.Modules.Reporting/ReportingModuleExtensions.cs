using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SmartOffice.Modules.Reporting.Application.Handlers;
using SmartOffice.Modules.Reporting.Application.Services;
using SmartOffice.Modules.Reporting.Infrastructure;
using SmartOffice.SharedKernel.Events;

namespace SmartOffice.Modules.Reporting;

public static class ReportingModuleExtensions
{
    public static IServiceCollection AddReportingModule(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var useInMemory = string.Equals(configuration["Database:UseInMemory"], "true", StringComparison.OrdinalIgnoreCase);
        var connectionString = configuration.GetConnectionString("Database");

        services.AddDbContext<ReportingDbContext>(options =>
        {
            if (useInMemory || string.IsNullOrWhiteSpace(connectionString))
            {
                options.UseInMemoryDatabase($"SmartOffice_{ReportingDbContext.SchemaName}");
            }
            else
            {
                options.UseNpgsql(connectionString, npgsql =>
                    npgsql.MigrationsHistoryTable("__EFMigrationsHistory", ReportingDbContext.SchemaName));
            }
        });

        services.AddScoped<IReportingService, ReportingService>();

        services.AddScoped<IIntegrationEventHandler<EmployeeRegisteredIntegrationEvent>, EmployeeRegisteredEventHandler>();
        services.AddScoped<IIntegrationEventHandler<AttendanceCheckedIntegrationEvent>, AttendanceCheckedEventHandler>();
        services.AddScoped<IIntegrationEventHandler<AttendanceAbsentMarkedIntegrationEvent>, AttendanceAbsentMarkedEventHandler>();
        services.AddScoped<IIntegrationEventHandler<ProlongedAbsenceDetectedIntegrationEvent>, ProlongedAbsenceDetectedEventHandler>();
        services.AddScoped<IIntegrationEventHandler<SecurityIncidentDetectedIntegrationEvent>, SecurityIncidentDetectedEventHandler>();

        return services;
    }
}
