using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SmartOffice.Modules.Security.Application.Handlers;
using SmartOffice.Modules.Security.Application.Services;
using SmartOffice.Modules.Security.Infrastructure;
using SmartOffice.SharedKernel.Contracts;
using SmartOffice.SharedKernel.Events;

namespace SmartOffice.Modules.Security;

public static class SecurityModuleExtensions
{
    public static IServiceCollection AddSecurityModule(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var useInMemory = string.Equals(configuration["Database:UseInMemory"], "true", StringComparison.OrdinalIgnoreCase);
        var connectionString = configuration.GetConnectionString("Database");

        services.AddDbContext<SecurityDbContext>(options =>
        {
            if (useInMemory || string.IsNullOrWhiteSpace(connectionString))
            {
                options.UseInMemoryDatabase($"SmartOffice_{SecurityDbContext.SchemaName}");
            }
            else
            {
                options.UseNpgsql(connectionString, npgsql =>
                    npgsql.MigrationsHistoryTable("__EFMigrationsHistory", SecurityDbContext.SchemaName));
            }
        });

        services.AddScoped<IOtService, OtService>();
        services.AddScoped<IOvertimeLookupContract, OtService>();
        services.AddScoped<ISecurityIncidentService, SecurityIncidentService>();
        services.AddScoped<IIntegrationEventHandler<SecurityIncidentDetectedIntegrationEvent>, SecurityIncidentDetectedIntegrationEventHandler>();

        return services;
    }
}
