namespace SmartOffice.Modules.Occupancy.Application.DTOs;

/// <summary>
/// Đỉnh đa giác chuẩn hóa trong miền giá trị [0.0, 1.0] độc lập với độ phân giải khung hình (FR-ADM-01, NFR-ACC-02).
/// </summary>
public sealed record PolygonPointDto(double X, double Y);

// =============================================================================
// 1. DTOs Quản lý Camera & Khung hình hiệu chuẩn (Calibration Frame)
// =============================================================================

public sealed record CreateCameraRequest(
    string CameraCode,
    string CameraName,
    string StreamSource,
    string CameraType = "DESK",
    Guid? DepartmentId = null,
    bool IsOnline = true);

public sealed record UpdateCameraRequest(
    string CameraName,
    string StreamSource,
    string CameraType = "DESK",
    Guid? DepartmentId = null,
    bool IsOnline = true);

public sealed record CameraResponse(
    Guid Id,
    string CameraCode,
    string CameraName,
    string CameraType,
    Guid? DepartmentId,
    string StreamSource,
    string? CalibrationFrameKey,
    string? CalibrationFramePresignedUrl,
    bool IsOnline,
    DateTimeOffset CreatedAt);

public sealed record CalibrationFrameUploadResponse(
    Guid CameraId,
    string CameraCode,
    string ObjectKey,
    string PresignedUrl,
    int ExpiryMinutes);

// =============================================================================
// 2. DTOs Quản lý Bàn làm việc & Vùng ảo (Virtual Zones)
// =============================================================================

public sealed record CreateSeatRequest(
    string SeatCode,
    string SeatName,
    Guid CameraId,
    Guid DepartmentId,
    Guid? AssignedEmployeeId,
    IReadOnlyList<PolygonPointDto> PolygonPoints,
    string ZoneType = "WORK_DESK");

public sealed record UpdateSeatPolygonRequest(
    IReadOnlyList<PolygonPointDto> PolygonPoints,
    Guid? AssignedEmployeeId = null,
    string? ZoneType = null);

public sealed record SeatResponse(
    Guid Id,
    string SeatCode,
    string SeatName,
    string ZoneType,
    Guid CameraId,
    Guid DepartmentId,
    Guid? AssignedEmployeeId,
    string? AssignedEmployeeCode,
    string? AssignedEmployeeName,
    IReadOnlyList<PolygonPointDto> PolygonPoints,
    string CurrentState,
    int ActiveSecondsToday,
    DateTimeOffset StateUpdatedAt);

public sealed record CameraZoneItemDto(
    Guid SeatId,
    string SeatCode,
    string SeatName,
    string ZoneType,
    Guid DepartmentId,
    Guid? AssignedEmployeeId,
    IReadOnlyList<PolygonPointDto> PolygonPoints);

public sealed record CameraZoneConfigResponse(
    Guid CameraId,
    string CameraCode,
    string CameraName,
    string StreamSource,
    bool IsOnline,
    IReadOnlyList<CameraZoneItemDto> Zones);

// =============================================================================
// 3. DTOs Đồng bộ Trạng thái từ AI Service (State-Sync & Logs)
// =============================================================================

public sealed record SeatObservationInput(
    string SeatCode,
    bool IsOccupied,
    int UnoccupiedContinuousFrames = 0,
    int UnoccupiedContinuousSeconds = 0,
    Guid? DetectedEmployeeId = null,
    float DetectionConfidence = 1.0f);

public sealed record OccupancyStateSyncRequest(
    string CameraCode,
    DateTimeOffset? CapturedAtUtc,
    long FrameSequence,
    IReadOnlyList<SeatObservationInput> Observations,
    int? ProlongedAbsenceThresholdSeconds = null);

public sealed record SeatStateTransitionResultDto(
    Guid SeatId,
    string SeatCode,
    string PreviousState,
    string NewState,
    bool StateChanged,
    int PreviousStateDurationSeconds,
    int ActiveSecondsToday,
    bool IsLunchMuted,
    bool ProlongedAbsenceAlertTriggered,
    bool WrongSeatAlertTriggered,
    string Message);

public sealed record OccupancyStateSyncResponse(
    string CameraCode,
    DateTimeOffset ProcessedAtUtc,
    int TotalProcessed,
    int TransitionsCount,
    IReadOnlyList<SeatStateTransitionResultDto> Results);

public sealed record SeatOccupancyLogResponse(
    Guid Id,
    Guid SeatId,
    string SeatCode,
    Guid? DetectedEmployeeId,
    string PreviousState,
    string NewState,
    int DurationSeconds,
    DateTimeOffset RecordedAt);

