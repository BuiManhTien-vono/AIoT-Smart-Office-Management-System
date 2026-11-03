using Microsoft.AspNetCore.Mvc;
using SmartOffice.Modules.Reporting.Application.DTOs;
using SmartOffice.Modules.Reporting.Application.Services;

namespace SmartOffice.Modules.Reporting.Endpoints;

[ApiController]
[Route("api/v1/reporting")]
public sealed class ReportingController(IReportingService reportingService) : ControllerBase
{
    [HttpGet("users")]
    public async Task<IActionResult> GetUsers([FromQuery] string? role, CancellationToken ct)
    {
        var users = await reportingService.GetUsersAsync(role, ct);
        return Ok(users);
    }

    [HttpPost("users")]
    public async Task<IActionResult> CreateUser([FromBody] CreateAppUserRequest request, CancellationToken ct)
    {
        var result = await reportingService.CreateUserAsync(request, ct);
        if (result.IsFailure)
        {
            return BadRequest(new { code = result.Error.Code, message = result.Error.Message });
        }

        return Created($"/api/v1/reporting/users/{result.Value.Id}", result.Value);
    }

    [HttpPost("auth/login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request, CancellationToken ct)
    {
        var result = await reportingService.AuthenticateAsync(request, ct);
        if (result.IsFailure)
        {
            return Unauthorized(new { code = result.Error.Code, message = result.Error.Message });
        }

        return Ok(result.Value);
    }

    [HttpGet("daily-summaries")]
    public async Task<IActionResult> GetDailySummaries(
        [FromQuery] DateOnly? date,
        [FromQuery] Guid? departmentId,
        CancellationToken ct)
    {
        var summaries = await reportingService.GetDailySummariesAsync(date, departmentId, ct);
        return Ok(summaries);
    }

    [HttpGet("monthly-report")]
    public async Task<IActionResult> GetMonthlyReport(
        [FromQuery] int? year,
        [FromQuery] int? month,
        [FromQuery] Guid? departmentId,
        CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var report = await reportingService.GetMonthlyReportAsync(
            year ?? now.Year,
            month ?? now.Month,
            departmentId,
            ct);

        return Ok(report);
    }

    [HttpGet("export-csv")]
    public async Task<IActionResult> ExportMonthlyReportCsv(
        [FromQuery] int? year,
        [FromQuery] int? month,
        [FromQuery] Guid? departmentId,
        CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        int y = year ?? now.Year;
        int m = month ?? now.Month;

        var csvBytes = await reportingService.ExportMonthlyReportCsvAsync(y, m, departmentId, ct);
        return File(csvBytes, "text/csv; charset=utf-8", $"SmartOffice_MonthlyReport_{y}_{m:D2}.csv");
    }
}
