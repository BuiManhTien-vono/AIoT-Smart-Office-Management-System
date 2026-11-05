using Microsoft.AspNetCore.SignalR;

namespace SmartOffice.Modules.Occupancy.Endpoints;

/// <summary>
/// SignalR Real-time Hub đồng bộ trạng thái chỗ ngồi (Live Seat Map) và cảnh báo rời bàn quá hạn (< 1 giây).
/// Cô lập luồng thông báo theo nhóm phòng ban (dept:{departmentId}) và vai trò (role:ADMIN, role:HR).
/// </summary>
public sealed class OccupancyHub : Hub
{
    public static string GetDepartmentGroupName(Guid departmentId) => $"dept:{departmentId:D}";
    public static string GetRoleGroupName(string role) => $"role:{role.Trim().ToUpperInvariant()}";

    public async Task JoinDepartmentGroup(Guid departmentId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, GetDepartmentGroupName(departmentId));
    }

    public async Task LeaveDepartmentGroup(Guid departmentId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, GetDepartmentGroupName(departmentId));
    }

    public async Task JoinOverviewGroup(string role = "ADMIN")
    {
        var normalizedRole = string.IsNullOrWhiteSpace(role) ? "ADMIN" : role.Trim().ToUpperInvariant();
        if (normalizedRole is "ADMIN" or "HR")
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, GetRoleGroupName(normalizedRole));
        }
    }
}

