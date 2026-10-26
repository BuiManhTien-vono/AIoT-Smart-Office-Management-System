using Microsoft.EntityFrameworkCore;
using SmartOffice.Modules.Reporting.Domain;

namespace SmartOffice.Modules.Reporting.Infrastructure;

/// <summary>
/// DbContext độc lập của Module Reporting, cô lập hoàn toàn trong schema "reporting".
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
            entity.HasIndex(x => x.Username).IsUnique();
        });

        modelBuilder.Entity<DailyDepartmentSummary>(entity =>
        {
            entity.ToTable("daily_department_summaries");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.SummaryDate, x.DepartmentId }).IsUnique();
        });
    }
}

