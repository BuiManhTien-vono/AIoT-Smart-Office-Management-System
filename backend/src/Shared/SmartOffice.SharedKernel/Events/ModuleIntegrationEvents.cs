namespace SmartOffice.SharedKernel.Events;

/// <summary>
/// Sự kiện phát ra từ Module 1 (Biometrics) khi nhân viên mới được đăng ký thành công.
/// Các Module khác (Attendance, Reporting...) lắng nghe qua InMemoryEventBus để tự đồng bộ dữ liệu.
/// </summary>
public sealed record EmployeeRegisteredIntegrationEvent(
    Guid EventId,
    DateTimeOffset OccurredOnUtc,
    Guid EmployeeId,
    string EmployeeCode,
    string FullName,
    Guid DepartmentId,
    string DepartmentCode,
    Guid? DefaultShiftId) : IIntegrationEvent;

/// <summary>
/// Sự kiện phát ra từ Module 2 (Attendance) khi nhân viên chấm công vào/ra thành công.
/// Module Reporting lắng nghe sự kiện này để cập nhật bảng tổng hợp chuyên cần theo phòng ban.
/// </summary>
public sealed record AttendanceCheckedIntegrationEvent(
    Guid EventId,
    DateTimeOffset OccurredOnUtc,
    Guid AttendanceLogId,
    Guid EmployeeId,
    string EmployeeCode,
    Guid DepartmentId,
    DateOnly WorkDate,
    string Status,
    int LateMinutes,
    bool IsFirstCheckInOfDay) : IIntegrationEvent;

/// <summary>
/// Sự kiện phát ra từ Module 3 (Occupancy) khi phát hiện nhân viên rời bàn làm việc quá 15 phút.
/// </summary>
public sealed record ProlongedAbsenceDetectedIntegrationEvent(
    Guid EventId,
    DateTimeOffset OccurredOnUtc,
    Guid SeatId,
    string SeatCode,
    Guid DepartmentId,
    Guid? AssignedEmployeeId,
    int AwayDurationSeconds) : IIntegrationEvent;
