using Microsoft.EntityFrameworkCore;
using SmartOffice.Modules.Security.Domain;

namespace SmartOffice.Modules.Security.Infrastructure;

/// <summary>
/// DbContext độc lập của Module Security, cô lập hoàn toàn trong schema "security".
/// </summary>
public sealed class SecurityDbContext(DbContextOptions<SecurityDbContext> options) : DbContext(options)
{
    public const string SchemaName = "security";

    public DbSet<OtRegistration> OtRegistrations => Set<OtRegistration>();
    public DbSet<SecurityIncident> SecurityIncidents => Set<SecurityIncident>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(SchemaName);

        modelBuilder.Entity<OtRegistration>(entity =>
        {
            entity.ToTable("ot_registrations");
            entity.HasKey(x => x.Id);
        });

        modelBuilder.Entity<SecurityIncident>(entity =>
        {
            entity.ToTable("security_incidents");
            entity.HasKey(x => x.Id);
        });
    }
}

