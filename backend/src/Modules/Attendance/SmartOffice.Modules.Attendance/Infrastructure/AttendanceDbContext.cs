using Microsoft.EntityFrameworkCore;
using SmartOffice.Modules.Attendance.Domain;

namespace SmartOffice.Modules.Attendance.Infrastructure;

/// <summary>
/// DbContext độc lập của Module Attendance, cô lập hoàn toàn trong schema "attendance".
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
            entity.HasIndex(x => x.ShiftCode).IsUnique();
        });

        modelBuilder.Entity<AttendanceLog>(entity =>
        {
            entity.ToTable("attendance_logs");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.EmployeeId, x.WorkDate }).IsUnique();
        });

        modelBuilder.Entity<LeaveRequest>(entity =>
        {
            entity.ToTable("leave_requests");
            entity.HasKey(x => x.Id);
        });
    }
}
