using Microsoft.AspNetCore.Http;
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

    [HttpPost("incidents/{id:guid}/evidence")]
    public async Task<IActionResult> UploadIncidentEvidence(
        Guid id,
        IFormFile file,
        [FromQuery] string evidenceType = "SNAPSHOT",
        CancellationToken ct = default)
    {
        if (file is null || file.Length == 0)
        {
            return BadRequest(new { code = "EMPTY_FILE", message = "Vui lòng chọn tệp bằng chứng (ảnh chụp hoặc video clip)." });
        }

        await using var stream = file.OpenReadStream();
        var defaultContentType = string.Equals(evidenceType, "VIDEO_CLIP", StringComparison.OrdinalIgnoreCase)
            ? "video/mp4"
            : "image/jpeg";

        var result = await incidentService.UploadIncidentEvidenceAsync(
            id,
            evidenceType,
            stream,
            file.ContentType ?? defaultContentType,
            ct);

        if (result.IsFailure)
        {
            return BadRequest(new { code = result.Error.Code, message = result.Error.Message });
        }

        return Ok(result.Value);
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
