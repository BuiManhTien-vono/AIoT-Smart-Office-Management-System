using SmartOffice.Modules.Security.Application.DTOs;
using SmartOffice.SharedKernel.Common;
using SmartOffice.SharedKernel.Contracts;

namespace SmartOffice.Modules.Security.Application.Services;

public interface IOtService
{
    Task<Result<OtRegistrationResponse>> CreateOtRegistrationAsync(
        CreateOtRegistrationRequest request,
        CancellationToken ct = default);

    Task<Result<OtRegistrationResponse>> UpdateApprovalStatusAsync(
        Guid id,
        UpdateOtApprovalRequest request,
        CancellationToken ct = default);

    Task<IReadOnlyList<OtRegistrationResponse>> GetOtRegistrationsAsync(
        DateOnly? otDate = null,
        Guid? employeeId = null,
        CancellationToken ct = default);

    Task<OvertimeLookupResultDto> CheckApprovedOvertimeAsync(
        Guid employeeId,
        DateTimeOffset checkTimeUtc,
        CancellationToken ct = default);
}

