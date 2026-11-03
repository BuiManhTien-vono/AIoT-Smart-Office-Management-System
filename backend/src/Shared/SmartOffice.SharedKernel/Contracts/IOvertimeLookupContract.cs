namespace SmartOffice.SharedKernel.Contracts;

/// <summary>
/// Kết quả kiểm tra đăng ký làm thêm giờ (Overtime) hợp lệ của nhân viên tại một thời điểm.
/// </summary>
public sealed record OvertimeLookupResultDto(
    bool HasApprovedOvertime,
    Guid? OtRegistrationId,
    Guid EmployeeId,
    string EmployeeCode,
    DateOnly? OtDate,
    TimeOnly? StartTime,
    TimeOnly? EndTime);

/// <summary>
/// Hợp đồng tra cứu lịch đăng ký làm thêm giờ (OT) đặt tại SharedKernel,
/// phục vụ cây quyết định an ninh ngoài giờ (FR-SEC-02 / US-SEC-01).
/// </summary>
public interface IOvertimeLookupContract
{
    Task<OvertimeLookupResultDto> CheckApprovedOvertimeAsync(
        Guid employeeId,
        DateTimeOffset checkTimeUtc,
        CancellationToken cancellationToken = default);
}

