using Microsoft.EntityFrameworkCore;
using SmartOffice.Modules.Reporting.Domain;
using SmartOffice.Modules.Reporting.Infrastructure;
using SmartOffice.SharedKernel.Events;

namespace SmartOffice.Modules.Reporting.Application.Handlers;

/// <summary>
/// Bộ lắng nghe sự kiện tích hợp tại Module Reporting:
/// Tự động cập nhật bảng tổng hợp (schema: reporting) khi Module Biometrics thêm nhân viên mới.
/// </summary>
public sealed class EmployeeRegisteredEventHandler(ReportingDbContext dbContext)
    : IIntegrationEventHandler<EmployeeRegisteredIntegrationEvent>
{
    public async Task HandleAsync(
        EmployeeRegisteredIntegrationEvent integrationEvent,
        CancellationToken cancellationToken = default)
    {
        var today = DateOnly.FromDateTime(integrationEvent.OccurredOnUtc.DateTime);

        var summary = await dbContext.DailyDepartmentSummaries
            .FirstOrDefaultAsync(
                x => x.SummaryDate == today && x.DepartmentId == integrationEvent.DepartmentId,
                cancellationToken);

        if (summary is null)
        {
            summary = new DailyDepartmentSummary
            {
                SummaryDate = today,
                DepartmentId = integrationEvent.DepartmentId,
                DepartmentCode = integrationEvent.DepartmentCode,
                TotalEmployees = 1
            };
            dbContext.DailyDepartmentSummaries.Add(summary);
        }
        else
        {
            summary.TotalEmployees += 1;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }
}

/// <summary>
/// Bộ lắng nghe sự kiện tích hợp tại Module Reporting:
/// Tự động cập nhật số lượng đi làm (PresentCount) và đi muộn (LateCount)
/// khi Module Attendance phát sự kiện chấm công thành công.
/// </summary>
public sealed class AttendanceCheckedEventHandler(ReportingDbContext dbContext)
    : IIntegrationEventHandler<AttendanceCheckedIntegrationEvent>
{
    public async Task HandleAsync(
        AttendanceCheckedIntegrationEvent integrationEvent,
        CancellationToken cancellationToken = default)
    {
        if (!integrationEvent.IsFirstCheckInOfDay)
        {
            return;
        }

        var summary = await dbContext.DailyDepartmentSummaries
            .FirstOrDefaultAsync(
                x => x.SummaryDate == integrationEvent.WorkDate && x.DepartmentId == integrationEvent.DepartmentId,
                cancellationToken);

        if (summary is null)
        {
            summary = new DailyDepartmentSummary
            {
                SummaryDate = integrationEvent.WorkDate,
                DepartmentId = integrationEvent.DepartmentId,
                DepartmentCode = "DEPT",
                TotalEmployees = 1,
                PresentCount = 1,
                LateCount = integrationEvent.Status == "LATE" ? 1 : 0
            };
            dbContext.DailyDepartmentSummaries.Add(summary);
        }
        else
        {
            summary.PresentCount += 1;
            if (integrationEvent.Status == "LATE")
            {
                summary.LateCount += 1;
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }
}
