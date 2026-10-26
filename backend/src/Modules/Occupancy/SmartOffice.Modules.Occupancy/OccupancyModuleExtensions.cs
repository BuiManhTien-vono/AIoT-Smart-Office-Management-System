using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SmartOffice.Modules.Occupancy.Infrastructure;

namespace SmartOffice.Modules.Occupancy;

public static class OccupancyModuleExtensions
{
    public static IServiceCollection AddOccupancyModule(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Database");

        services.AddDbContext<OccupancyDbContext>(options =>
            options.UseNpgsql(connectionString, npgsql =>
                npgsql.MigrationsHistoryTable("__EFMigrationsHistory", OccupancyDbContext.SchemaName)));

        return services;
    }
}

