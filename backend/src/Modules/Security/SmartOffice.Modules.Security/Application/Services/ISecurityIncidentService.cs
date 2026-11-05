using SmartOffice.Modules.Security.Application.DTOs;
using SmartOffice.SharedKernel.Common;

namespace SmartOffice.Modules.Security.Application.Services;

public interface ISecurityIncidentService
{
    NightGuardStatusResponse CheckNightGuardStatus(DateTimeOffset? checkTimeUtc = null);

    Task<Result<SecurityIncidentResponse>> EvaluateAndRecordDetectionAsync(
        EvaluateNightGuardDetectionRequest request,
        CancellationToken ct = default);

    Task<Result<SecurityIncidentResponse>> ResolveIncidentTicketAsync(
        Guid incidentId,
        ResolveSecurityIncidentRequest request,
        CancellationToken ct = default);

    Task<IReadOnlyList<SecurityIncidentResponse>> GetIncidentsAsync(
        string? ticketStatus = null,
        string? alertLevel = null,
        int limit = 50,
        CancellationToken ct = default);
}

