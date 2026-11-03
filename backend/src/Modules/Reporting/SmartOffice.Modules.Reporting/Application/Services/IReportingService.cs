using SmartOffice.Modules.Reporting.Application.DTOs;
using SmartOffice.SharedKernel.Common;

namespace SmartOffice.Modules.Reporting.Application.Services;

public interface IReportingService
{
    Task<Result<AppUserResponse>> CreateUserAsync(
        CreateAppUserRequest request,
        CancellationToken ct = default);

    Task<Result<LoginResponse>> AuthenticateAsync(
        LoginRequest request,
        CancellationToken ct = default);

    Task<IReadOnlyList<AppUserResponse>> GetUsersAsync(
        string? role = null,
        CancellationToken ct = default);

    Task<IReadOnlyList<DailyDepartmentSummaryDto>> GetDailySummariesAsync(
        DateOnly? date = null,
        Guid? departmentId = null,
        CancellationToken ct = default);

    Task<MonthlyDepartmentReportDto> GetMonthlyReportAsync(
        int year,
        int month,
        Guid? departmentId = null,
        CancellationToken ct = default);

    Task<byte[]> ExportMonthlyReportCsvAsync(
        int year,
        int month,
        Guid? departmentId = null,
        CancellationToken ct = default);
}

