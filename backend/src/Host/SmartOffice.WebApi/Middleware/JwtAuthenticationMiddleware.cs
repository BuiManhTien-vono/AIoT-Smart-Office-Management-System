using SmartOffice.SharedKernel.Security;

namespace SmartOffice.WebApi.Middleware;

/// <summary>
/// Middleware xác thực Bearer JWT (HS256) và nạp ClaimsPrincipal vào HttpContext.User.
/// Không chặn các endpoint công khai (login, health, AI worker), nhưng các endpoint cần phân quyền
/// (như chỉnh sửa/hủy công & xem audit) sẽ kiểm tra HttpContext.User để trả 401/403 chuẩn xác.
/// </summary>
public sealed class JwtAuthenticationMiddleware(RequestDelegate next, IConfiguration configuration)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var token = ExtractBearerToken(context);
        if (!string.IsNullOrWhiteSpace(token))
        {
            var signingKey = configuration["Jwt:SigningKey"];
            if (JwtTokenHelper.TryValidateToken(token, out var principal, out _, out var errorCode, signingKey)
                && principal is not null)
            {
                context.User = principal;
            }
            else if (!string.IsNullOrWhiteSpace(errorCode))
            {
                context.Items["JwtAuthError"] = errorCode;
            }
        }

        await next(context);
    }

    private static string? ExtractBearerToken(HttpContext context)
    {
        if (context.Request.Headers.TryGetValue("Authorization", out var authHeader))
        {
            var raw = authHeader.ToString().Trim();
            if (raw.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            {
                return raw["Bearer ".Length..].Trim();
            }
        }

        // Hỗ trợ query access_token cho kết nối SignalR WebSocket
        if (context.Request.Path.StartsWithSegments("/hubs", StringComparison.OrdinalIgnoreCase)
            && context.Request.Query.TryGetValue("access_token", out var qsToken))
        {
            return qsToken.ToString().Trim();
        }

        return null;
    }
}

