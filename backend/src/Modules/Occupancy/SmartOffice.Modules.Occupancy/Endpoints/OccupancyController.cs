using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SmartOffice.Modules.Occupancy.Application.DTOs;
using SmartOffice.Modules.Occupancy.Application.Services;

namespace SmartOffice.Modules.Occupancy.Endpoints;

[ApiController]
[Route("api/v1/occupancy")]
public sealed class OccupancyController(IOccupancyService occupancyService) : ControllerBase
{
    [HttpGet("cameras")]
    public async Task<IActionResult> GetCameras([FromQuery] Guid? departmentId, CancellationToken ct)
    {
        var cameras = await occupancyService.GetCamerasAsync(departmentId, ct);
        return Ok(cameras);
    }

    [HttpPost("cameras")]
    public async Task<IActionResult> CreateCamera([FromBody] CreateCameraRequest request, CancellationToken ct)
    {
        var result = await occupancyService.CreateCameraAsync(request, ct);
        if (result.IsFailure)
        {
            return BadRequest(new { code = result.Error.Code, message = result.Error.Message });
        }

        return Created($"/api/v1/occupancy/cameras/{result.Value.Id}", result.Value);
    }

    [HttpPost("cameras/{id:guid}/calibration-frame")]
    public async Task<IActionResult> UploadCalibrationFrame(
        Guid id,
        IFormFile file,
        CancellationToken ct)
    {
        if (file is null || file.Length == 0)
        {
            return BadRequest(new { code = "EMPTY_FILE", message = "Tệp ảnh khung hình hiệu chuẩn không được để trống." });
        }

        await using var stream = file.OpenReadStream();
        var result = await occupancyService.UploadCalibrationFrameAsync(
            id,
            stream,
            file.ContentType ?? "image/jpeg",
            ct);

        if (result.IsFailure)
        {
            return BadRequest(new { code = result.Error.Code, message = result.Error.Message });
        }

        return Ok(result.Value);
    }

    [HttpGet("cameras/{cameraCode}/zones")]
    public async Task<IActionResult> GetCameraZones(string cameraCode, CancellationToken ct)
    {
        var result = await occupancyService.GetCameraZoneConfigAsync(cameraCode, ct);
        if (result.IsFailure)
        {
            return NotFound(new { code = result.Error.Code, message = result.Error.Message });
        }

        return Ok(result.Value);
    }

    [HttpGet("seats")]
    [HttpGet("seat-map")]
    public async Task<IActionResult> GetSeats(
        [FromQuery] Guid? departmentId,
        [FromQuery] Guid? cameraId,
        CancellationToken ct)
    {
        var seats = await occupancyService.GetSeatsAsync(departmentId, cameraId, ct);
        return Ok(seats);
    }

    [HttpPost("seats")]
    public async Task<IActionResult> CreateSeat([FromBody] CreateSeatRequest request, CancellationToken ct)
    {
        var result = await occupancyService.CreateSeatAsync(request, ct);
        if (result.IsFailure)
        {
            return BadRequest(new { code = result.Error.Code, message = result.Error.Message });
        }

        return Created($"/api/v1/occupancy/seats/{result.Value.Id}", result.Value);
    }

    [HttpPut("seats/{id:guid}/polygon")]
    public async Task<IActionResult> UpdateSeatPolygon(
        Guid id,
        [FromBody] UpdateSeatPolygonRequest request,
        CancellationToken ct)
    {
        var result = await occupancyService.UpdateSeatPolygonAsync(id, request, ct);
        if (result.IsFailure)
        {
            return BadRequest(new { code = result.Error.Code, message = result.Error.Message });
        }

        return Ok(result.Value);
    }

    [HttpPost("state-sync")]
    public async Task<IActionResult> SyncOccupancyState(
        [FromBody] OccupancyStateSyncRequest request,
        CancellationToken ct)
    {
        var result = await occupancyService.SyncOccupancyStateAsync(request, ct);
        if (result.IsFailure)
        {
            return BadRequest(new { code = result.Error.Code, message = result.Error.Message });
        }

        return Ok(result.Value);
    }

    [HttpGet("logs")]
    public async Task<IActionResult> GetLogs(
        [FromQuery] Guid? seatId,
        [FromQuery] int limit = 50,
        CancellationToken ct = default)
    {
        var logs = await occupancyService.GetOccupancyLogsAsync(seatId, limit, ct);
        return Ok(logs);
    }
}

