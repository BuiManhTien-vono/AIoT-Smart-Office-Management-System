using Microsoft.EntityFrameworkCore;
using SmartOffice.Modules.Occupancy.Domain;

namespace SmartOffice.Modules.Occupancy.Infrastructure;

/// <summary>
/// DbContext độc lập của Module Occupancy, cô lập hoàn toàn trong schema "occupancy".
/// </summary>
public sealed class OccupancyDbContext(DbContextOptions<OccupancyDbContext> options) : DbContext(options)
{
    public const string SchemaName = "occupancy";

    public DbSet<Camera> Cameras => Set<Camera>();
    public DbSet<Seat> Seats => Set<Seat>();
    public DbSet<SeatOccupancyLog> SeatOccupancyLogs => Set<SeatOccupancyLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(SchemaName);

        modelBuilder.Entity<Camera>(entity =>
        {
            entity.ToTable("cameras");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => x.CameraCode).IsUnique();
        });

        modelBuilder.Entity<Seat>(entity =>
        {
            entity.ToTable("seats");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => x.SeatCode).IsUnique();
        });

        modelBuilder.Entity<SeatOccupancyLog>(entity =>
        {
            entity.ToTable("seat_occupancy_logs");
            entity.HasKey(x => x.Id);
        });
    }
}
