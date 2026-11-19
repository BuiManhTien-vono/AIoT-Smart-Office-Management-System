using System.Net.Http.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using SmartOffice.SharedKernel.Contracts;

namespace SmartOffice.Infrastructure.Notifications;

/// <summary>
/// Gửi tin nhắn Telegram Bot API tới Chat ID cá nhân của nhân viên.
/// Lỗi mạng / thiếu cấu hình không làm hỏng luồng nghiệp vụ: chỉ ghi log và trả về false.
/// </summary>
public sealed class TelegramEmployeeNotifier(
    IEmployeeLookupContract employeeLookup,
    IConfiguration configuration,
    ILogger<TelegramEmployeeNotifier>? logger = null) : IEmployeeTelegramNotifier
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(5) };

    public async Task<bool> SendToEmployeeAsync(Guid? employeeId, string message, CancellationToken cancellationToken = default)
    {
        if (!employeeId.HasValue)
        {
            return false;
        }

        string? chatId;
        try
        {
            chatId = await employeeLookup.GetTelegramChatIdAsync(employeeId.Value, cancellationToken);
        }
        catch (Exception ex)
        {
            logger?.LogWarning(ex, "[TELEGRAM] Không tra được Chat ID của nhân viên {EmployeeId}.", employeeId);
            return false;
        }

        if (string.IsNullOrWhiteSpace(chatId))
        {
            logger?.LogInformation("[TELEGRAM] Bỏ qua: nhân viên {EmployeeId} chưa liên kết Telegram Chat ID.", employeeId);
            return false;
        }

        var botToken = configuration["Telegram:BotToken"];
        if (string.IsNullOrWhiteSpace(botToken))
        {
            logger?.LogInformation("[TELEGRAM] Chưa cấu hình Telegram:BotToken, không gửi tin cho nhân viên {EmployeeId}.", employeeId);
            return false;
        }

        try
        {
            using var response = await Http.PostAsJsonAsync(
                $"https://api.telegram.org/bot{botToken.Trim()}/sendMessage",
                new { chat_id = chatId.Trim(), text = message },
                cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                logger?.LogWarning("[TELEGRAM] Gửi tới nhân viên {EmployeeId} thất bại: HTTP {Status}.", employeeId, (int)response.StatusCode);
                return false;
            }

            return true;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            logger?.LogWarning("[TELEGRAM] Lỗi kết nối khi gửi tới nhân viên {EmployeeId}: {Error}", employeeId, ex.Message);
            return false;
        }
    }
}
