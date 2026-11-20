namespace SmartOffice.SharedKernel.Contracts;

/// <summary>
/// Kết quả kiểm tra đơn nghỉ phép hoặc công vụ hợp lệ trong ngày (APPROVED) của nhân viên tại một thời điểm.
/// </summary>
public sealed record LeaveLookupResultDto(
    bool HasApprovedLeave,
    Guid? LeaveRequestId,
    Guid EmployeeId,
    string? LeaveType,
    bool IsPaid,
    DateOnly? StartDate,
    DateOnly? EndDate,
    TimeOnly? StartTime,
    TimeOnly? EndTime);

/// <summary>
/// Hợp đồng tra cứu đơn nghỉ phép / vắng mặt trong ngày đặt tại SharedKernel,
/// phục vụ Module Occupancy (miễn trừ cảnh báo PROLONGED_AWAY & tính thời gian làm việc hợp lệ)
/// mà không cần tham chiếu trực tiếp sang Module Attendance.
/// </summary>
public interface ILeaveLookupContract
{
    Task<LeaveLookupResultDto> CheckApprovedLeaveAsync(
        Guid employeeId,
        DateTimeOffset checkTimeUtc,
        CancellationToken cancellationToken = default);
}

