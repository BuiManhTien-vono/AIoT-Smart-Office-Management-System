using Microsoft.AspNetCore.SignalR;
using SmartOffice.Modules.Occupancy.Endpoints;
using SmartOffice.SharedKernel.Events;

namespace SmartOffice.Modules.Occupancy.Application.Handlers;

/// <summary>
/// Các bộ lắng nghe sự kiện nội bộ để đẩy thông báo thời gian thực qua SignalR OccupancyHub
/// tới đúng phạm vi phòng ban của Trưởng bộ phận (DEPT_LEAD) cũng như nhóm giám sát toàn cục (ADMIN/HR).
/// </summary>
public sealed class SeatStateChangedRealtimeHandler(IHubContext<OccupancyHub>? hubContext = null)
    : IIntegrationEventHandler<SeatStateChangedIntegrationEvent>
{
    public async Task HandleAsync(
        SeatStateChangedIntegrationEvent integrationEvent,
        CancellationToken cancellationToken = default)
    {
        if (hubContext is null)
        {
            return;
        }

        var groups = new[]
        {
            OccupancyHub.GetDepartmentGroupName(integrationEvent.DepartmentId),
            OccupancyHub.GetRoleGroupName("ADMIN"),
            OccupancyHub.GetRoleGroupName("HR")
        };

        await hubContext.Clients
            .Groups(groups)
            .SendAsync("SeatStateChanged", integrationEvent, cancellationToken);
    }
}

public sealed class ProlongedAbsenceRealtimeHandler(IHubContext<OccupancyHub>? hubContext = null)
    : IIntegrationEventHandler<ProlongedAbsenceDetectedIntegrationEvent>
{
    public async Task HandleAsync(
        ProlongedAbsenceDetectedIntegrationEvent integrationEvent,
        CancellationToken cancellationToken = default)
    {
        if (hubContext is null)
        {
            return;
        }

        var groups = new[]
        {
            OccupancyHub.GetDepartmentGroupName(integrationEvent.DepartmentId),
            OccupancyHub.GetRoleGroupName("ADMIN")
        };

        await hubContext.Clients
            .Groups(groups)
            .SendAsync("ProlongedAbsenceAlert", integrationEvent, cancellationToken);
    }
}

public sealed class WrongSeatRealtimeHandler(IHubContext<OccupancyHub>? hubContext = null)
    : IIntegrationEventHandler<WrongSeatDetectedIntegrationEvent>
{
    public async Task HandleAsync(
        WrongSeatDetectedIntegrationEvent integrationEvent,
        CancellationToken cancellationToken = default)
    {
        if (hubContext is null)
        {
            return;
        }

        var groups = new[]
        {
            OccupancyHub.GetDepartmentGroupName(integrationEvent.DepartmentId),
            OccupancyHub.GetRoleGroupName("ADMIN"),
            OccupancyHub.GetRoleGroupName("HR")
        };

        await hubContext.Clients
            .Groups(groups)
            .SendAsync("WrongSeatAlert", integrationEvent, cancellationToken);
    }
}

