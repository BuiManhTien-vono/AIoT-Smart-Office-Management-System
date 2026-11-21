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
    public DbSet<AttendanceAdjustmentAudit> AttendanceAdjustmentAudits => Set<AttendanceAdjustmentAudit>();
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
            entity.Property(x => x.IsManuallyAdjusted).HasColumnName("is_manually_adjusted");
            entity.Property(x => x.AdjustmentReason).HasColumnName("adjustment_reason").HasMaxLength(500);
            entity.Property(x => x.AdjustedByUserId).HasColumnName("adjusted_by_user_id");
            entity.Property(x => x.AdjustedByName).HasColumnName("adjusted_by_name").HasMaxLength(100);
            entity.Property(x => x.AdjustedAt).HasColumnName("adjusted_at");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            entity.HasIndex(x => new { x.EmployeeId, x.WorkDate }).IsUnique();
        });

        modelBuilder.Entity<AttendanceAdjustmentAudit>(entity =>
        {
            entity.ToTable("attendance_adjustment_audits");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.AttendanceLogId).HasColumnName("attendance_log_id");
            entity.Property(x => x.EmployeeId).HasColumnName("employee_id");
            entity.Property(x => x.EmployeeCode).HasColumnName("employee_code").HasMaxLength(20).IsRequired();
            entity.Property(x => x.EmployeeFullName).HasColumnName("employee_full_name").HasMaxLength(100).IsRequired();
            entity.Property(x => x.DepartmentId).HasColumnName("department_id");
            entity.Property(x => x.WorkDate).HasColumnName("work_date");
            entity.Property(x => x.ActionType).HasColumnName("action_type").HasMaxLength(30).IsRequired();
            entity.Property(x => x.PreviousStatus).HasColumnName("previous_status").HasMaxLength(20);
            entity.Property(x => x.NewStatus).HasColumnName("new_status").HasMaxLength(20);
            entity.Property(x => x.PreviousCheckInTime).HasColumnName("previous_check_in_time");
            entity.Property(x => x.NewCheckInTime).HasColumnName("new_check_in_time");
            entity.Property(x => x.PreviousCheckOutTime).HasColumnName("previous_check_out_time");
            entity.Property(x => x.NewCheckOutTime).HasColumnName("new_check_out_time");
            entity.Property(x => x.PreviousLateMinutes).HasColumnName("previous_late_minutes");
            entity.Property(x => x.NewLateMinutes).HasColumnName("new_late_minutes");
            entity.Property(x => x.PreviousEarlyLeaveMinutes).HasColumnName("previous_early_leave_minutes");
            entity.Property(x => x.NewEarlyLeaveMinutes).HasColumnName("new_early_leave_minutes");
            entity.Property(x => x.PreviousSnapshotKey).HasColumnName("previous_snapshot_key").HasMaxLength(255);
            entity.Property(x => x.IsStatusOverridden).HasColumnName("is_status_overridden");
            entity.Property(x => x.Reason).HasColumnName("reason").HasMaxLength(500).IsRequired();
            entity.Property(x => x.SourceScreen).HasColumnName("source_screen").HasMaxLength(50);
            entity.Property(x => x.AdjustedByUserId).HasColumnName("adjusted_by_user_id");
            entity.Property(x => x.AdjustedByUsername).HasColumnName("adjusted_by_username").HasMaxLength(50).IsRequired();
            entity.Property(x => x.AdjustedByName).HasColumnName("adjusted_by_name").HasMaxLength(100).IsRequired();
            entity.Property(x => x.AdjustedByRole).HasColumnName("adjusted_by_role").HasMaxLength(20).IsRequired();
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Ignore(x => x.UpdatedAt);
            entity.HasIndex(x => new { x.WorkDate, x.CreatedAt });
            entity.HasIndex(x => new { x.EmployeeId, x.WorkDate });
        });

        modelBuilder.Entity<LeaveRequest>(entity =>
        {
            entity.ToTable("leave_requests");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.EmployeeId).HasColumnName("employee_id");
            entity.Property(x => x.StartDate).HasColumnName("start_date");
            entity.Property(x => x.EndDate).HasColumnName("end_date");
            entity.Property(x => x.StartTime).HasColumnName("start_time");
            entity.Property(x => x.EndTime).HasColumnName("end_time");
            entity.Property(x => x.LeaveType).HasColumnName("leave_type").HasMaxLength(30).IsRequired();
            entity.Property(x => x.IsPaid).HasColumnName("is_paid");
            entity.Property(x => x.Reason).HasColumnName("reason").HasMaxLength(255);
            entity.Property(x => x.ApprovalStatus).HasColumnName("approval_status").HasMaxLength(20).IsRequired();
            entity.Property(x => x.ApprovedByUserId).HasColumnName("approved_by_user_id");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Ignore(x => x.UpdatedAt);
        });
    }
}
