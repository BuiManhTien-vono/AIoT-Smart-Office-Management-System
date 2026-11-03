using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SmartOffice.Modules.Biometrics.Application.Services;
using SmartOffice.Modules.Biometrics.Infrastructure;
using SmartOffice.SharedKernel.Contracts;

namespace SmartOffice.Modules.Biometrics;

public static class BiometricsModuleExtensions
{
    public static IServiceCollection AddBiometricsModule(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var useInMemory = string.Equals(configuration["Database:UseInMemory"], "true", StringComparison.OrdinalIgnoreCase);
        var connectionString = configuration.GetConnectionString("Database");

        services.AddDbContext<BiometricsDbContext>(options =>
        {
            if (useInMemory || string.IsNullOrWhiteSpace(connectionString))
            {
                options.UseInMemoryDatabase($"SmartOffice_{BiometricsDbContext.SchemaName}");
            }
            else
            {
                options.UseNpgsql(connectionString, npgsql =>
                    npgsql.MigrationsHistoryTable("__EFMigrationsHistory", BiometricsDbContext.SchemaName));
            }
        });

        services.AddScoped<IBiometricsService, BiometricsService>();
        services.AddScoped<IEmployeeLookupContract, BiometricsEmployeeLookupService>();

        return services;
    }
}
