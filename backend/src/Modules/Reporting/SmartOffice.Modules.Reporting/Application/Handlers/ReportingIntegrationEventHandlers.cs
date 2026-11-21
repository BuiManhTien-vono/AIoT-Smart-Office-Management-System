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
                TotalEmployees = 1,
                UpdatedAt = DateTimeOffset.UtcNow
            };
            dbContext.DailyDepartmentSummaries.Add(summary);
        }
        else
        {
            summary.TotalEmployees += 1;
            summary.UpdatedAt = DateTimeOffset.UtcNow;
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

/// <summary>
/// Helper phân loại thống nhất một trạng thái chấm công thành các cờ đếm cho bảng tổng hợp Reporting.
/// </summary>
internal static class AttendanceStatusClassifier
{
    public static (int Present, int Late, int Absent, int Revoked) Classify(string? status, int lateMinutes)
    {
        if (string.IsNullOrWhiteSpace(status))
        {
            return (0, 0, 0, 0);
        }

        var normalized = status.Trim().ToUpperInvariant();
        if (normalized == "ABSENT")
        {
            return (0, 0, 1, 0);
        }

        if (normalized == "REVOKED")
        {
            return (0, 0, 0, 1);
        }

        var isLate = normalized == "LATE" || (normalized == "EARLY_LEAVE" && lateMinutes > 0);
        return (1, isLate ? 1 : 0, 0, 0);
    }
}

/// <summary>
/// Bộ lắng nghe sự kiện tích hợp tại Module Reporting:
/// Trừ lại PresentCount / LateCount / AbsentCount / RevokedCount khi bản ghi bị gỡ bỏ
/// (trùng đơn nghỉ phép hoặc hủy công do lỗi hệ thống VOID_ERRONEOUS).
/// </summary>
public sealed class AttendanceLogRemovedEventHandler(ReportingDbContext dbContext)
    : IIntegrationEventHandler<AttendanceLogRemovedIntegrationEvent>
{
    public async Task HandleAsync(
        AttendanceLogRemovedIntegrationEvent integrationEvent,
        CancellationToken cancellationToken = default)
    {
        var summary = await dbContext.DailyDepartmentSummaries
            .FirstOrDefaultAsync(
                x => x.SummaryDate == integrationEvent.WorkDate && x.DepartmentId == integrationEvent.DepartmentId,
                cancellationToken);

        if (summary is null)
        {
            return;
        }

        var (prevPresent, prevLate, prevAbsent, prevRevoked) =
            AttendanceStatusClassifier.Classify(integrationEvent.PreviousStatus, integrationEvent.PreviousLateMinutes);

        summary.PresentCount = Math.Max(0, summary.PresentCount - prevPresent);
        summary.LateCount = Math.Max(0, summary.LateCount - prevLate);
        summary.AbsentCount = Math.Max(0, summary.AbsentCount - prevAbsent);
        summary.RevokedCount = Math.Max(0, summary.RevokedCount - prevRevoked);
        summary.UpdatedAt = DateTimeOffset.UtcNow;

        await dbContext.SaveChangesAsync(cancellationToken);
    }
}

/// <summary>
/// Bộ lắng nghe sự kiện tích hợp tại Module Reporting:
/// Đồng bộ chính xác delta PresentCount / LateCount / AbsentCount / RevokedCount
/// khi quản trị viên / HR / Trưởng phòng chỉnh sửa giờ công, bổ sung công thủ công hoặc phạt hủy công (REVOKE_PENALTY).
/// </summary>
public sealed class AttendanceLogAdjustedEventHandler(ReportingDbContext dbContext)
    : IIntegrationEventHandler<AttendanceLogAdjustedIntegrationEvent>
{
    public async Task HandleAsync(
        AttendanceLogAdjustedIntegrationEvent integrationEvent,
        CancellationToken cancellationToken = default)
    {
        var (prevPresent, prevLate, prevAbsent, prevRevoked) =
            AttendanceStatusClassifier.Classify(integrationEvent.PreviousStatus, integrationEvent.PreviousLateMinutes);
        var (newPresent, newLate, newAbsent, newRevoked) =
            AttendanceStatusClassifier.Classify(integrationEvent.NewStatus, integrationEvent.NewLateMinutes);

        var deltaPresent = newPresent - prevPresent;
        var deltaLate = newLate - prevLate;
        var deltaAbsent = newAbsent - prevAbsent;
        var deltaRevoked = newRevoked - prevRevoked;

        var summary = await dbContext.DailyDepartmentSummaries
            .FirstOrDefaultAsync(
                x => x.SummaryDate == integrationEvent.WorkDate && x.DepartmentId == integrationEvent.DepartmentId,
                cancellationToken);

        if (summary is null)
        {
            if (deltaPresent <= 0 && deltaLate <= 0 && deltaAbsent <= 0 && deltaRevoked <= 0)
            {
                return;
            }

            var deptCode = string.IsNullOrWhiteSpace(integrationEvent.DepartmentCode)
                ? "DEPT"
                : integrationEvent.DepartmentCode;

            var latestTotalEmployees = await dbContext.DailyDepartmentSummaries
                .Where(x => x.DepartmentId == integrationEvent.DepartmentId)
                .OrderByDescending(x => x.SummaryDate)
                .Select(x => x.TotalEmployees)
                .FirstOrDefaultAsync(cancellationToken);

            summary = new DailyDepartmentSummary
            {
                SummaryDate = integrationEvent.WorkDate,
                DepartmentId = integrationEvent.DepartmentId,
                DepartmentCode = deptCode,
                TotalEmployees = Math.Max(1, latestTotalEmployees),
                PresentCount = Math.Max(0, deltaPresent),
                LateCount = Math.Max(0, deltaLate),
                AbsentCount = Math.Max(0, deltaAbsent),
                RevokedCount = Math.Max(0, deltaRevoked),
                UpdatedAt = DateTimeOffset.UtcNow
            };
            dbContext.DailyDepartmentSummaries.Add(summary);
        }
        else
        {
            if ((string.IsNullOrWhiteSpace(summary.DepartmentCode) || summary.DepartmentCode == "DEPT")
                && !string.IsNullOrWhiteSpace(integrationEvent.DepartmentCode)
                && integrationEvent.DepartmentCode != "DEPT")
            {
                summary.DepartmentCode = integrationEvent.DepartmentCode;
            }

            summary.PresentCount = Math.Max(0, summary.PresentCount + deltaPresent);
            summary.LateCount = Math.Max(0, summary.LateCount + deltaLate);
            summary.AbsentCount = Math.Max(0, summary.AbsentCount + deltaAbsent);
            summary.RevokedCount = Math.Max(0, summary.RevokedCount + deltaRevoked);
            summary.UpdatedAt = DateTimeOffset.UtcNow;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }
}

/// <summary>
/// Bộ lắng nghe sự kiện tích hợp tại Module Reporting:
/// Tự động tăng AbsentCount khi tiến trình cuối ngày của Module Attendance chốt vắng mặt không phép.
/// </summary>
public sealed class AttendanceAbsentMarkedEventHandler(ReportingDbContext dbContext)
    : IIntegrationEventHandler<AttendanceAbsentMarkedIntegrationEvent>
{
    public async Task HandleAsync(
        AttendanceAbsentMarkedIntegrationEvent integrationEvent,
        CancellationToken cancellationToken = default)
    {
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
                AbsentCount = 1
            };
            dbContext.DailyDepartmentSummaries.Add(summary);
        }
        else
        {
            summary.AbsentCount += 1;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }
}

/// <summary>
/// Bộ lắng nghe sự kiện tích hợp tại Module Reporting (W2-4):
/// Tự động cộng dồn số lần nhân viên rời bàn quá hạn 15 phút (ProlongedAwayEvents)
/// khi Module Occupancy phát sự kiện ProlongedAbsenceDetectedIntegrationEvent.
/// </summary>
public sealed class ProlongedAbsenceDetectedEventHandler(ReportingDbContext dbContext)
    : IIntegrationEventHandler<ProlongedAbsenceDetectedIntegrationEvent>
{
    public async Task HandleAsync(
        ProlongedAbsenceDetectedIntegrationEvent integrationEvent,
        CancellationToken cancellationToken = default)
    {
        var summaryDate = DateOnly.FromDateTime(integrationEvent.OccurredOnUtc.DateTime);

        var summary = await dbContext.DailyDepartmentSummaries
            .FirstOrDefaultAsync(
                x => x.SummaryDate == summaryDate && x.DepartmentId == integrationEvent.DepartmentId,
                cancellationToken);

        if (summary is null)
        {
            summary = new DailyDepartmentSummary
            {
                SummaryDate = summaryDate,
                DepartmentId = integrationEvent.DepartmentId,
                DepartmentCode = "DEPT",
                TotalEmployees = 1,
                ProlongedAwayEvents = 1
            };
            dbContext.DailyDepartmentSummaries.Add(summary);
        }
        else
        {
            summary.ProlongedAwayEvents += 1;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }
}

/// <summary>
/// Bộ lắng nghe sự kiện tích hợp tại Module Reporting:
/// Tự động tăng SecurityAlertsCount khi Module Security phát hiện sự cố ngoài giờ hoặc giả mạo khuôn mặt.
/// </summary>
public sealed class SecurityIncidentDetectedEventHandler(ReportingDbContext dbContext)
    : IIntegrationEventHandler<SecurityIncidentDetectedIntegrationEvent>
{
    public async Task HandleAsync(
        SecurityIncidentDetectedIntegrationEvent integrationEvent,
        CancellationToken cancellationToken = default)
    {
        if (!integrationEvent.DepartmentId.HasValue)
        {
            return;
        }

        var summaryDate = DateOnly.FromDateTime(integrationEvent.OccurredOnUtc.DateTime);
        var deptId = integrationEvent.DepartmentId.Value;

        var summary = await dbContext.DailyDepartmentSummaries
            .FirstOrDefaultAsync(
                x => x.SummaryDate == summaryDate && x.DepartmentId == deptId,
                cancellationToken);

        if (summary is null)
        {
            summary = new DailyDepartmentSummary
            {
                SummaryDate = summaryDate,
                DepartmentId = deptId,
                DepartmentCode = "DEPT",
                TotalEmployees = 1,
                SecurityAlertsCount = 1
            };
            dbContext.DailyDepartmentSummaries.Add(summary);
        }
        else
        {
            summary.SecurityAlertsCount += 1;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }
}
