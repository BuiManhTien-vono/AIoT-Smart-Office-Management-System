using Microsoft.EntityFrameworkCore;
using SmartOffice.Modules.Biometrics.Domain;

namespace SmartOffice.Modules.Biometrics.Infrastructure;

/// <summary>
/// DbContext độc lập của Module Biometrics, cô lập hoàn toàn trong schema "biometrics".
/// Ánh xạ tường minh tên cột snake_case khớp với 01_init_schemas_and_tables.sql.
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
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.DepartmentCode).HasColumnName("department_code").HasMaxLength(20).IsRequired();
            entity.Property(x => x.DepartmentName).HasColumnName("department_name").HasMaxLength(100).IsRequired();
            entity.Property(x => x.Description).HasColumnName("description").HasMaxLength(255);
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            entity.HasIndex(x => x.DepartmentCode).IsUnique();
        });

        modelBuilder.Entity<Employee>(entity =>
        {
            entity.ToTable("employees");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.EmployeeCode).HasColumnName("employee_code").HasMaxLength(20).IsRequired();
            entity.Property(x => x.FullName).HasColumnName("full_name").HasMaxLength(100).IsRequired();
            entity.Property(x => x.Email).HasColumnName("email").HasMaxLength(120);
            entity.Property(x => x.PhoneNumber).HasColumnName("phone_number").HasMaxLength(20);
            entity.Property(x => x.DepartmentId).HasColumnName("department_id");
            entity.Property(x => x.DefaultShiftId).HasColumnName("default_shift_id");
            entity.Property(x => x.AvatarObjectKey).HasColumnName("avatar_object_key").HasMaxLength(255);
            entity.Property(x => x.IsActive).HasColumnName("is_active");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
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
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.EmployeeId).HasColumnName("employee_id");
            entity.Property(x => x.EmbeddingVector).HasColumnName("embedding_vector");
            entity.Property(x => x.SampleImageKey).HasColumnName("sample_image_key").HasMaxLength(255).IsRequired();
            entity.Property(x => x.QualityScore).HasColumnName("quality_score");
            entity.Property(x => x.PoseLabel).HasColumnName("pose_label").HasMaxLength(30);
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Ignore(x => x.UpdatedAt);
        });
    }
}
