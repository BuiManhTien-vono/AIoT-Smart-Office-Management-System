using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SmartOffice.Modules.Occupancy.Application.Handlers;
using SmartOffice.Modules.Occupancy.Application.Services;
using SmartOffice.Modules.Occupancy.Infrastructure;
using SmartOffice.SharedKernel.Events;

namespace SmartOffice.Modules.Occupancy;

public static class OccupancyModuleExtensions
{
    public static IServiceCollection AddOccupancyModule(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var useInMemory = string.Equals(configuration["Database:UseInMemory"], "true", StringComparison.OrdinalIgnoreCase);
        var connectionString = configuration.GetConnectionString("Database");

        services.AddDbContext<OccupancyDbContext>(options =>
        {
            if (useInMemory || string.IsNullOrWhiteSpace(connectionString))
            {
                options.UseInMemoryDatabase($"SmartOffice_{OccupancyDbContext.SchemaName}");
            }
            else
            {
                options.UseNpgsql(connectionString, npgsql =>
                    npgsql.MigrationsHistoryTable("__EFMigrationsHistory", OccupancyDbContext.SchemaName));
            }
        });

        services.AddScoped<IOccupancyService, OccupancyService>();

        services.AddScoped<IIntegrationEventHandler<SeatStateChangedIntegrationEvent>, SeatStateChangedRealtimeHandler>();
        services.AddScoped<IIntegrationEventHandler<ProlongedAbsenceDetectedIntegrationEvent>, ProlongedAbsenceRealtimeHandler>();
        services.AddScoped<IIntegrationEventHandler<WrongSeatDetectedIntegrationEvent>, WrongSeatRealtimeHandler>();

        return services;
    }
}
