using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SmartOffice.Modules.Attendance.Application.DTOs;
using SmartOffice.Modules.Attendance.Application.Services;
using SmartOffice.SharedKernel.Common;
using SmartOffice.SharedKernel.Security;

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

    [HttpPut("shifts/{id:guid}")]
    public async Task<IActionResult> UpdateShift(Guid id, [FromBody] CreateShiftRequest request, CancellationToken ct)
    {
        var result = await attendanceService.UpdateShiftAsync(id, request, ct);
        if (result.IsFailure)
        {
            if (result.Error.Code == "SHIFT_NOT_FOUND")
            {
                return NotFound(new { code = result.Error.Code, message = result.Error.Message });
            }

            return BadRequest(new { code = result.Error.Code, message = result.Error.Message });
        }

        return Ok(result.Value);
    }


    [HttpDelete("shifts/{id:guid}")]
    public async Task<IActionResult> DeleteShift(Guid id, CancellationToken ct)
    {
        var result = await attendanceService.DeleteShiftAsync(id, ct);
        if (result.IsFailure)
        {
            if (result.Error.Code == "SHIFT_NOT_FOUND")
            {
                return NotFound(new { code = result.Error.Code, message = result.Error.Message });
            }

            return BadRequest(new { code = result.Error.Code, message = result.Error.Message });
        }

        return NoContent();
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
    public async Task<IActionResult> GetDailyLogs(
        [FromQuery] DateOnly? date,
        [FromQuery] DateOnly? fromDate,
        [FromQuery] DateOnly? toDate,
        CancellationToken ct)
    {
        var logs = await attendanceService.GetDailyAttendanceLogsAsync(date, fromDate, toDate, ct);
        return Ok(logs);
    }

    [HttpPut("logs/{id:guid}")]
    public async Task<IActionResult> AdjustLog(
        Guid id,
        [FromBody] AdjustAttendanceRequest request,
        CancellationToken ct)
    {
        if (!TryGetAuthenticatedActor(out var actor, out var authError))
        {
            return authError!;
        }

        var result = await attendanceService.AdjustAttendanceLogAsync(id, request, actor!, ct);
        if (result.IsFailure)
        {
            return ToErrorResult(result.Error);
        }

        return Ok(result.Value);
    }


    [HttpPost("logs/manual")]
    public async Task<IActionResult> CreateManualLog(
        [FromBody] ManualAttendanceRequest request,
        CancellationToken ct)
    {
        if (!TryGetAuthenticatedActor(out var actor, out var authError))
        {
            return authError!;
        }

        var result = await attendanceService.CreateManualAttendanceLogAsync(request, actor!, ct);
        if (result.IsFailure)
        {
            return ToErrorResult(result.Error);
        }

        return Created($"/api/v1/attendance/logs/{result.Value.Id}", result.Value);
    }

    [HttpPost("logs/{id:guid}/cancel")]
    public async Task<IActionResult> CancelLog(
        Guid id,
        [FromBody] CancelAttendanceRequest request,
        CancellationToken ct)
    {
        if (!TryGetAuthenticatedActor(out var actor, out var authError))
        {
            return authError!;
        }

        var result = await attendanceService.CancelAttendanceLogAsync(id, request, actor!, ct);
        if (result.IsFailure)
        {
            return ToErrorResult(result.Error);
        }

        return Ok(result.Value);
    }


    [HttpGet("audits")]
    public async Task<IActionResult> GetAudits(
        [FromQuery] Guid? employeeId,
        [FromQuery] DateOnly? fromDate,
        [FromQuery] DateOnly? toDate,
        CancellationToken ct)
    {
        if (!TryGetAuthenticatedActor(out var actor, out var authError))
        {
            return authError!;
        }

        var result = await attendanceService.GetAttendanceAuditsAsync(actor!, employeeId, fromDate, toDate, ct);
        if (result.IsFailure)
        {
            return ToErrorResult(result.Error);
        }

        return Ok(result.Value);
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

    [HttpPatch("leaves/{id:guid}/cancel")]
    public async Task<IActionResult> CancelLeave(Guid id, CancellationToken ct)
    {
        var result = await attendanceService.CancelLeaveRequestAsync(id, ct);
        if (result.IsFailure)
        {
            return BadRequest(new { code = result.Error.Code, message = result.Error.Message });
        }

        return Ok(result.Value);
    }


    [HttpPost("leaves/{id:guid}/replace")]
    public async Task<IActionResult> ReplaceLeave(
        Guid id,
        [FromBody] CreateLeaveRequestDto request,
        CancellationToken ct)
    {
        var result = await attendanceService.ReplaceLeaveRequestAsync(id, request, ct);
        if (result.IsFailure)
        {
            return BadRequest(new { code = result.Error.Code, message = result.Error.Message });
        }

        return Ok(result.Value);
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


    private bool TryGetAuthenticatedActor(out ActorContext? actor, out IActionResult? errorResult)
    {
        actor = JwtTokenHelper.ExtractActor(HttpContext.User);
        if (actor is not null)
        {
            errorResult = null;
            return true;
        }

        var authCode = HttpContext.Items.TryGetValue("JwtAuthError", out var errObj) && errObj is string s && !string.IsNullOrWhiteSpace(s)
            ? s
            : "UNAUTHORIZED";

        var message = authCode == "TOKEN_EXPIRED"
            ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
            : "Yêu cầu xác thực JWT hợp lệ để thực hiện thao tác này.";

        errorResult = Unauthorized(new { code = authCode, message });
        return false;
    }

    private IActionResult ToErrorResult(Error error)
    {
        var payload = new { code = error.Code, message = error.Message };
        if (error.Code.StartsWith("FORBIDDEN", StringComparison.OrdinalIgnoreCase))
        {
            return StatusCode(StatusCodes.Status403Forbidden, payload);
        }

        if (error.Code.EndsWith("NOT_FOUND", StringComparison.OrdinalIgnoreCase))
        {
            return NotFound(payload);
        }

        return BadRequest(payload);
    }
}
