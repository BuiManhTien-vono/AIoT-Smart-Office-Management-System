namespace SmartOffice.SharedKernel.Contracts;

/// <summary>
/// Gửi cảnh báo bàn làm việc qua Telegram RIÊNG cho một nhân viên (theo Chat ID cá nhân).
/// Không gửi vào nhóm chung, không gửi cho người khác. Không dùng cho nghiệp vụ chấm công.
/// </summary>
public interface IEmployeeTelegramNotifier
{
    /// <returns>true nếu Telegram đã nhận tin; false nếu không có người nhận, chưa liên kết Chat ID, chưa cấu hình bot hoặc gửi lỗi.</returns>
    Task<bool> SendToEmployeeAsync(Guid? employeeId, string message, CancellationToken cancellationToken = default);
}
