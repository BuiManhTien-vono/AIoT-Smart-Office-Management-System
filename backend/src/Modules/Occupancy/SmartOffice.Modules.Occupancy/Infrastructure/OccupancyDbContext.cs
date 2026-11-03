using Microsoft.EntityFrameworkCore;
using SmartOffice.Modules.Occupancy.Domain;

namespace SmartOffice.Modules.Occupancy.Infrastructure;

/// <summary>
/// DbContext độc lập của Module Occupancy, cô lập hoàn toàn trong schema "occupancy".
/// Ánh xạ tường minh tên cột snake_case khớp với 01_init_schemas_and_tables.sql.
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
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.CameraCode).HasColumnName("camera_code").HasMaxLength(30).IsRequired();
            entity.Property(x => x.CameraName).HasColumnName("camera_name").HasMaxLength(100).IsRequired();
            entity.Property(x => x.CameraType).HasColumnName("camera_type").HasMaxLength(20).IsRequired();
            entity.Property(x => x.DepartmentId).HasColumnName("department_id");
            entity.Property(x => x.StreamSource).HasColumnName("stream_source").HasMaxLength(500).IsRequired();
            entity.Property(x => x.CalibrationFrameKey).HasColumnName("calibration_frame_key").HasMaxLength(255);
            entity.Property(x => x.IsOnline).HasColumnName("is_online");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Ignore(x => x.UpdatedAt);
            entity.HasIndex(x => x.CameraCode).IsUnique();
        });

        modelBuilder.Entity<Seat>(entity =>
        {
            entity.ToTable("seats");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.SeatCode).HasColumnName("seat_code").HasMaxLength(30).IsRequired();
            entity.Property(x => x.SeatName).HasColumnName("seat_name").HasMaxLength(100).IsRequired();
            entity.Property(x => x.ZoneType).HasColumnName("zone_type").HasMaxLength(30).IsRequired();
            entity.Property(x => x.CameraId).HasColumnName("camera_id");
            entity.Property(x => x.DepartmentId).HasColumnName("department_id");
            entity.Property(x => x.AssignedEmployeeId).HasColumnName("assigned_employee_id");
            entity.Property(x => x.PolygonPointsJson).HasColumnName("polygon_points").HasColumnType("jsonb").IsRequired();
            entity.Property(x => x.CurrentState).HasColumnName("current_state").HasMaxLength(20).IsRequired();
            entity.Property(x => x.ActiveSecondsToday).HasColumnName("active_seconds_today");
            entity.Property(x => x.StateUpdatedAt).HasColumnName("state_updated_at");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Ignore(x => x.UpdatedAt);
            entity.HasIndex(x => x.SeatCode).IsUnique();
        });

        modelBuilder.Entity<SeatOccupancyLog>(entity =>
        {
            entity.ToTable("seat_occupancy_logs");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.SeatId).HasColumnName("seat_id");
            entity.Property(x => x.DetectedEmployeeId).HasColumnName("detected_employee_id");
            entity.Property(x => x.PreviousState).HasColumnName("previous_state").HasMaxLength(20).IsRequired();
            entity.Property(x => x.NewState).HasColumnName("new_state").HasMaxLength(20).IsRequired();
            entity.Property(x => x.DurationSeconds).HasColumnName("duration_seconds");
            entity.Property(x => x.RecordedAt).HasColumnName("recorded_at");
            entity.Ignore(x => x.CreatedAt);
            entity.Ignore(x => x.UpdatedAt);
        });
    }
}
