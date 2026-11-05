using Microsoft.EntityFrameworkCore;
using SmartOffice.Modules.Attendance.Domain;

namespace SmartOffice.Modules.Attendance.Infrastructure;

/// <summary>
/// DbContext độc lập của Module Attendance, cô lập hoàn toàn trong schema "attendance".
/// Ánh xạ tường minh tên cột snake_case khớp với 01_init_schemas_and_tables.sql.
/// </summary>
public sealed class AttendanceDbContext(DbContextOptions<AttendanceDbContext> options) : DbContext(options)
{
    public const string SchemaName = "attendance";

    public DbSet<Shift> Shifts => Set<Shift>();
    public DbSet<AttendanceLog> AttendanceLogs => Set<AttendanceLog>();
    public DbSet<LeaveRequest> LeaveRequests => Set<LeaveRequest>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(SchemaName);

        modelBuilder.Entity<Shift>(entity =>
        {
            entity.ToTable("shifts");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.ShiftCode).HasColumnName("shift_code").HasMaxLength(20).IsRequired();
            entity.Property(x => x.ShiftName).HasColumnName("shift_name").HasMaxLength(100).IsRequired();
            entity.Property(x => x.StartTime).HasColumnName("start_time");
            entity.Property(x => x.EndTime).HasColumnName("end_time");
            entity.Property(x => x.GraceMinutes).HasColumnName("grace_minutes");
            entity.Property(x => x.LunchStart).HasColumnName("lunch_start");
            entity.Property(x => x.LunchEnd).HasColumnName("lunch_end");
            entity.Property(x => x.IsDefault).HasColumnName("is_default");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Ignore(x => x.UpdatedAt);
            entity.HasIndex(x => x.ShiftCode).IsUnique();
        });

        modelBuilder.Entity<AttendanceLog>(entity =>
        {
            entity.ToTable("attendance_logs");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.EmployeeId).HasColumnName("employee_id");
            entity.Property(x => x.EmployeeCode).HasColumnName("employee_code").HasMaxLength(20).IsRequired();
            entity.Property(x => x.ShiftId).HasColumnName("shift_id");
            entity.Property(x => x.GateCameraId).HasColumnName("gate_camera_id");
            entity.Property(x => x.WorkDate).HasColumnName("work_date");
            entity.Property(x => x.CheckInTime).HasColumnName("check_in_time");
            entity.Property(x => x.CheckOutTime).HasColumnName("check_out_time");
            entity.Property(x => x.LastSeenTime).HasColumnName("last_seen_time");
            entity.Property(x => x.Status).HasColumnName("status").HasMaxLength(20).IsRequired();
            entity.Property(x => x.LateMinutes).HasColumnName("late_minutes");
            entity.Property(x => x.EarlyLeaveMinutes).HasColumnName("early_leave_minutes");
            entity.Property(x => x.MatchConfidence).HasColumnName("match_confidence");
            entity.Property(x => x.CheckinSnapshotKey).HasColumnName("checkin_snapshot_key").HasMaxLength(255);
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            entity.HasIndex(x => new { x.EmployeeId, x.WorkDate }).IsUnique();
        });

        modelBuilder.Entity<LeaveRequest>(entity =>
        {
            entity.ToTable("leave_requests");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.EmployeeId).HasColumnName("employee_id");
            entity.Property(x => x.StartDate).HasColumnName("start_date");
            entity.Property(x => x.EndDate).HasColumnName("end_date");
            entity.Property(x => x.LeaveType).HasColumnName("leave_type").HasMaxLength(30).IsRequired();
            entity.Property(x => x.Reason).HasColumnName("reason").HasMaxLength(255);
            entity.Property(x => x.ApprovalStatus).HasColumnName("approval_status").HasMaxLength(20).IsRequired();
            entity.Property(x => x.ApprovedByUserId).HasColumnName("approved_by_user_id");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Ignore(x => x.UpdatedAt);
        });
    }
}
