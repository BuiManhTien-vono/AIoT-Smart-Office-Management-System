using Microsoft.AspNetCore.Mvc;
using SmartOffice.Modules.Security.Application.DTOs;
using SmartOffice.Modules.Security.Application.Services;

namespace SmartOffice.Modules.Security.Endpoints;

[ApiController]
[Route("api/v1/security/ot-registrations")]
public sealed class OtController(IOtService otService) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetOtRegistrations(
        [FromQuery] DateOnly? date,
        [FromQuery] Guid? employeeId,
        CancellationToken ct)
    {
        var list = await otService.GetOtRegistrationsAsync(date, employeeId, ct);
        return Ok(list);
    }

    [HttpPost]
    public async Task<IActionResult> CreateOtRegistration(
        [FromBody] CreateOtRegistrationRequest request,
        CancellationToken ct)
    {
        var result = await otService.CreateOtRegistrationAsync(request, ct);
        if (result.IsFailure)
        {
            return BadRequest(new { code = result.Error.Code, message = result.Error.Message });
        }

        return Created($"/api/v1/security/ot-registrations/{result.Value.Id}", result.Value);
    }

    [HttpPut("{id:guid}/status")]
    public async Task<IActionResult> UpdateApprovalStatus(
        Guid id,
        [FromBody] UpdateOtApprovalRequest request,
        CancellationToken ct)
    {
        var result = await otService.UpdateApprovalStatusAsync(id, request, ct);
        if (result.IsFailure)
        {
            return BadRequest(new { code = result.Error.Code, message = result.Error.Message });
        }

        return Ok(result.Value);
    }

    [HttpGet("check")]
    public async Task<IActionResult> CheckValidOvertime(
        [FromQuery] Guid employeeId,
        [FromQuery] DateTimeOffset? checkTimeUtc,
        CancellationToken ct)
    {
        var result = await otService.CheckApprovedOvertimeAsync(
            employeeId,
            checkTimeUtc ?? DateTimeOffset.UtcNow,
            ct);

        return Ok(result);
    }
}

