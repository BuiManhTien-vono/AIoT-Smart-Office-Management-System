using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmartOffice.Modules.Reporting.Infrastructure;

namespace SmartOffice.Modules.Reporting.Endpoints;

[ApiController]
[Route("api/v1/reporting")]
public sealed class ReportingController(ReportingDbContext dbContext) : ControllerBase
{
    [HttpGet("daily-summaries")]
    public async Task<IActionResult> GetDailySummaries([FromQuery] DateOnly? date, CancellationToken ct)
    {
        var targetDate = date ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var summaries = await dbContext.DailyDepartmentSummaries
            .Where(x => x.SummaryDate == targetDate)
            .OrderBy(x => x.DepartmentCode)
            .ToListAsync(ct);

        return Ok(summaries);
    }
}
