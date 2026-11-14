using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SmartOffice.Modules.Occupancy.Application.DTOs;
using SmartOffice.Modules.Occupancy.Domain;
using SmartOffice.Modules.Occupancy.Infrastructure;
using SmartOffice.SharedKernel.Common;
using SmartOffice.SharedKernel.Contracts;
using SmartOffice.SharedKernel.Events;
using SmartOffice.SharedKernel.Storage;

namespace SmartOffice.Modules.Occupancy.Application.Services;

/// <summary>
/// Dịch vụ xử lý nghiệp vụ của Module 3 (Occupancy):
/// - Quản lý Camera, khung hình hiệu chuẩn (Calibration Frame trên S3/R2) và Đa giác vùng ảo (Virtual Zones).
/// - Cung cấp cấu hình đa giác chuẩn hóa [0.0, 1.0] cho AI Service.
/// - Vận hành Máy trạng thái hữu hạn chỗ ngồi (4-State FSM + WRONG_SEAT), Anti-Flicker 3s/15 frames, Lunchtime Mute (12:00-13:30).
/// - Lưu nhật ký chuyển trạng thái và phát Integration Events sau khi commit DB.
/// </summary>
public sealed class OccupancyService(
    OccupancyDbContext dbContext,
    IEmployeeLookupContract employeeLookup,
    IObjectStorageService objectStorage,
    IInMemoryEventBus eventBus) : IOccupancyService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    public static readonly HashSet<string> AllowedCameraTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "DESK",
        "GATE",
        "DESK_AREA",
        "GATE_FACE"
    };

    public async Task<Result<CameraResponse>> CreateCameraAsync(
        CreateCameraRequest request,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.CameraCode))
        {
            return Result.Failure<CameraResponse>(
                new Error("INVALID_CAMERA_CODE", "Mã định danh camera không được để trống."));
        }

        if (string.IsNullOrWhiteSpace(request.StreamSource))
        {
            return Result.Failure<CameraResponse>(
                new Error("INVALID_STREAM_SOURCE", "Nguồn phát video (streamSource) không được để trống."));
        }

        var cameraType = string.IsNullOrWhiteSpace(request.CameraType)
            ? "DESK"
            : request.CameraType.Trim().ToUpperInvariant();

        if (!AllowedCameraTypes.Contains(cameraType))
        {
            return Result.Failure<CameraResponse>(
                new Error("INVALID_CAMERA_TYPE", $"Loại camera '{cameraType}' không hợp lệ (chấp nhận DESK hoặc GATE)."));
        }

        var code = request.CameraCode.Trim().ToUpperInvariant();
        if (await dbContext.Cameras.AnyAsync(c => c.CameraCode == code, ct))
        {
            return Result.Failure<CameraResponse>(
                new Error("CAMERA_CODE_EXISTS", $"Mã camera '{code}' đã tồn tại trong hệ thống."));
        }

        var camera = new Camera
        {
            CameraCode = code,
            CameraName = request.CameraName.Trim(),
            CameraType = cameraType,
            DepartmentId = request.DepartmentId,
            StreamSource = request.StreamSource.Trim(),
            IsOnline = request.IsOnline
        };

        dbContext.Cameras.Add(camera);
        await dbContext.SaveChangesAsync(ct);

        return Result.Success(await MapCameraResponseAsync(camera, ct));
    }

    public async Task<Result<CameraResponse>> UpdateCameraAsync(
        Guid id,
        UpdateCameraRequest request,
        CancellationToken ct = default)
    {
        var camera = await dbContext.Cameras.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (camera is null)
        {
            return Result.Failure<CameraResponse>(
                new Error("CAMERA_NOT_FOUND", $"Không tìm thấy camera với ID '{id}'."));
        }

        if (string.IsNullOrWhiteSpace(request.CameraName))
        {
            return Result.Failure<CameraResponse>(
                new Error("INVALID_CAMERA_NAME", "Tên camera không được để trống."));
        }

        if (string.IsNullOrWhiteSpace(request.StreamSource))
        {
            return Result.Failure<CameraResponse>(
                new Error("INVALID_STREAM_SOURCE", "Nguồn phát video (streamSource) không được để trống."));
        }

        var cameraType = string.IsNullOrWhiteSpace(request.CameraType)
            ? "DESK"
            : request.CameraType.Trim().ToUpperInvariant();

        if (!AllowedCameraTypes.Contains(cameraType))
        {
            return Result.Failure<CameraResponse>(
                new Error("INVALID_CAMERA_TYPE", $"Loại camera '{cameraType}' không hợp lệ (chấp nhận DESK hoặc GATE)."));
        }

        camera.CameraName = request.CameraName.Trim();
        camera.StreamSource = request.StreamSource.Trim();
        camera.CameraType = cameraType;
        camera.DepartmentId = request.DepartmentId;
        camera.IsOnline = request.IsOnline;

        await dbContext.SaveChangesAsync(ct);
        return Result.Success(await MapCameraResponseAsync(camera, ct));
    }

    public async Task<Result<bool>> DeleteCameraAsync(
        Guid id,
        CancellationToken ct = default)
    {
        var camera = await dbContext.Cameras.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (camera is null)
        {
            return Result.Failure<bool>(
                new Error("CAMERA_NOT_FOUND", $"Không tìm thấy camera với ID '{id}'."));
        }

        var seats = await dbContext.Seats.Where(s => s.CameraId == id).ToListAsync(ct);
        var seatIds = seats.Select(s => s.Id).ToList();
        var logs = await dbContext.SeatOccupancyLogs.Where(l => seatIds.Contains(l.SeatId)).ToListAsync(ct);

        if (logs.Count > 0)
        {
            dbContext.SeatOccupancyLogs.RemoveRange(logs);
            await dbContext.SaveChangesAsync(ct);
        }

        if (seats.Count > 0)
        {
            dbContext.Seats.RemoveRange(seats);
            await dbContext.SaveChangesAsync(ct);
        }

        dbContext.Cameras.Remove(camera);
        await dbContext.SaveChangesAsync(ct);
        return Result.Success(true);
    }

    public async Task<IReadOnlyList<CameraResponse>> GetCamerasAsync(
        Guid? departmentId = null,
        CancellationToken ct = default)
    {
        var query = dbContext.Cameras.AsQueryable();
        if (departmentId.HasValue)
        {
            query = query.Where(c => c.DepartmentId == departmentId.Value);
        }

        var cameras = await query.OrderBy(c => c.CameraCode).ToListAsync(ct);
        var results = new List<CameraResponse>(cameras.Count);
        foreach (var cam in cameras)
        {
            results.Add(await MapCameraResponseAsync(cam, ct));
        }

        return results;
    }

    public async Task<Result<CalibrationFrameUploadResponse>> UploadCalibrationFrameAsync(
        Guid cameraId,
        Stream fileStream,
        string contentType,
        CancellationToken ct = default)
    {
        var camera = await dbContext.Cameras.FirstOrDefaultAsync(c => c.Id == cameraId, ct);
        if (camera is null)
        {
            return Result.Failure<CalibrationFrameUploadResponse>(
                new Error("CAMERA_NOT_FOUND", "Không tìm thấy camera để cập nhật khung hình hiệu chuẩn."));
        }

        var objectKey = $"calibration/{camera.CameraCode.ToLowerInvariant()}_frame.jpg";
        var savedKey = await objectStorage.UploadFileAsync(objectKey, fileStream, contentType, ct);

        camera.CalibrationFrameKey = savedKey;
        await dbContext.SaveChangesAsync(ct);

        const int expiryMinutes = 15;
        var presignedUrl = await objectStorage.GetPresignedUrlAsync(savedKey, expiryMinutes, ct);

        return Result.Success(new CalibrationFrameUploadResponse(
            camera.Id,
            camera.CameraCode,
            savedKey,
            presignedUrl,
            expiryMinutes));
    }

    public async Task<Result<SeatResponse>> CreateSeatAsync(
        CreateSeatRequest request,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.SeatCode))
        {
            return Result.Failure<SeatResponse>(
                new Error("INVALID_SEAT_CODE", "Mã vị trí chỗ ngồi / vùng ảo không được để trống."));
        }

        var zoneType = string.IsNullOrWhiteSpace(request.ZoneType)
            ? "WORK_DESK"
            : request.ZoneType.Trim().ToUpperInvariant();

        var validation = PolygonValidator.Validate(request.PolygonPoints, zoneType);
        if (validation.IsFailure)
        {
            return Result.Failure<SeatResponse>(validation.Error);
        }

        var cameraExists = await dbContext.Cameras.AnyAsync(c => c.Id == request.CameraId, ct);
        if (!cameraExists)
        {
            return Result.Failure<SeatResponse>(
                new Error("CAMERA_NOT_FOUND", "Camera giám sát được chọn không tồn tại."));
        }

        var code = request.SeatCode.Trim().ToUpperInvariant();
        if (await dbContext.Seats.AnyAsync(s => s.SeatCode == code, ct))
        {
            return Result.Failure<SeatResponse>(
                new Error("SEAT_CODE_EXISTS", $"Mã chỗ ngồi / vùng ảo '{code}' đã tồn tại."));
        }

        EmployeeContractDto? assignedEmployee = null;
        if (request.AssignedEmployeeId.HasValue)
        {
            assignedEmployee = await employeeLookup.GetByIdAsync(request.AssignedEmployeeId.Value, ct);
            if (assignedEmployee is null || !assignedEmployee.IsActive)
            {
                return Result.Failure<SeatResponse>(
                    new Error("EMPLOYEE_NOT_FOUND", "Nhân viên được phân bổ vào bàn không tồn tại hoặc đã nghỉ việc."));
            }
        }

        var seat = new Seat
        {
            SeatCode = code,
            SeatName = string.IsNullOrWhiteSpace(request.SeatName) ? code : request.SeatName.Trim(),
            ZoneType = zoneType,
            CameraId = request.CameraId,
            DepartmentId = request.DepartmentId,
            AssignedEmployeeId = request.AssignedEmployeeId,
            PolygonPointsJson = JsonSerializer.Serialize(request.PolygonPoints, JsonOptions),
            CurrentState = SeatStateMachine.StateEmpty,
            ActiveSecondsToday = 0,
            StateUpdatedAt = DateTimeOffset.UtcNow
        };

        dbContext.Seats.Add(seat);
        await dbContext.SaveChangesAsync(ct);

        return Result.Success(MapSeatResponse(seat, request.PolygonPoints, assignedEmployee));
    }

    public async Task<Result<bool>> DeleteSeatAsync(
        Guid seatId,
        CancellationToken ct = default)
    {
        var seat = await dbContext.Seats.FirstOrDefaultAsync(s => s.Id == seatId, ct);
        if (seat is null)
        {
            return Result.Failure<bool>(
                new Error("SEAT_NOT_FOUND", "Không tìm thấy vị trí bàn làm việc cần xóa."));
        }

        var logs = await dbContext.SeatOccupancyLogs.Where(l => l.SeatId == seatId).ToListAsync(ct);
        if (logs.Count > 0)
        {
            dbContext.SeatOccupancyLogs.RemoveRange(logs);
            await dbContext.SaveChangesAsync(ct);
        }

        dbContext.Seats.Remove(seat);
        await dbContext.SaveChangesAsync(ct);
        return Result.Success(true);
    }

    public async Task<Result<SeatResponse>> UpdateSeatPolygonAsync(
        Guid seatId,
        UpdateSeatPolygonRequest request,
        CancellationToken ct = default)
    {
        var seat = await dbContext.Seats.FirstOrDefaultAsync(s => s.Id == seatId, ct);
        if (seat is null)
        {
            return Result.Failure<SeatResponse>(
                new Error("SEAT_NOT_FOUND", "Không tìm thấy vị trí bàn làm việc / vùng ảo."));
        }

        var targetZoneType = string.IsNullOrWhiteSpace(request.ZoneType)
            ? seat.ZoneType
            : request.ZoneType.Trim().ToUpperInvariant();

        var validation = PolygonValidator.Validate(request.PolygonPoints, targetZoneType);
        if (validation.IsFailure)
        {
            return Result.Failure<SeatResponse>(validation.Error);
        }

        EmployeeContractDto? assignedEmployee = null;
        var targetEmployeeId = request.AssignedEmployeeId ?? seat.AssignedEmployeeId;
        if (request.AssignedEmployeeId.HasValue)
        {
            assignedEmployee = await employeeLookup.GetByIdAsync(request.AssignedEmployeeId.Value, ct);
            if (assignedEmployee is null || !assignedEmployee.IsActive)
            {
                return Result.Failure<SeatResponse>(
                    new Error("EMPLOYEE_NOT_FOUND", "Nhân viên được phân bổ vào bàn không tồn tại hoặc đã nghỉ việc."));
            }
            seat.AssignedEmployeeId = request.AssignedEmployeeId;
        }
        else if (targetEmployeeId.HasValue)
        {
            assignedEmployee = await employeeLookup.GetByIdAsync(targetEmployeeId.Value, ct);
        }

        seat.ZoneType = targetZoneType;
        seat.PolygonPointsJson = JsonSerializer.Serialize(request.PolygonPoints, JsonOptions);

        await dbContext.SaveChangesAsync(ct);

        return Result.Success(MapSeatResponse(seat, request.PolygonPoints, assignedEmployee));
    }

    public async Task<IReadOnlyList<SeatResponse>> GetSeatsAsync(
        Guid? departmentId = null,
        Guid? cameraId = null,
        CancellationToken ct = default)
    {
        var query = dbContext.Seats.AsQueryable();
        if (departmentId.HasValue)
        {
            query = query.Where(s => s.DepartmentId == departmentId.Value);
        }

        if (cameraId.HasValue)
        {
            query = query.Where(s => s.CameraId == cameraId.Value);
        }

        var seats = await query.OrderBy(s => s.SeatCode).ToListAsync(ct);
        var results = new List<SeatResponse>(seats.Count);

        foreach (var seat in seats)
        {
            EmployeeContractDto? emp = null;
            if (seat.AssignedEmployeeId.HasValue)
            {
                emp = await employeeLookup.GetByIdAsync(seat.AssignedEmployeeId.Value, ct);
            }

            var points = DeserializePolygon(seat.PolygonPointsJson);
            results.Add(MapSeatResponse(seat, points, emp));
        }

        return results;
    }

    public async Task<Result<CameraZoneConfigResponse>> GetCameraZoneConfigAsync(
        string cameraCode,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(cameraCode))
        {
            return Result.Failure<CameraZoneConfigResponse>(
                new Error("INVALID_CAMERA_CODE", "Mã camera không được để trống."));
        }

        var normalizedCode = cameraCode.Trim().ToUpperInvariant();
        var camera = await dbContext.Cameras
            .FirstOrDefaultAsync(c => c.CameraCode == normalizedCode, ct);

        if (camera is null)
        {
            return Result.Failure<CameraZoneConfigResponse>(
                new Error("CAMERA_NOT_FOUND", $"Không tìm thấy cấu hình cho camera '{normalizedCode}'."));
        }

        var seats = await dbContext.Seats
            .Where(s => s.CameraId == camera.Id)
            .OrderBy(s => s.SeatCode)
            .ToListAsync(ct);

        var zones = seats.Select(s => new CameraZoneItemDto(
            s.Id,
            s.SeatCode,
            s.SeatName,
            s.ZoneType,
            s.DepartmentId,
            s.AssignedEmployeeId,
            DeserializePolygon(s.PolygonPointsJson))).ToList();

        return Result.Success(new CameraZoneConfigResponse(
            camera.Id,
            camera.CameraCode,
            camera.CameraName,
            camera.StreamSource,
            camera.IsOnline,
            zones));
    }

    public async Task<Result<OccupancyStateSyncResponse>> SyncOccupancyStateAsync(
        OccupancyStateSyncRequest request,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.CameraCode))
        {
            return Result.Failure<OccupancyStateSyncResponse>(
                new Error("INVALID_CAMERA_CODE", "Payload đồng bộ thiếu mã camera (cameraCode)."));
        }

        if (request.Observations is null || request.Observations.Count == 0)
        {
            return Result.Failure<OccupancyStateSyncResponse>(
                new Error("EMPTY_OBSERVATIONS", "Danh sách trạng thái quan sát (observations) không được để trống."));
        }

        var normalizedCamCode = request.CameraCode.Trim().ToUpperInvariant();
        var camera = await dbContext.Cameras
            .FirstOrDefaultAsync(c => c.CameraCode == normalizedCamCode, ct);

        if (camera is null)
        {
            return Result.Failure<OccupancyStateSyncResponse>(
                new Error("CAMERA_NOT_FOUND", $"Camera '{normalizedCamCode}' chưa được đăng ký trong hệ thống."));
        }

        var capturedAtUtc = request.CapturedAtUtc ?? DateTimeOffset.UtcNow;
        var seatsOnCamera = await dbContext.Seats
            .Where(s => s.CameraId == camera.Id)
            .ToDictionaryAsync(s => s.SeatCode, StringComparer.OrdinalIgnoreCase, ct);

        var transitionResults = new List<SeatStateTransitionResultDto>(request.Observations.Count);
        var pendingStateEvents = new List<SeatStateChangedIntegrationEvent>();
        var pendingProlongedEvents = new List<ProlongedAbsenceDetectedIntegrationEvent>();
        var pendingWrongSeatEvents = new List<WrongSeatDetectedIntegrationEvent>();
        int transitionsCount = 0;

        foreach (var obs in request.Observations)
        {
            if (string.IsNullOrWhiteSpace(obs.SeatCode) ||
                !seatsOnCamera.TryGetValue(obs.SeatCode.Trim(), out var seat))
            {
                return Result.Failure<OccupancyStateSyncResponse>(
                    new Error("SEAT_NOT_FOUND", $"Không tìm thấy vị trí bàn '{obs.SeatCode}' thuộc camera '{normalizedCamCode}'."));
            }

            var evalContext = new SeatStateMachine.StateEvaluationContext(
                CurrentState: seat.CurrentState,
                StateUpdatedAtUtc: seat.StateUpdatedAt,
                CurrentActiveSecondsToday: seat.ActiveSecondsToday,
                AssignedEmployeeId: seat.AssignedEmployeeId,
                IsOccupied: obs.IsOccupied,
                UnoccupiedContinuousFrames: obs.UnoccupiedContinuousFrames,
                UnoccupiedContinuousSeconds: obs.UnoccupiedContinuousSeconds,
                DetectedEmployeeId: obs.DetectedEmployeeId,
                CapturedAtUtc: capturedAtUtc,
                ProlongedAbsenceThresholdSeconds: request.ProlongedAbsenceThresholdSeconds ?? SeatStateMachine.DefaultProlongedAbsenceSeconds);

            var outcome = SeatStateMachine.Evaluate(evalContext);

            if (!outcome.IsIgnoredOutOfOrder)
            {
                seat.ActiveSecondsToday = outcome.UpdatedActiveSecondsToday;
                seat.StateUpdatedAt = outcome.UpdatedStateTimestampUtc;
            }

            if (outcome.StateChanged)
            {
                transitionsCount++;
                seat.CurrentState = outcome.NewState;

                var logEntry = new SeatOccupancyLog
                {
                    SeatId = seat.Id,
                    DetectedEmployeeId = obs.DetectedEmployeeId ?? seat.AssignedEmployeeId,
                    PreviousState = outcome.PreviousState,
                    NewState = outcome.NewState,
                    DurationSeconds = outcome.PreviousStateDurationSeconds,
                    RecordedAt = capturedAtUtc
                };
                dbContext.SeatOccupancyLogs.Add(logEntry);

                pendingStateEvents.Add(new SeatStateChangedIntegrationEvent(
                    Guid.NewGuid(),
                    capturedAtUtc,
                    seat.Id,
                    seat.SeatCode,
                    seat.CameraId,
                    seat.DepartmentId,
                    seat.AssignedEmployeeId,
                    obs.DetectedEmployeeId,
                    outcome.PreviousState,
                    outcome.NewState,
                    outcome.PreviousStateDurationSeconds,
                    seat.ActiveSecondsToday));

                if (outcome.ProlongedAbsenceAlertTriggered)
                {
                    pendingProlongedEvents.Add(new ProlongedAbsenceDetectedIntegrationEvent(
                        Guid.NewGuid(),
                        capturedAtUtc,
                        seat.Id,
                        seat.SeatCode,
                        seat.DepartmentId,
                        seat.AssignedEmployeeId,
                        outcome.PreviousStateDurationSeconds));
                }

                if (outcome.WrongSeatAlertTriggered &&
                    seat.AssignedEmployeeId.HasValue &&
                    obs.DetectedEmployeeId.HasValue)
                {
                    pendingWrongSeatEvents.Add(new WrongSeatDetectedIntegrationEvent(
                        Guid.NewGuid(),
                        capturedAtUtc,
                        seat.Id,
                        seat.SeatCode,
                        seat.DepartmentId,
                        seat.AssignedEmployeeId.Value,
                        obs.DetectedEmployeeId.Value));
                }
            }

            transitionResults.Add(new SeatStateTransitionResultDto(
                seat.Id,
                seat.SeatCode,
                outcome.PreviousState,
                outcome.NewState,
                outcome.StateChanged,
                outcome.PreviousStateDurationSeconds,
                seat.ActiveSecondsToday,
                outcome.IsLunchMuted,
                outcome.ProlongedAbsenceAlertTriggered,
                outcome.WrongSeatAlertTriggered,
                outcome.Message));
        }

        await dbContext.SaveChangesAsync(ct);

        // Phát toàn bộ Integration Events sau khi dữ liệu đã commit thành công xuống DB
        foreach (var stateEvt in pendingStateEvents)
        {
            await eventBus.PublishAsync(stateEvt, ct);
        }

        foreach (var prolongedEvt in pendingProlongedEvents)
        {
            await eventBus.PublishAsync(prolongedEvt, ct);
        }

        foreach (var wrongSeatEvt in pendingWrongSeatEvents)
        {
            await eventBus.PublishAsync(wrongSeatEvt, ct);
        }

        return Result.Success(new OccupancyStateSyncResponse(
            normalizedCamCode,
            capturedAtUtc,
            transitionResults.Count,
            transitionsCount,
            transitionResults));
    }

    public async Task<IReadOnlyList<SeatOccupancyLogResponse>> GetOccupancyLogsAsync(
        Guid? seatId = null,
        int limit = 50,
        CancellationToken ct = default)
    {
        var clampedLimit = Math.Clamp(limit, 1, 500);
        var query = from log in dbContext.SeatOccupancyLogs
                    join seat in dbContext.Seats on log.SeatId equals seat.Id
                    select new { Log = log, seat.SeatCode };

        if (seatId.HasValue)
        {
            query = query.Where(x => x.Log.SeatId == seatId.Value);
        }

        var items = await query
            .OrderByDescending(x => x.Log.RecordedAt)
            .Take(clampedLimit)
            .ToListAsync(ct);

        return items.Select(x => new SeatOccupancyLogResponse(
            x.Log.Id,
            x.Log.SeatId,
            x.SeatCode,
            x.Log.DetectedEmployeeId,
            x.Log.PreviousState,
            x.Log.NewState,
            x.Log.DurationSeconds,
            x.Log.RecordedAt)).ToList();
    }

    private async Task<CameraResponse> MapCameraResponseAsync(Camera camera, CancellationToken ct)
    {
        string? presignedUrl = null;
        if (!string.IsNullOrWhiteSpace(camera.CalibrationFrameKey))
        {
            presignedUrl = await objectStorage.GetPresignedUrlAsync(camera.CalibrationFrameKey, 15, ct);
        }

        return new CameraResponse(
            camera.Id,
            camera.CameraCode,
            camera.CameraName,
            camera.CameraType,
            camera.DepartmentId,
            camera.StreamSource,
            camera.CalibrationFrameKey,
            presignedUrl,
            camera.IsOnline,
            camera.CreatedAt);
    }

    private static SeatResponse MapSeatResponse(
        Seat seat,
        IReadOnlyList<PolygonPointDto> points,
        EmployeeContractDto? assignedEmployee)
    {
        return new SeatResponse(
            seat.Id,
            seat.SeatCode,
            seat.SeatName,
            seat.ZoneType,
            seat.CameraId,
            seat.DepartmentId,
            seat.AssignedEmployeeId,
            assignedEmployee?.EmployeeCode,
            assignedEmployee?.FullName,
            points,
            seat.CurrentState,
            seat.ActiveSecondsToday,
            seat.StateUpdatedAt);
    }

    public async Task<Result<int>> ResetCameraSeatsAsync(string cameraCode, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(cameraCode))
        {
            return Result.Failure<int>(new Error("INVALID_CAMERA_CODE", "Mã camera không được để trống."));
        }

        var normalizedCamCode = cameraCode.Trim().ToUpperInvariant();
        var camera = await dbContext.Cameras
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.CameraCode == normalizedCamCode, ct);

        if (camera is null)
        {
            return Result.Failure<int>(new Error("CAMERA_NOT_FOUND", $"Không tìm thấy camera '{normalizedCamCode}'."));
        }

        var seats = await dbContext.Seats
            .Where(s => s.CameraId == camera.Id)
            .ToListAsync(ct);

        if (seats.Count == 0)
        {
            return Result.Success(0);
        }

        var now = DateTimeOffset.UtcNow;
        int resetCount = 0;
        var pendingEvents = new List<SeatStateChangedIntegrationEvent>();

        foreach (var seat in seats)
        {
            var prevState = seat.CurrentState;
            if (prevState != SeatStateMachine.StateEmpty)
            {
                seat.CurrentState = SeatStateMachine.StateEmpty;
                seat.StateUpdatedAt = now;
                resetCount++;

                var logEntry = new SeatOccupancyLog
                {
                    SeatId = seat.Id,
                    DetectedEmployeeId = seat.AssignedEmployeeId,
                    PreviousState = prevState,
                    NewState = SeatStateMachine.StateEmpty,
                    DurationSeconds = 0,
                    RecordedAt = now
                };
                dbContext.SeatOccupancyLogs.Add(logEntry);

                pendingEvents.Add(new SeatStateChangedIntegrationEvent(
                    Guid.NewGuid(),
                    now,
                    seat.Id,
                    seat.SeatCode,
                    seat.CameraId,
                    seat.DepartmentId,
                    seat.AssignedEmployeeId,
                    null,
                    prevState,
                    SeatStateMachine.StateEmpty,
                    0,
                    seat.ActiveSecondsToday));
            }
        }

        if (resetCount > 0)
        {
            await dbContext.SaveChangesAsync(ct);
            foreach (var evt in pendingEvents)
            {
                await eventBus.PublishAsync(evt, ct);
            }
        }

        return Result.Success(resetCount);
    }

    public async Task<Result<BatchSeatActionResult>> BatchUpdateSeatsAsync(
        BatchSeatActionRequest request,
        CancellationToken ct = default)
    {
        if (request.SeatIds is null || request.SeatIds.Count == 0)
        {
            return Result.Failure<BatchSeatActionResult>(
                new Error("EMPTY_SEAT_IDS", "Danh sách bàn cần thao tác không được để trống."));
        }

        var seats = await dbContext.Seats
            .Where(s => request.SeatIds.Contains(s.Id))
            .ToListAsync(ct);

        if (seats.Count == 0)
        {
            return Result.Failure<BatchSeatActionResult>(
                new Error("SEATS_NOT_FOUND", "Không tìm thấy bàn làm việc nào tương ứng."));
        }

        var now = DateTimeOffset.UtcNow;
        var pendingEvents = new List<SeatStateChangedIntegrationEvent>();
        var action = request.Action?.Trim().ToUpperInvariant() ?? "SET_STATE";
        int processedCount = 0;

        switch (action)
        {
            case "SET_STATE":
                var targetState = request.NewState?.Trim().ToUpperInvariant() ?? SeatStateMachine.StateEmpty;
                foreach (var seat in seats)
                {
                    if (seat.CurrentState != targetState)
                    {
                        var prevState = seat.CurrentState;
                        seat.CurrentState = targetState;
                        seat.StateUpdatedAt = now;
                        processedCount++;

                        dbContext.SeatOccupancyLogs.Add(new SeatOccupancyLog
                        {
                            SeatId = seat.Id,
                            DetectedEmployeeId = seat.AssignedEmployeeId,
                            PreviousState = prevState,
                            NewState = targetState,
                            DurationSeconds = 0,
                            RecordedAt = now
                        });

                        pendingEvents.Add(new SeatStateChangedIntegrationEvent(
                            Guid.NewGuid(),
                            now,
                            seat.Id,
                            seat.SeatCode,
                            seat.CameraId,
                            seat.DepartmentId,
                            seat.AssignedEmployeeId,
                            null,
                            prevState,
                            targetState,
                            0,
                            seat.ActiveSecondsToday));
                    }
                }
                break;

            case "UNASSIGN_EMPLOYEE":
                foreach (var seat in seats)
                {
                    if (seat.AssignedEmployeeId.HasValue)
                    {
                        seat.AssignedEmployeeId = null;
                        processedCount++;
                    }
                }
                break;

            case "CHANGE_ZONE_TYPE":
                var zoneType = request.ZoneType?.Trim().ToUpperInvariant() ?? "WORK_DESK";
                foreach (var seat in seats)
                {
                    seat.ZoneType = zoneType;
                    processedCount++;
                }
                break;

            case "DELETE":
                dbContext.Seats.RemoveRange(seats);
                processedCount = seats.Count;
                break;

            default:
                return Result.Failure<BatchSeatActionResult>(
                    new Error("INVALID_ACTION", $"Hành động '{action}' không hợp lệ."));
        }

        await dbContext.SaveChangesAsync(ct);

        foreach (var evt in pendingEvents)
        {
            await eventBus.PublishAsync(evt, ct);
        }

        return Result.Success(new BatchSeatActionResult(
            processedCount,
            action,
            $"Thao tác '{action}' thành công trên {processedCount}/{seats.Count} bàn làm việc."));
    }

    private static IReadOnlyList<PolygonPointDto> DeserializePolygon(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<List<PolygonPointDto>>(json, JsonOptions) ?? [];
        }
        catch
        {
            return [];
        }
    }
}

