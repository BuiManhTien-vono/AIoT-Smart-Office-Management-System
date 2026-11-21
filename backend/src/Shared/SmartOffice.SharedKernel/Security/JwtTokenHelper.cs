using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace SmartOffice.SharedKernel.Security;

/// <summary>
/// Thông tin người dùng thực hiện thao tác nghiệp vụ, trích xuất từ JWT đã được xác thực.
/// </summary>
public sealed record ActorContext(
    Guid UserId,
    string Username,
    string FullName,
    string Role,
    Guid? DepartmentId);

/// <summary>
/// Helper ký và xác thực JWT (HS256) dùng chung giữa Module Reporting (cấp token)
/// và WebApi Middleware (xác thực token), giữ nguyên cô lập giữa các Module.
/// </summary>
public static class JwtTokenHelper
{
    public const string DefaultSigningKey = "SmartOffice_ModularMonolith_JwtSigningKey_2026_Secure!";
    public const int DefaultExpirySeconds = 3600 * 8; // 8 giờ

    public static string GenerateToken(
        Guid userId,
        string username,
        string fullName,
        string role,
        Guid? departmentId,
        string? signingKey = null,
        int expirySeconds = DefaultExpirySeconds)
    {
        var key = string.IsNullOrWhiteSpace(signingKey) ? DefaultSigningKey : signingKey;
        var headerJson = JsonSerializer.Serialize(new { alg = "HS256", typ = "JWT" });
        var nowUnix = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var payloadJson = JsonSerializer.Serialize(new
        {
            sub = userId.ToString(),
            unique_name = username,
            full_name = fullName,
            role,
            department_id = departmentId?.ToString(),
            iat = nowUnix,
            exp = nowUnix + expirySeconds
        });

        var headerB64 = Base64UrlEncode(Encoding.UTF8.GetBytes(headerJson));
        var payloadB64 = Base64UrlEncode(Encoding.UTF8.GetBytes(payloadJson));
        var unsignedToken = $"{headerB64}.{payloadB64}";
        var sigBytes = HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(key),
            Encoding.UTF8.GetBytes(unsignedToken));
        var sigB64 = Base64UrlEncode(sigBytes);

        return $"{unsignedToken}.{sigB64}";
    }

    public static bool TryValidateToken(
        string token,
        out ClaimsPrincipal? principal,
        out ActorContext? actor,
        out string? errorCode,
        string? signingKey = null)
    {
        principal = null;
        actor = null;
        errorCode = null;

        if (string.IsNullOrWhiteSpace(token))
        {
            errorCode = "TOKEN_MISSING";
            return false;
        }

        var parts = token.Split('.');
        if (parts.Length != 3)
        {
            errorCode = "TOKEN_MALFORMED";
            return false;
        }

        var key = string.IsNullOrWhiteSpace(signingKey) ? DefaultSigningKey : signingKey;
        var unsignedToken = $"{parts[0]}.{parts[1]}";

        byte[] actualSig;
        try
        {
            actualSig = Base64UrlDecode(parts[2]);
        }
        catch
        {
            errorCode = "TOKEN_MALFORMED";
            return false;
        }

        var expectedSig = HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(key),
            Encoding.UTF8.GetBytes(unsignedToken));

        if (!CryptographicOperations.FixedTimeEquals(actualSig, expectedSig))
        {
            errorCode = "TOKEN_INVALID_SIGNATURE";
            return false;
        }

        try
        {
            var payloadBytes = Base64UrlDecode(parts[1]);
            using var doc = JsonDocument.Parse(payloadBytes);
            var root = doc.RootElement;

            if (root.TryGetProperty("exp", out var expEl) && expEl.TryGetInt64(out var expUnix))
            {
                var nowUnix = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                if (nowUnix >= expUnix)
                {
                    errorCode = "TOKEN_EXPIRED";
                    return false;
                }
            }

            var subStr = root.TryGetProperty("sub", out var subEl) ? subEl.GetString() : null;
            if (!Guid.TryParse(subStr, out var userId))
            {
                errorCode = "TOKEN_INVALID_CLAIMS";
                return false;
            }

            var username = root.TryGetProperty("unique_name", out var uEl) ? (uEl.GetString() ?? string.Empty) : string.Empty;
            var fullName = root.TryGetProperty("full_name", out var fnEl) ? (fnEl.GetString() ?? username) : username;
            var role = root.TryGetProperty("role", out var rEl) ? (rEl.GetString() ?? string.Empty).Trim().ToUpperInvariant() : string.Empty;

            Guid? departmentId = null;
            if (root.TryGetProperty("department_id", out var dEl) && dEl.ValueKind == JsonValueKind.String)
            {
                if (Guid.TryParse(dEl.GetString(), out var parsedDept))
                {
                    departmentId = parsedDept;
                }
            }

            if (string.IsNullOrWhiteSpace(role))
            {
                errorCode = "TOKEN_INVALID_CLAIMS";
                return false;
            }

            var claims = new List<Claim>
            {
                new(ClaimTypes.NameIdentifier, userId.ToString()),
                new("sub", userId.ToString()),
                new(ClaimTypes.Name, username),
                new("unique_name", username),
                new("full_name", fullName),
                new(ClaimTypes.Role, role),
                new("role", role)
            };

            if (departmentId.HasValue)
            {
                claims.Add(new Claim("department_id", departmentId.Value.ToString()));
            }

            var identity = new ClaimsIdentity(claims, "SmartOfficeJwt");
            principal = new ClaimsPrincipal(identity);
            actor = new ActorContext(userId, username, fullName, role, departmentId);
            return true;
        }
        catch
        {
            errorCode = "TOKEN_MALFORMED";
            return false;
        }
    }

    public static ActorContext? ExtractActor(ClaimsPrincipal? principal)
    {
        if (principal?.Identity?.IsAuthenticated != true)
        {
            return null;
        }

        var subStr = principal.FindFirst("sub")?.Value
                     ?? principal.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!Guid.TryParse(subStr, out var userId))
        {
            return null;
        }

        var username = principal.FindFirst("unique_name")?.Value
                       ?? principal.FindFirst(ClaimTypes.Name)?.Value
                       ?? string.Empty;
        var fullName = principal.FindFirst("full_name")?.Value ?? username;
        var role = (principal.FindFirst("role")?.Value
                    ?? principal.FindFirst(ClaimTypes.Role)?.Value
                    ?? string.Empty).Trim().ToUpperInvariant();

        Guid? departmentId = null;
        var deptStr = principal.FindFirst("department_id")?.Value;
        if (Guid.TryParse(deptStr, out var parsedDept))
        {
            departmentId = parsedDept;
        }

        if (string.IsNullOrWhiteSpace(role))
        {
            return null;
        }

        return new ActorContext(userId, username, fullName, role, departmentId);
    }

    private static string Base64UrlEncode(byte[] input)
    {
        return Convert.ToBase64String(input)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    private static byte[] Base64UrlDecode(string input)
    {
        var output = input.Replace('-', '+').Replace('_', '/');
        switch (output.Length % 4)
        {
            case 2: output += "=="; break;
            case 3: output += "="; break;
        }
        return Convert.FromBase64String(output);
    }
}

