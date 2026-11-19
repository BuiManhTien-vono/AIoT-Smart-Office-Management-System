using Microsoft.EntityFrameworkCore;
using SmartOffice.Modules.Security.Application.DTOs;
using SmartOffice.Modules.Security.Domain;
using SmartOffice.Modules.Security.Infrastructure;
using SmartOffice.SharedKernel.Common;
using SmartOffice.SharedKernel.Contracts;

namespace SmartOffice.Modules.Security.Application.Services;

/// <summary>
/// Dịch vụ quản lý đăng ký làm thêm ngoài giờ (Overtime - US-SEC-01 / W2-6):
/// - Hỗ trợ đăng ký OT trong ngày và OT vắt qua nửa đêm (StartTime > EndTime).
/// - Quản lý trạng thái phê duyệt (PENDING, APPROVED, REJECTED).
/// - Thực thi IOvertimeLookupContract phục vụ cây quyết định an ninh trực đêm (Night Guard).
/// </summary>
public sealed class OtService(
    SecurityDbContext dbContext,
    IEmployeeLookupContract employeeLookup) : IOtService, IOvertimeLookupContract
{
    public static readonly HashSet<string> AllowedStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "PENDING",
        "APPROVED",
        "REJECTED"
    };

    /// <summary>Múi giờ văn phòng (Việt Nam, UTC+7) dùng để diễn giải ngày/giờ đăng ký OT.</summary>
    public static readonly TimeSpan OfficeUtcOffset = TimeSpan.FromHours(7);

    /// <summary>Ân hạn sau giờ kết thúc OT để nhân viên thu dọn ra về.</summary>
    public const int OtEndGraceMinutes = 20;

    /// <summary>
    /// Kiểm tra thời điểm (giờ địa phương) có nằm trong [StartTime, EndTime + ân hạn] của ca OT,
    /// hỗ trợ cả ca vắt qua nửa đêm. Quy về số phút tính từ 00:00 ngày OtDate.
    /// </summary>
    internal static bool IsWithinOtWindow(OtRegistration reg, DateOnly checkDate, TimeOnly checkTime)
    {
        int dayOffset = checkDate.DayNumber - reg.OtDate.DayNumber;
        if (dayOffset is < 0 or > 1)
        {
            return false;
        }

        int checkMinute = dayOffset * 1440 + (int)checkTime.ToTimeSpan().TotalMinutes;
        int startMinute = (int)reg.StartTime.ToTimeSpan().TotalMinutes;
        int endMinute = (int)reg.EndTime.ToTimeSpan().TotalMinutes;
        if (reg.EndTime < reg.StartTime)
        {
            endMinute += 1440; // Ca qua đêm
        }

        return checkMinute >= startMinute && checkMinute <= endMinute + OtEndGraceMinutes;
    }

    public async Task<Result<OtRegistrationResponse>> CreateOtRegistrationAsync(
        CreateOtRegistrationRequest request,
        CancellationToken ct = default)
    {
        if (request.StartTime == request.EndTime)
        {
            return Result.Failure<OtRegistrationResponse>(
                new Error("INVALID_OT_TIME_WINDOW", "Giờ bắt đầu và giờ kết thúc đăng ký OT không được trùng nhau."));
        }

        var status = string.IsNullOrWhiteSpace(request.ApprovalStatus)
            ? "PENDING"
            : request.ApprovalStatus.Trim().ToUpperInvariant();

        if (!AllowedStatuses.Contains(status))
        {
            return Result.Failure<OtRegistrationResponse>(
                new Error("INVALID_APPROVAL_STATUS", $"Trạng thái phê duyệt '{status}' không hợp lệ (chấp nhận PENDING, APPROVED, REJECTED)."));
        }

        var employee = await employeeLookup.GetByIdAsync(request.EmployeeId, ct);
        if (employee is null || !employee.IsActive)
        {
            return Result.Failure<OtRegistrationResponse>(
                new Error("EMPLOYEE_NOT_FOUND", "Nhân viên đăng ký làm thêm giờ không tồn tại hoặc đã nghỉ việc."));
        }

        var ot = new OtRegistration
        {
            EmployeeId = employee.EmployeeId,
            EmployeeCode = employee.EmployeeCode,
            OtDate = request.OtDate,
            StartTime = request.StartTime,
            EndTime = request.EndTime,
            Reason = request.Reason?.Trim(),
            ProjectName = request.ProjectName?.Trim(),
            ApprovalStatus = status,
            ApprovedByUserId = request.ApprovedByUserId
        };


        dbContext.OtRegistrations.Add(ot);
        await dbContext.SaveChangesAsync(ct);

        return Result.Success(MapResponse(ot, employee.FullName));
    }

    public async Task<Result<OtRegistrationResponse>> UpdateApprovalStatusAsync(
        Guid id,
        UpdateOtApprovalRequest request,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.ApprovalStatus) ||
            !AllowedStatuses.Contains(request.ApprovalStatus.Trim()))
        {
            return Result.Failure<OtRegistrationResponse>(
                new Error("INVALID_APPROVAL_STATUS", $"Trạng thái phê duyệt '{request.ApprovalStatus}' không hợp lệ."));
        }

        var ot = await dbContext.OtRegistrations.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (ot is null)
        {
            return Result.Failure<OtRegistrationResponse>(
                new Error("OT_REGISTRATION_NOT_FOUND", "Không tìm thấy bản ghi đăng ký làm thêm giờ."));
        }

        ot.ApprovalStatus = request.ApprovalStatus.Trim().ToUpperInvariant();
        if (request.ApprovedByUserId.HasValue)
        {
            ot.ApprovedByUserId = request.ApprovedByUserId;
        }

        if (!string.IsNullOrWhiteSpace(request.Reason))
        {
            ot.Reason = request.Reason.Trim();
        }

        // Tự động đóng các sự cố hiện diện ngoài giờ (OPEN) của nhân viên trong ngày OT nếu ca OT được duyệt
        if (ot.ApprovalStatus == "APPROVED")
        {
            var openIncidents = await dbContext.SecurityIncidents
                .Where(x => x.DetectedEmployeeId == ot.EmployeeId &&
                            x.IncidentType == SecurityIncidentService.TypeUnregisteredAfterHours &&
                            x.TicketStatus == SecurityIncidentService.TicketOpen)
                .ToListAsync(ct);

            foreach (var inc in openIncidents)
            {
                var incDate = DateOnly.FromDateTime(inc.DetectedAt.ToOffset(OfficeUtcOffset).DateTime);
                if (incDate == ot.OtDate)
                {
                    inc.TicketStatus = SecurityIncidentService.TicketAcknowledged;
                    inc.AlertLevel = SecurityIncidentService.AlertLevel1ApprovedOt;
                    inc.Severity = SecurityIncidentService.SeverityLow;
                    inc.ResolutionNote = $"Tự động đóng sự cố: ca làm thêm ngày {ot.OtDate:dd/MM/yyyy} ({ot.StartTime:HH\\:mm} - {ot.EndTime:HH\\:mm}) đã được phê duyệt.";
                    inc.ResolvedAt = DateTimeOffset.UtcNow;
                    inc.ResolvedByUserId = request.ApprovedByUserId;
                }
            }
        }

        await dbContext.SaveChangesAsync(ct);

        var emp = await employeeLookup.GetByIdAsync(ot.EmployeeId, ct);
        return Result.Success(MapResponse(ot, emp?.FullName ?? ot.EmployeeCode));
    }

    public async Task<IReadOnlyList<OtRegistrationResponse>> GetOtRegistrationsAsync(
        DateOnly? otDate = null,
        Guid? employeeId = null,
        CancellationToken ct = default)
    {
        var query = dbContext.OtRegistrations.AsQueryable();
        if (otDate.HasValue)
        {
            query = query.Where(x => x.OtDate == otDate.Value);
        }

        if (employeeId.HasValue)
        {
            query = query.Where(x => x.EmployeeId == employeeId.Value);
        }

        var items = await query
            .OrderByDescending(x => x.OtDate)
            .ThenBy(x => x.StartTime)
            .ToListAsync(ct);

        var results = new List<OtRegistrationResponse>(items.Count);
        foreach (var item in items)
        {
            var emp = await employeeLookup.GetByIdAsync(item.EmployeeId, ct);
            results.Add(MapResponse(item, emp?.FullName ?? item.EmployeeCode));
        }

        return results;
    }

    public async Task<OvertimeLookupResultDto> CheckApprovedOvertimeAsync(
        Guid employeeId,
        DateTimeOffset checkTimeUtc,
        CancellationToken ct = default)
    {
        // Ca OT được đăng ký theo giờ văn phòng Việt Nam (UTC+7) -> phải quy đổi trước khi so sánh.
        // Lỗi cũ: dùng checkTimeUtc.DateTime (giờ UTC) nên 20:00 VN bị so thành 13:00 và lệch cả ngày lúc sáng sớm.
        var localTime = checkTimeUtc.ToOffset(OfficeUtcOffset);
        var checkDate = DateOnly.FromDateTime(localTime.DateTime);
        var previousDate = checkDate.AddDays(-1);
        var checkTime = TimeOnly.FromDateTime(localTime.DateTime);

        var candidates = await dbContext.OtRegistrations
            .Where(x => x.EmployeeId == employeeId &&
                        x.ApprovalStatus == "APPROVED" &&
                        (x.OtDate == checkDate || x.OtDate == previousDate))
            .ToListAsync(ct);

        foreach (var reg in candidates)
        {
            if (IsWithinOtWindow(reg, checkDate, checkTime))
            {
                return new OvertimeLookupResultDto(
                    true,
                    reg.Id,
                    reg.EmployeeId,
                    reg.EmployeeCode,
                    reg.OtDate,
                    reg.StartTime,
                    reg.EndTime);
            }
        }

        return new OvertimeLookupResultDto(
            false,
            null,
            employeeId,
            string.Empty,
            null,
            null,
            null);
    }

    private static double CalculateHours(TimeOnly start, TimeOnly end)
    {
        if (end > start)
        {
            return (end - start).TotalHours;
        }
        return 24 - (start - end).TotalHours;
    }

    private static OtRegistrationResponse MapResponse(OtRegistration ot, string fullName)
    {
        var hours = CalculateHours(ot.StartTime, ot.EndTime);
        return new OtRegistrationResponse(
            ot.Id,
            ot.EmployeeId,
            ot.EmployeeCode,
            fullName,
            ot.OtDate,
            ot.StartTime,
            ot.EndTime,
            IsOvernight: ot.EndTime < ot.StartTime,
            EstimatedHours: Math.Round(hours, 1),
            ot.ProjectName,
            ot.Reason,
            ot.ApprovalStatus,
            ot.ApprovedByUserId,
            ot.CreatedAt);
    }
}

