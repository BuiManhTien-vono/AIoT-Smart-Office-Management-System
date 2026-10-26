using Microsoft.EntityFrameworkCore;
using SmartOffice.Modules.Biometrics.Domain;

namespace SmartOffice.Modules.Biometrics.Infrastructure;

/// <summary>
/// DbContext độc lập của Module Biometrics, cô lập hoàn toàn trong schema "biometrics".
/// </summary>
public sealed class BiometricsDbContext(DbContextOptions<BiometricsDbContext> options) : DbContext(options)
{
    public const string SchemaName = "biometrics";

    public DbSet<Department> Departments => Set<Department>();
    public DbSet<Employee> Employees => Set<Employee>();
    public DbSet<BiometricVector> BiometricVectors => Set<BiometricVector>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(SchemaName);

        modelBuilder.Entity<Department>(entity =>
        {
            entity.ToTable("departments");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => x.DepartmentCode).IsUnique();
        });

        modelBuilder.Entity<Employee>(entity =>
        {
            entity.ToTable("employees");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => x.EmployeeCode).IsUnique();
            entity.HasMany(x => x.BiometricVectors)
                  .WithOne()
                  .HasForeignKey(v => v.EmployeeId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<BiometricVector>(entity =>
        {
            entity.ToTable("biometric_vectors");
            entity.HasKey(x => x.Id);
        });
    }
}

