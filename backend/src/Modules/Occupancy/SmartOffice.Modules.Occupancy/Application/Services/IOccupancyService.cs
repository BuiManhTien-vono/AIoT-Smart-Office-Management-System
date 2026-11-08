using SmartOffice.Modules.Occupancy.Application.DTOs;
using SmartOffice.SharedKernel.Common;

namespace SmartOffice.Modules.Occupancy.Application.Services;

public interface IOccupancyService
{
    Task<Result<CameraResponse>> CreateCameraAsync(
        CreateCameraRequest request,
        CancellationToken ct = default);

    Task<Result<CameraResponse>> UpdateCameraAsync(
        Guid id,
        UpdateCameraRequest request,
        CancellationToken ct = default);

    Task<Result<bool>> DeleteCameraAsync(
        Guid id,
        CancellationToken ct = default);

    Task<IReadOnlyList<CameraResponse>> GetCamerasAsync(
        Guid? departmentId = null,
        CancellationToken ct = default);

    Task<Result<CalibrationFrameUploadResponse>> UploadCalibrationFrameAsync(
        Guid cameraId,
        Stream fileStream,
        string contentType,
        CancellationToken ct = default);

    Task<Result<SeatResponse>> CreateSeatAsync(
        CreateSeatRequest request,
        CancellationToken ct = default);

    Task<Result<bool>> DeleteSeatAsync(
        Guid seatId,
        CancellationToken ct = default);

    Task<Result<SeatResponse>> UpdateSeatPolygonAsync(
        Guid seatId,
        UpdateSeatPolygonRequest request,
        CancellationToken ct = default);

    Task<IReadOnlyList<SeatResponse>> GetSeatsAsync(
        Guid? departmentId = null,
        Guid? cameraId = null,
        CancellationToken ct = default);

    Task<Result<CameraZoneConfigResponse>> GetCameraZoneConfigAsync(
        string cameraCode,
        CancellationToken ct = default);

    Task<Result<OccupancyStateSyncResponse>> SyncOccupancyStateAsync(
        OccupancyStateSyncRequest request,
        CancellationToken ct = default);

    Task<IReadOnlyList<SeatOccupancyLogResponse>> GetOccupancyLogsAsync(
        Guid? seatId = null,
        int limit = 50,
        CancellationToken ct = default);
}

