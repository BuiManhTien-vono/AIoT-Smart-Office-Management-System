namespace SmartOffice.SharedKernel.Contracts;

/// <summary>
/// Kết quả thẩm định thời gian hiện diện làm việc hợp lệ của nhân viên tại một thời điểm:
/// Hợp lệ nếu thuộc Ca hành chính (+ ân hạn 20 phút) HOẶC Ca làm thêm ngoài giờ (OT) đã được PHÊ DUYỆT (APPROVED).
/// </summary>
public sealed record WorkScheduleValidationResult(
    bool IsAuthorizedToWork,
    bool IsWithinDefaultShift,
    bool IsWithinGracePeriod,
    bool IsWithinApprovedOt,
    string ShiftName,
    TimeOnly? ShiftStart,
    TimeOnly? ShiftEnd,
    Guid? ApprovedOtId,
    TimeOnly? OtStart,
    TimeOnly? OtEnd,
    string SummaryMessage);

/// <summary>
/// Hợp đồng tra cứu lịch làm việc và trạng thái chấm công của nhân viên đa module,
/// phục vụ cây quyết định an ninh & giám sát chỗ ngồi mà không phá vỡ kiến trúc cô lập.
/// </summary>
public interface IWorkScheduleLookupContract
{
    /// <summary>
    /// Kiểm tra xem tại thời điểm presenceTimeUtc, nhân viên có được phép làm việc hay không
    /// (thuộc ca hành chính + gracePeriodMinutes ân hạn HOẶC ca OT đã được APPROVED).
    /// </summary>
    Task<WorkScheduleValidationResult> ValidateEmployeePresenceTimeAsync(
        Guid employeeId,
        DateTimeOffset presenceTimeUtc,
        int gracePeriodMinutes = 20,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Kiểm tra xem nhân viên đã có lượt chấm công (Check-in) hợp lệ trong ngày hay chưa.
    /// </summary>
    Task<bool> HasEmployeeCheckedInTodayAsync(
        Guid employeeId,
        DateOnly workDate,
        CancellationToken cancellationToken = default);
}

