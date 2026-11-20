using Microsoft.AspNetCore.SignalR;
using SmartOffice.Modules.Occupancy.Endpoints;
using SmartOffice.SharedKernel.Contracts;
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

public sealed class ProlongedAbsenceRealtimeHandler(
    IHubContext<OccupancyHub>? hubContext = null,
    IEmployeeTelegramNotifier? telegram = null)
    : IIntegrationEventHandler<ProlongedAbsenceDetectedIntegrationEvent>
{
    public async Task HandleAsync(
        ProlongedAbsenceDetectedIntegrationEvent integrationEvent,
        CancellationToken cancellationToken = default)
    {
        if (hubContext is not null)
        {
            var groups = new[]
            {
                OccupancyHub.GetDepartmentGroupName(integrationEvent.DepartmentId),
                OccupancyHub.GetRoleGroupName("ADMIN"),
                OccupancyHub.GetRoleGroupName("HR"),
                OccupancyHub.GetRoleGroupName("SECURITY")
            };

            await hubContext.Clients
                .Groups(groups)
                .SendAsync("ProlongedAbsenceAlert", integrationEvent, cancellationToken);
        }

        // Cảnh báo bàn làm việc -> gửi Gmail riêng cho nhân viên được gán bàn
        if (telegram is not null)
        {
            await telegram.SendToEmployeeAsync(
                integrationEvent.AssignedEmployeeId,
                $"⚠️ Cảnh báo rời chỗ quá lâu: bạn đã rời bàn {integrationEvent.SeatCode} {FormatDuration(integrationEvent.AwayDurationSeconds)} mà chưa quay lại.",
                cancellationToken);
        }
    }

    internal static string FormatDuration(int seconds) =>
        seconds < 60 ? $"{seconds} giây" : $"{seconds / 60} phút {seconds % 60} giây";
}

public sealed class WrongSeatRealtimeHandler(
    IHubContext<OccupancyHub>? hubContext = null,
    IEmployeeTelegramNotifier? telegram = null)
    : IIntegrationEventHandler<WrongSeatDetectedIntegrationEvent>
{
    public async Task HandleAsync(
        WrongSeatDetectedIntegrationEvent integrationEvent,
        CancellationToken cancellationToken = default)
    {
        // Gửi riêng cho nhân viên đang ngồi sai bàn
        if (telegram is not null)
        {
            await telegram.SendToEmployeeAsync(
                integrationEvent.DetectedEmployeeId,
                $"⚠️ Cảnh báo ngồi sai vị trí: bạn đang ngồi tại bàn {integrationEvent.SeatCode}, không phải bàn được phân bổ cho bạn.",
                cancellationToken);
        }

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

/// <summary>
/// Đẩy sự kiện chấm công vào/ra ca thời gian thực tới toàn bộ máy trạm (Dashboard, Báo cáo Hub, Chấm công).
/// Giúp các biểu đồ và chỉ số KPI tự động làm mới tức thời mà không cần reload trang.
/// </summary>
public sealed class AttendanceCheckedRealtimeHandler(IHubContext<OccupancyHub>? hubContext = null)
    : IIntegrationEventHandler<AttendanceCheckedIntegrationEvent>
{
    public async Task HandleAsync(
        AttendanceCheckedIntegrationEvent integrationEvent,
        CancellationToken cancellationToken = default)
    {
        if (hubContext is null)
        {
            return;
        }

        await hubContext.Clients.All
            .SendAsync("AttendanceRecorded", integrationEvent, cancellationToken);
    }
}

/// <summary>
/// Đẩy sự kiện chốt vắng mặt không phép cuối ngày tới các client đang theo dõi.
/// </summary>
public sealed class AttendanceAbsentMarkedRealtimeHandler(IHubContext<OccupancyHub>? hubContext = null)
    : IIntegrationEventHandler<AttendanceAbsentMarkedIntegrationEvent>
{
    public async Task HandleAsync(
        AttendanceAbsentMarkedIntegrationEvent integrationEvent,
        CancellationToken cancellationToken = default)
    {
        if (hubContext is null)
        {
            return;
        }

        await hubContext.Clients.All
            .SendAsync("AttendanceRecorded", new
            {
                integrationEvent.EventId,
                integrationEvent.OccurredOnUtc,
                integrationEvent.AttendanceLogId,
                integrationEvent.EmployeeId,
                integrationEvent.EmployeeCode,
                integrationEvent.DepartmentId,
                integrationEvent.WorkDate,
                Status = "ABSENT",
                LateMinutes = 0,
                IsFirstCheckInOfDay = false
            }, cancellationToken);
    }
}

/// <summary>
/// Đẩy sự kiện tạo đơn nghỉ phép / công vụ trong ngày tới các client đang theo dõi chấm công.
/// </summary>
public sealed class LeaveRequestCreatedRealtimeHandler(IHubContext<OccupancyHub>? hubContext = null)
    : IIntegrationEventHandler<LeaveRequestCreatedIntegrationEvent>
{
    public async Task HandleAsync(
        LeaveRequestCreatedIntegrationEvent integrationEvent,
        CancellationToken cancellationToken = default)
    {
        if (hubContext is null)
        {
            return;
        }

        await hubContext.Clients.All
            .SendAsync("AttendanceRecorded", integrationEvent, cancellationToken);
    }
}

/// <summary>
/// Đẩy thông báo sự cố an ninh ngoài giờ thời gian thực tới Dashboard và trang An ninh SOC.
/// </summary>
public sealed class SecurityIncidentRealtimeHandler(IHubContext<OccupancyHub>? hubContext = null)
    : IIntegrationEventHandler<SecurityIncidentDetectedIntegrationEvent>
{
    public async Task HandleAsync(
        SecurityIncidentDetectedIntegrationEvent integrationEvent,
        CancellationToken cancellationToken = default)
    {
        if (hubContext is null)
        {
            return;
        }

        await hubContext.Clients.All
            .SendAsync("SecurityAlert", integrationEvent, cancellationToken);
    }
}

