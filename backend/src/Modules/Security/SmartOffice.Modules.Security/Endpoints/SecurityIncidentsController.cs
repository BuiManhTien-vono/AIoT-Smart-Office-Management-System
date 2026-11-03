using Microsoft.AspNetCore.Mvc;
using SmartOffice.Modules.Security.Application.DTOs;
using SmartOffice.Modules.Security.Application.Services;

namespace SmartOffice.Modules.Security.Endpoints;

[ApiController]
[Route("api/v1/security")]
public sealed class SecurityIncidentsController(ISecurityIncidentService incidentService) : ControllerBase
{
    [HttpGet("night-guard/status")]
    public IActionResult GetNightGuardStatus([FromQuery] DateTimeOffset? checkTimeUtc)
    {
        var status = incidentService.CheckNightGuardStatus(checkTimeUtc);
        return Ok(status);
    }

    [HttpGet("incidents")]
    public async Task<IActionResult> GetIncidents(
        [FromQuery] string? ticketStatus,
        [FromQuery] string? alertLevel,
        [FromQuery] int limit = 50,
        CancellationToken ct = default)
    {
        var list = await incidentService.GetIncidentsAsync(ticketStatus, alertLevel, limit, ct);
        return Ok(list);
    }

    [HttpPost("incidents")]
    public async Task<IActionResult> EvaluateAndRecordIncident(
        [FromBody] EvaluateNightGuardDetectionRequest request,
        CancellationToken ct)
    {
        var result = await incidentService.EvaluateAndRecordDetectionAsync(request, ct);
        if (result.IsFailure)
        {
            return BadRequest(new { code = result.Error.Code, message = result.Error.Message });
        }

        return Created($"/api/v1/security/incidents/{result.Value.Id}", result.Value);
    }

    [HttpPut("incidents/{id:guid}/resolve")]
    public async Task<IActionResult> ResolveIncident(
        Guid id,
        [FromBody] ResolveSecurityIncidentRequest request,
        CancellationToken ct)
    {
        var result = await incidentService.ResolveIncidentTicketAsync(id, request, ct);
        if (result.IsFailure)
        {
            return BadRequest(new { code = result.Error.Code, message = result.Error.Message });
        }

        return Ok(result.Value);
    }
}

