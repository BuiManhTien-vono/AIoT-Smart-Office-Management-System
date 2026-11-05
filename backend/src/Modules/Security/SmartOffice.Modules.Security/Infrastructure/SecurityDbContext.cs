using Microsoft.EntityFrameworkCore;
using SmartOffice.Modules.Security.Domain;

namespace SmartOffice.Modules.Security.Infrastructure;

/// <summary>
/// DbContext độc lập của Module Security, cô lập hoàn toàn trong schema "security".
/// Ánh xạ tường minh tên cột snake_case khớp với 01_init_schemas_and_tables.sql.
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
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.EmployeeId).HasColumnName("employee_id");
            entity.Property(x => x.EmployeeCode).HasColumnName("employee_code").HasMaxLength(20).IsRequired();
            entity.Property(x => x.OtDate).HasColumnName("ot_date");
            entity.Property(x => x.StartTime).HasColumnName("start_time");
            entity.Property(x => x.EndTime).HasColumnName("end_time");
            entity.Property(x => x.Reason).HasColumnName("reason").HasMaxLength(255);
            entity.Property(x => x.ApprovalStatus).HasColumnName("approval_status").HasMaxLength(20).IsRequired();
            entity.Property(x => x.ApprovedByUserId).HasColumnName("approved_by_user_id");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Ignore(x => x.UpdatedAt);
            entity.HasIndex(x => new { x.OtDate, x.EmployeeId });
        });

        modelBuilder.Entity<SecurityIncident>(entity =>
        {
            entity.ToTable("security_incidents");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.CameraId).HasColumnName("camera_id");
            entity.Property(x => x.DetectedEmployeeId).HasColumnName("detected_employee_id");
            entity.Property(x => x.AlertLevel).HasColumnName("alert_level").HasMaxLength(30).IsRequired();
            entity.Property(x => x.SnapshotObjectKey).HasColumnName("snapshot_object_key").HasMaxLength(255).IsRequired();
            entity.Property(x => x.VideoClipObjectKey).HasColumnName("video_clip_object_key").HasMaxLength(255);
            entity.Property(x => x.TelegramSent).HasColumnName("telegram_sent");
            entity.Property(x => x.TicketStatus).HasColumnName("ticket_status").HasMaxLength(20).IsRequired();
            entity.Property(x => x.ResolutionNote).HasColumnName("resolution_note");
            entity.Property(x => x.ResolvedByUserId).HasColumnName("resolved_by_user_id");
            entity.Property(x => x.DetectedAt).HasColumnName("detected_at");
            entity.Property(x => x.ResolvedAt).HasColumnName("resolved_at");
            entity.Ignore(x => x.CreatedAt);
            entity.Ignore(x => x.UpdatedAt);
            entity.HasIndex(x => new { x.TicketStatus, x.DetectedAt });
        });
    }
}
