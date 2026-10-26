namespace SmartOffice.SharedKernel.Events;

/// <summary>
/// Sự kiện phát ra từ Module Biometrics khi nhân viên mới được đăng ký thành công.
/// Các Module Attendance, Occupancy, Reporting có thể lắng nghe mà không phụ thuộc trực tiếp vào Biometrics.
/// </summary>
public sealed record EmployeeRegisteredIntegrationEvent(
    Guid EventId,
    DateTimeOffset OccurredOnUtc,
    Guid EmployeeId,
    string EmployeeCode,
    string FullName,
    Guid DepartmentId,
    Guid? DefaultShiftId) : IIntegrationEvent;

/// <summary>
/// Sự kiện phát ra từ Module Occupancy khi phát hiện nhân viên rời bàn làm việc quá 15 phút.
/// </summary>
public sealed record ProlongedAbsenceDetectedIntegrationEvent(
    Guid EventId,
    DateTimeOffset OccurredOnUtc,
    Guid SeatId,
    string SeatCode,
    Guid DepartmentId,
    Guid? AssignedEmployeeId,
    int AwayDurationSeconds) : IIntegrationEvent;
