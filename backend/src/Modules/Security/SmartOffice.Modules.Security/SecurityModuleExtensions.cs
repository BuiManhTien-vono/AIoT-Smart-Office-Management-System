using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SmartOffice.Modules.Security.Infrastructure;

namespace SmartOffice.Modules.Security;

public static class SecurityModuleExtensions
{
    public static IServiceCollection AddSecurityModule(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Database");

        services.AddDbContext<SecurityDbContext>(options =>
            options.UseNpgsql(connectionString, npgsql =>
                npgsql.MigrationsHistoryTable("__EFMigrationsHistory", SecurityDbContext.SchemaName)));

        return services;
    }
}

