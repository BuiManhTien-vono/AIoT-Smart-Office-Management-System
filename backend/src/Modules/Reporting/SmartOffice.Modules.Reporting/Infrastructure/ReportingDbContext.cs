using Microsoft.EntityFrameworkCore;
using SmartOffice.Modules.Reporting.Domain;

namespace SmartOffice.Modules.Reporting.Infrastructure;

/// <summary>
/// DbContext độc lập của Module Reporting, cô lập hoàn toàn trong schema "reporting".
/// Ánh xạ tường minh tên cột snake_case khớp với 01_init_schemas_and_tables.sql.
/// </summary>
public sealed class ReportingDbContext(DbContextOptions<ReportingDbContext> options) : DbContext(options)
{
    public const string SchemaName = "reporting";

    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<DailyDepartmentSummary> DailyDepartmentSummaries => Set<DailyDepartmentSummary>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(SchemaName);

        modelBuilder.Entity<AppUser>(entity =>
        {
            entity.ToTable("users");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.Username).HasColumnName("username").HasMaxLength(50).IsRequired();
            entity.Property(x => x.PasswordHash).HasColumnName("password_hash").HasMaxLength(255).IsRequired();
            entity.Property(x => x.FullName).HasColumnName("full_name").HasMaxLength(100).IsRequired();
            entity.Property(x => x.Role).HasColumnName("role").HasMaxLength(20).IsRequired();
            entity.Property(x => x.DepartmentId).HasColumnName("department_id");
            entity.Property(x => x.IsActive).HasColumnName("is_active");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Ignore(x => x.UpdatedAt);
            entity.HasIndex(x => x.Username).IsUnique();
        });

        modelBuilder.Entity<DailyDepartmentSummary>(entity =>
        {
            entity.ToTable("daily_department_summaries");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.SummaryDate).HasColumnName("summary_date");
            entity.Property(x => x.DepartmentId).HasColumnName("department_id");
            entity.Property(x => x.DepartmentCode).HasColumnName("department_code").HasMaxLength(20).IsRequired();
            entity.Property(x => x.TotalEmployees).HasColumnName("total_employees");
            entity.Property(x => x.PresentCount).HasColumnName("present_count");
            entity.Property(x => x.LateCount).HasColumnName("late_count");
            entity.Property(x => x.AbsentCount).HasColumnName("absent_count");
            entity.Property(x => x.ProlongedAwayEvents).HasColumnName("prolonged_away_events");
            entity.Property(x => x.SecurityAlertsCount).HasColumnName("security_alerts_count");
            entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            entity.Ignore(x => x.CreatedAt);
            entity.HasIndex(x => new { x.SummaryDate, x.DepartmentId }).IsUnique();
        });
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        foreach (var entry in ChangeTracker.Entries<DailyDepartmentSummary>())
        {
            if (entry.State is EntityState.Added or EntityState.Modified)
            {
                entry.Entity.UpdatedAt = DateTimeOffset.UtcNow;
            }
        }

        return base.SaveChangesAsync(cancellationToken);
    }
}
