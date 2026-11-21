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
/// Sự kiện phát ra từ Module 2 (Attendance) khi một bản ghi chấm công bị gỡ bỏ
/// (lỡ tạo trong thời gian nghỉ phép hoặc bị hủy công do lỗi hệ thống / ghi nhầm - VOID_ERRONEOUS).
/// Module Reporting lắng nghe để trừ lại số liệu tương ứng trong bảng tổng hợp.
/// </summary>
public sealed record AttendanceLogRemovedIntegrationEvent(
    Guid EventId,
    DateTimeOffset OccurredOnUtc,
    Guid AttendanceLogId,
    Guid EmployeeId,
    string EmployeeCode,
    Guid DepartmentId,
    DateOnly WorkDate,
    string PreviousStatus,
    int PreviousLateMinutes = 0,
    string DepartmentCode = "DEPT",
    string? Reason = null) : IIntegrationEvent;

/// <summary>
/// Sự kiện phát ra từ Module 2 (Attendance) khi quản trị viên / HR / Trưởng phòng
/// điều chỉnh giờ công, bổ sung công thủ công hoặc phạt hủy công trừ lương (REVOKE_PENALTY).
/// Module Reporting lắng nghe để cập nhật chính xác delta trên bảng tổng hợp phòng ban.
/// </summary>
public sealed record AttendanceLogAdjustedIntegrationEvent(
    Guid EventId,
    DateTimeOffset OccurredOnUtc,
    Guid AttendanceLogId,
    Guid EmployeeId,
    string EmployeeCode,
    Guid DepartmentId,
    string DepartmentCode,
    DateOnly WorkDate,
    string? PreviousStatus,
    int PreviousLateMinutes,
    string NewStatus,
    int NewLateMinutes,
    string ActionType,
    string? Reason = null) : IIntegrationEvent;

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
/// Sự kiện phát ra từ Module 2 (Attendance) khi tạo đơn nghỉ phép / công vụ hoặc nghỉ đột xuất trong ngày.
/// Module Occupancy lắng nghe để đẩy cập nhật thời gian thực lên giao diện theo dõi.
/// </summary>
public sealed record LeaveRequestCreatedIntegrationEvent(
    Guid EventId,
    DateTimeOffset OccurredOnUtc,
    Guid LeaveRequestId,
    Guid EmployeeId,
    string EmployeeCode,
    Guid DepartmentId,
    DateOnly StartDate,
    DateOnly EndDate,
    TimeOnly StartTime,
    TimeOnly EndTime,
    string LeaveType,
    bool IsPaid,
    string ApprovalStatus) : IIntegrationEvent;

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
/// Sự kiện phát ra từ Module 3 (Occupancy) khi phát hiện người lạ hoặc người khác ngồi vào vị trí bàn
/// của nhân viên đang trong khung giờ nghỉ phép đã duyệt. Module Security lắng nghe để kiểm tra và lập sự cố an ninh.
/// </summary>
public sealed record UnauthorizedSeatAccessDetectedIntegrationEvent(
    Guid EventId,
    DateTimeOffset OccurredOnUtc,
    Guid SeatId,
    string SeatCode,
    Guid CameraId,
    Guid DepartmentId,
    Guid AssignedEmployeeId,
    Guid? DetectedEmployeeId,
    string? LeaveType) : IIntegrationEvent;

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
    string SnapshotObjectKey,
    string IncidentType = "SECURITY_BREACH",
    string? SeatCode = null,
    string? ActionSummary = null) : IIntegrationEvent;
