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
            ? "APPROVED"
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
        var checkDate = DateOnly.FromDateTime(checkTimeUtc.DateTime);
        var previousDate = checkDate.AddDays(-1);
        var checkTime = TimeOnly.FromDateTime(checkTimeUtc.DateTime);

        var candidates = await dbContext.OtRegistrations
            .Where(x => x.EmployeeId == employeeId &&
                        x.ApprovalStatus == "APPROVED" &&
                        (x.OtDate == checkDate || x.OtDate == previousDate))
            .ToListAsync(ct);

        foreach (var reg in candidates)
        {
            bool isOvernight = reg.EndTime < reg.StartTime;
            if (!isOvernight)
            {
                if (reg.OtDate == checkDate && checkTime >= reg.StartTime && checkTime <= reg.EndTime)
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
            else
            {
                // Ca OT vắt qua nửa đêm (VD: 22:00 ngày D đến 02:00 sáng ngày D+1)
                bool matchedSameNight = reg.OtDate == checkDate && checkTime >= reg.StartTime;
                bool matchedEarlyMorningAfter = reg.OtDate == previousDate && checkTime <= reg.EndTime;

                if (matchedSameNight || matchedEarlyMorningAfter)
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

    private static OtRegistrationResponse MapResponse(OtRegistration ot, string fullName)
    {
        return new OtRegistrationResponse(
            ot.Id,
            ot.EmployeeId,
            ot.EmployeeCode,
            fullName,
            ot.OtDate,
            ot.StartTime,
            ot.EndTime,
            IsOvernight: ot.EndTime < ot.StartTime,
            ot.Reason,
            ot.ApprovalStatus,
            ot.ApprovedByUserId,
            ot.CreatedAt);
    }
}

