using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SmartOffice.Modules.Attendance.Application.DTOs;
using SmartOffice.Modules.Attendance.Application.Services;

namespace SmartOffice.Modules.Attendance.Endpoints;

[ApiController]
[Route("api/v1/attendance")]
public sealed class AttendanceController(IAttendanceService attendanceService) : ControllerBase
{
    [HttpGet("shifts")]
    public async Task<IActionResult> GetShifts(CancellationToken ct)
    {
        var list = await attendanceService.GetShiftsAsync(ct);
        return Ok(list);
    }

    [HttpPost("shifts")]
    public async Task<IActionResult> CreateShift([FromBody] CreateShiftRequest request, CancellationToken ct)
    {
        var result = await attendanceService.CreateShiftAsync(request, ct);
        if (result.IsFailure)
        {
            return BadRequest(new { code = result.Error.Code, message = result.Error.Message });
        }

        return Created($"/api/v1/attendance/shifts/{result.Value.Id}", result.Value);
    }

    [HttpPost("check")]
    public async Task<IActionResult> CheckInOut([FromBody] CheckAttendanceRequest request, CancellationToken ct)
    {
        var result = await attendanceService.ProcessCheckInOutAsync(request, ct);
        if (result.IsFailure)
        {
            return BadRequest(new { code = result.Error.Code, message = result.Error.Message });
        }

        return Ok(result.Value);
    }

    [HttpGet("logs")]
    public async Task<IActionResult> GetDailyLogs([FromQuery] DateOnly? date, CancellationToken ct)
    {
        var logs = await attendanceService.GetDailyAttendanceLogsAsync(date, ct);
        return Ok(logs);
    }

    [HttpPost("logs/{id:guid}/snapshot")]
    public async Task<IActionResult> UploadAttendanceSnapshot(
        Guid id,
        IFormFile file,
        CancellationToken ct)
    {
        if (file is null || file.Length == 0)
        {
            return BadRequest(new { code = "EMPTY_FILE", message = "Vui lòng chọn tệp ảnh chụp lúc chấm công." });
        }

        await using var stream = file.OpenReadStream();
        var result = await attendanceService.UploadAttendanceSnapshotAsync(
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

    [HttpGet("leaves")]
    public async Task<IActionResult> GetLeaves([FromQuery] DateOnly? date, CancellationToken ct)
    {
        var leaves = await attendanceService.GetLeaveRequestsAsync(date, ct);
        return Ok(leaves);
    }

    [HttpPost("leaves")]
    public async Task<IActionResult> CreateLeave([FromBody] CreateLeaveRequestDto request, CancellationToken ct)
    {
        var result = await attendanceService.CreateLeaveRequestAsync(request, ct);
        if (result.IsFailure)
        {
            return BadRequest(new { code = result.Error.Code, message = result.Error.Message });
        }

        return Created($"/api/v1/attendance/leaves/{result.Value.Id}", result.Value);
    }

    [HttpPost("mark-absent")]
    public async Task<IActionResult> MarkDailyAbsent([FromQuery] DateOnly? date, CancellationToken ct)
    {
        var result = await attendanceService.MarkDailyAbsentEmployeesAsync(date, ct);
        if (result.IsFailure)
        {
            return BadRequest(new { code = result.Error.Code, message = result.Error.Message });
        }

        return Ok(result.Value);
    }
}
