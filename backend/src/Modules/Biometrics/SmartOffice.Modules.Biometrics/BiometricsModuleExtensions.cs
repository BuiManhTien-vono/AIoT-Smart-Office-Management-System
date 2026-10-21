using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SmartOffice.Modules.Biometrics.Infrastructure;

namespace SmartOffice.Modules.Biometrics;

public static class BiometricsModuleExtensions
{
    public static IServiceCollection AddBiometricsModule(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Database");

        services.AddDbContext<BiometricsDbContext>(options =>
            options.UseNpgsql(connectionString, npgsql =>
                npgsql.MigrationsHistoryTable("__EFMigrationsHistory", BiometricsDbContext.SchemaName)));

        return services;
    }
}
