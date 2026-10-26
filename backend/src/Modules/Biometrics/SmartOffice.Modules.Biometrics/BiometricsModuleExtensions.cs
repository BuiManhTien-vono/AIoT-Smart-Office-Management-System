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
        var connectionString = configuration.GetConnectionString("Database");

        services.AddDbContext<BiometricsDbContext>(options =>
            options.UseNpgsql(connectionString, npgsql =>
                npgsql.MigrationsHistoryTable("__EFMigrationsHistory", BiometricsDbContext.SchemaName)));

        // Đăng ký dịch vụ nghiệp vụ nội bộ của Module 1 (Biometrics)
        services.AddScoped<IBiometricsService, BiometricsService>();

        // Đăng ký Contract Interface (Phương thức 2) để các Module khác tra cứu thông tin nhân viên
        services.AddScoped<IEmployeeLookupContract, BiometricsEmployeeLookupService>();

        return services;
    }
}
