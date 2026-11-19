using System.Net;
using System.Net.Mail;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using SmartOffice.SharedKernel.Contracts;

namespace SmartOffice.Infrastructure.Notifications;

/// <summary>
/// Gửi cảnh báo bàn làm việc & an ninh tự động qua Gmail (SMTP) tới địa chỉ Email cá nhân của nhân viên.
/// Lỗi mạng / thiếu cấu hình SMTP không làm gián đoạn luồng nghiệp vụ: chỉ ghi log và trả về false.
/// </summary>
public sealed class GmailEmployeeNotifier(
    IEmployeeLookupContract employeeLookup,
    IConfiguration? configuration = null,
    ILogger<GmailEmployeeNotifier>? logger = null) : IEmployeeTelegramNotifier
{
    public async Task<bool> SendToEmployeeAsync(Guid? employeeId, string message, CancellationToken cancellationToken = default)
    {
        if (!employeeId.HasValue || string.IsNullOrWhiteSpace(message) || configuration is null)
        {
            return false;
        }

        string? recipientEmail;
        EmployeeContractDto? employeeInfo = null;
        try
        {
            recipientEmail = await employeeLookup.GetEmailAsync(employeeId.Value, CancellationToken.None);
            employeeInfo = await employeeLookup.GetByIdAsync(employeeId.Value, CancellationToken.None);
        }
        catch (Exception ex)
        {
            logger?.LogWarning(ex, "[GMAIL] Không tra cứu được Email của nhân viên {EmployeeId}.", employeeId);
            return false;
        }

        if (string.IsNullOrWhiteSpace(recipientEmail))
        {
            logger?.LogInformation("[GMAIL] Bỏ qua: nhân viên {EmployeeId} chưa cập nhật địa chỉ Email trong hồ sơ.", employeeId);
            return false;
        }

        var smtpHost = configuration["Email:SmtpHost"];
        if (string.IsNullOrWhiteSpace(smtpHost))
        {
            smtpHost = "smtp.gmail.com";
        }

        if (!int.TryParse(configuration["Email:SmtpPort"], out var smtpPort) || smtpPort <= 0)
        {
            smtpPort = 587;
        }

        var senderEmail = configuration["Email:SenderEmail"]?.Trim();
        var rawAppPassword = configuration["Email:AppPassword"];
        var appPassword = rawAppPassword?.Replace(" ", "").Trim();
        var senderName = configuration["Email:SenderName"]?.Trim();
        if (string.IsNullOrWhiteSpace(senderName))
        {
            senderName = "Smart Office AIoT";
        }

        if (string.IsNullOrWhiteSpace(senderEmail) || string.IsNullOrWhiteSpace(appPassword))
        {
            logger?.LogInformation(
                "[GMAIL] Chưa cấu hình Email:SenderEmail hoặc Email:AppPassword, bỏ qua gửi email tới {Email} (Nhân viên {EmployeeId}).",
                recipientEmail,
                employeeId);
            return false;
        }

        var targetEmail = recipientEmail.Trim();
        var targetEmpId = employeeId.Value;
        var vnTime = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(7)).ToString("HH:mm:ss dd/MM/yyyy");
        var empDisplay = employeeInfo is not null
            ? $"{WebUtility.HtmlEncode(employeeInfo.FullName)} ({WebUtility.HtmlEncode(employeeInfo.EmployeeCode)})"
            : WebUtility.HtmlEncode(targetEmail);
        var encodedMessage = WebUtility.HtmlEncode(message.Trim());

        var htmlBody = $"""
            <div style="font-family: 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background-color: #ffffff;">
              <div style="background-color: #0f172a; color: #ffffff; padding: 18px 24px;">
                <h2 style="margin: 0; font-size: 18px; font-weight: 600;">Smart Office AIoT · Cảnh báo Bàn làm việc</h2>
                <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;">Hệ thống Giám sát Không gian & An ninh Tự động</p>
              </div>
              <div style="padding: 24px; color: #1e293b; line-height: 1.6;">
                <p style="margin: 0 0 12px 0; font-size: 14px;">Xin chào <strong>{empDisplay}</strong>,</p>
                <div style="background-color: #fff7ed; border-left: 4px solid #ea580c; padding: 14px 16px; border-radius: 6px; margin: 16px 0; font-size: 15px; color: #9a3412;">
                  {encodedMessage}
                </div>
                <p style="margin: 16px 0 0 0; font-size: 13px; color: #64748b;">
                  <strong>Thời điểm ghi nhận:</strong> {vnTime} (GMT+7)
                </p>
              </div>
              <div style="background-color: #f8fafc; padding: 14px 24px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center;">
                Email này được gửi tự động từ hệ thống Smart Office AIoT. Vui lòng kiểm tra vị trí làm việc của bạn.
              </div>
            </div>
            """;

        // Gửi SMTP bất đồng bộ trên luồng nền độc lập (không bị hủy bởi HttpContext.RequestAborted khi có nhiều bàn cảnh báo cùng lúc)
        _ = Task.Run(async () =>
        {
            try
            {
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));
                using var mailMessage = new MailMessage
                {
                    From = new MailAddress(senderEmail, senderName, Encoding.UTF8),
                    Subject = "[Smart Office AIoT] Cảnh báo vị trí & an ninh bàn làm việc",
                    SubjectEncoding = Encoding.UTF8,
                    Body = htmlBody,
                    BodyEncoding = Encoding.UTF8,
                    IsBodyHtml = true
                };
                mailMessage.To.Add(new MailAddress(targetEmail));

                using var smtpClient = new SmtpClient(smtpHost, smtpPort)
                {
                    EnableSsl = true,
                    UseDefaultCredentials = false,
                    Credentials = new NetworkCredential(senderEmail, appPassword),
                    DeliveryMethod = SmtpDeliveryMethod.Network
                };

                await smtpClient.SendMailAsync(mailMessage, cts.Token);
                logger?.LogInformation("[GMAIL] Đã gửi cảnh báo thành công tới {Email} (Nhân viên {EmployeeId}).", targetEmail, targetEmpId);
            }
            catch (Exception ex)
            {
                logger?.LogWarning("[GMAIL] Lỗi khi gửi email cảnh báo tới {Email} (Nhân viên {EmployeeId}): {Error}", targetEmail, targetEmpId, ex.Message);
            }
        });

        return true;
    }
}
