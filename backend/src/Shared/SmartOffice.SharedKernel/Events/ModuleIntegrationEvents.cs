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
/// Sự kiện phát ra từ Module 2 (Attendance) khi tiến trình cuối ngày đánh dấu nhân viên vắng mặt không phép (ABSENT - FR-ATT-06).
/// Module Reporting lắng nghe để tăng AbsentCount trong bảng tổng hợp.
/// </summary>
public sealed record AttendanceAbsentMarkedIntegrationEvent(
    Guid EventId,
    DateTimeOffset OccurredOnUtc,
    Guid AttendanceLogId,
    Guid EmployeeId,
    string EmployeeCode,
    Guid DepartmentId,
    DateOnly WorkDate) : IIntegrationEvent;

/// <summary>
/// Sự kiện phát ra từ Module 3 (Occupancy) mỗi khi một vị trí bàn làm việc chuyển trạng thái FSM.
/// Dùng để đẩy cập nhật tức thời lên Live Seat Map qua SignalR Hub.
/// </summary>
public sealed record SeatStateChangedIntegrationEvent(
    Guid EventId,
    DateTimeOffset OccurredOnUtc,
    Guid SeatId,
    string SeatCode,
    Guid CameraId,
    Guid DepartmentId,
    Guid? AssignedEmployeeId,
    Guid? DetectedEmployeeId,
    string PreviousState,
    string NewState,
    int DurationSeconds,
    int ActiveSecondsToday) : IIntegrationEvent;

/// <summary>
/// Sự kiện phát ra từ Module 3 (Occupancy) khi phát hiện nhân viên rời bàn làm việc quá ngưỡng (15 phút).
/// Module Reporting và SignalR Hub lắng nghe để thống kê và gửi cảnh báo cho Trưởng bộ phận.
/// </summary>
public sealed record ProlongedAbsenceDetectedIntegrationEvent(
    Guid EventId,
    DateTimeOffset OccurredOnUtc,
    Guid SeatId,
    string SeatCode,
    Guid DepartmentId,
    Guid? AssignedEmployeeId,
    int AwayDurationSeconds) : IIntegrationEvent;

/// <summary>
/// Sự kiện phát ra từ Module 3 (Occupancy) khi phát hiện nhân viên ngồi sai vị trí bàn đã phân bổ (FR-OCC-05).
/// </summary>
public sealed record WrongSeatDetectedIntegrationEvent(
    Guid EventId,
    DateTimeOffset OccurredOnUtc,
    Guid SeatId,
    string SeatCode,
    Guid DepartmentId,
    Guid AssignedEmployeeId,
    Guid DetectedEmployeeId) : IIntegrationEvent;

/// <summary>
/// Sự kiện phát ra từ Module 4 (Security) khi phát hiện sự cố an ninh ngoài giờ hoặc giả mạo khuôn mặt (FR-SEC-02, US-SEC-02).
/// Module Reporting lắng nghe để tăng SecurityAlertsCount trong bảng tổng hợp.
/// </summary>
public sealed record SecurityIncidentDetectedIntegrationEvent(
    Guid EventId,
    DateTimeOffset OccurredOnUtc,
    Guid IncidentId,
    Guid CameraId,
    Guid? DepartmentId,
    Guid? DetectedEmployeeId,
    string AlertLevel,
    string SnapshotObjectKey) : IIntegrationEvent;
