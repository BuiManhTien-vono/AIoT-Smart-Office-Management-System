using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SmartOffice.Modules.Reporting.Application.DTOs;
using SmartOffice.Modules.Reporting.Domain;
using SmartOffice.Modules.Reporting.Infrastructure;
using SmartOffice.SharedKernel.Common;

namespace SmartOffice.Modules.Reporting.Application.Services;

/// <summary>
/// Dịch vụ xử lý nghiệp vụ của Module 5 (Reporting & Admin RBAC):
/// - Quản lý tài khoản vận hành và phân quyền 4 vai trò (ADMIN, HR, DEPT_LEAD, SECURITY - US-REP-01).
/// - Cô lập dữ liệu theo phòng ban đối với vai trò DEPT_LEAD.
/// - Tổng hợp báo cáo chuyên cần, hiện diện chỗ ngồi, sự cố an ninh theo ngày/tháng và kết xuất báo cáo (US-REP-02, FR-ADM-03).
/// </summary>
public sealed class ReportingService(ReportingDbContext dbContext) : IReportingService
{
    public static readonly HashSet<string> AllowedRoles = new(StringComparer.OrdinalIgnoreCase)
    {
        "ADMIN",
        "HR",
        "DEPT_LEAD",
        "SECURITY"
    };

    private const int TokenExpirySeconds = 3600 * 8; // 8 giờ
    private const string JwtSigningKey = "SmartOffice_ModularMonolith_JwtSigningKey_2026_Secure!";

    public async Task<Result<AppUserResponse>> CreateUserAsync(
        CreateAppUserRequest request,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.Username) || request.Username.Trim().Length < 3)
        {
            return Result.Failure<AppUserResponse>(
                new Error("INVALID_USERNAME", "Tên đăng nhập phải có tối thiểu 3 ký tự."));
        }

        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 6)
        {
            return Result.Failure<AppUserResponse>(
                new Error("INVALID_PASSWORD", "Mật khẩu phải có tối thiểu 6 ký tự."));
        }

        var role = string.IsNullOrWhiteSpace(request.Role)
            ? "HR"
            : request.Role.Trim().ToUpperInvariant();

        if (!AllowedRoles.Contains(role))
        {
            return Result.Failure<AppUserResponse>(
                new Error("INVALID_ROLE", $"Vai trò '{role}' không hợp lệ. Chỉ chấp nhận ADMIN, HR, DEPT_LEAD, SECURITY."));
        }

        if (role == "DEPT_LEAD" && !request.DepartmentId.HasValue)
        {
            return Result.Failure<AppUserResponse>(
                new Error("DEPARTMENT_REQUIRED_FOR_LEAD", "Tài khoản Trưởng bộ phận (DEPT_LEAD) bắt buộc phải gắn với một phòng ban (departmentId)."));
        }

        var username = request.Username.Trim().ToLowerInvariant();
        if (await dbContext.Users.AnyAsync(u => u.Username == username, ct))
        {
            return Result.Failure<AppUserResponse>(
                new Error("USERNAME_EXISTS", $"Tên đăng nhập '{username}' đã tồn tại."));
        }

        var user = new AppUser
        {
            Username = username,
            PasswordHash = HashPassword(request.Password),
            FullName = request.FullName.Trim(),
            Role = role,
            DepartmentId = request.DepartmentId,
            IsActive = true
        };

        dbContext.Users.Add(user);
        await dbContext.SaveChangesAsync(ct);

        return Result.Success(MapUser(user));
    }

    public async Task<Result<LoginResponse>> AuthenticateAsync(
        LoginRequest request,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
        {
            return Result.Failure<LoginResponse>(
                new Error("INVALID_CREDENTIALS", "Tên đăng nhập hoặc mật khẩu không được để trống."));
        }

        var username = request.Username.Trim().ToLowerInvariant();
        var user = await dbContext.Users.FirstOrDefaultAsync(u => u.Username == username, ct);

        if (user is null || !user.IsActive || !VerifyPassword(request.Password, user.PasswordHash))
        {
            return Result.Failure<LoginResponse>(
                new Error("INVALID_CREDENTIALS", "Tên đăng nhập hoặc mật khẩu không chính xác."));
        }

        var token = GenerateJwtToken(user);
        return Result.Success(new LoginResponse(
            token,
            "Bearer",
            TokenExpirySeconds,
            MapUser(user)));
    }

    public async Task<IReadOnlyList<AppUserResponse>> GetUsersAsync(
        string? role = null,
        CancellationToken ct = default)
    {
        var query = dbContext.Users.AsQueryable();
        if (!string.IsNullOrWhiteSpace(role))
        {
            var normalizedRole = role.Trim().ToUpperInvariant();
            query = query.Where(u => u.Role == normalizedRole);
        }

        var users = await query.OrderBy(u => u.Username).ToListAsync(ct);
        return users.Select(MapUser).ToList();
    }

    public async Task<IReadOnlyList<DailyDepartmentSummaryDto>> GetDailySummariesAsync(
        DateOnly? date = null,
        Guid? departmentId = null,
        CancellationToken ct = default)
    {
        var targetDate = date ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var query = dbContext.DailyDepartmentSummaries.Where(x => x.SummaryDate == targetDate);

        if (departmentId.HasValue)
        {
            query = query.Where(x => x.DepartmentId == departmentId.Value);
        }

        var items = await query.OrderBy(x => x.DepartmentCode).ToListAsync(ct);
        return items.Select(MapSummary).ToList();
    }

    public async Task<MonthlyDepartmentReportDto> GetMonthlyReportAsync(
        int year,
        int month,
        Guid? departmentId = null,
        CancellationToken ct = default)
    {
        var clampedMonth = Math.Clamp(month, 1, 12);
        var startDate = new DateOnly(year, clampedMonth, 1);
        var endDate = startDate.AddMonths(1).AddDays(-1);

        var query = dbContext.DailyDepartmentSummaries
            .Where(x => x.SummaryDate >= startDate && x.SummaryDate <= endDate);

        if (departmentId.HasValue)
        {
            query = query.Where(x => x.DepartmentId == departmentId.Value);
        }

        var items = await query
            .OrderBy(x => x.SummaryDate)
            .ThenBy(x => x.DepartmentCode)
            .ToListAsync(ct);

        var dtos = items.Select(MapSummary).ToList();

        return new MonthlyDepartmentReportDto(
            year,
            clampedMonth,
            departmentId,
            TotalDaysRecorded: dtos.Select(x => x.SummaryDate).Distinct().Count(),
            TotalPresentManDays: dtos.Sum(x => x.PresentCount),
            TotalLateEvents: dtos.Sum(x => x.LateCount),
            TotalAbsentManDays: dtos.Sum(x => x.AbsentCount),
            TotalProlongedAwayEvents: dtos.Sum(x => x.ProlongedAwayEvents),
            TotalSecurityAlerts: dtos.Sum(x => x.SecurityAlertsCount),
            DailyBreakdown: dtos);
    }

    public async Task<byte[]> ExportMonthlyReportCsvAsync(
        int year,
        int month,
        Guid? departmentId = null,
        CancellationToken ct = default)
    {
        var report = await GetMonthlyReportAsync(year, month, departmentId, ct);

        var sb = new StringBuilder();
        sb.AppendLine("SummaryDate,DepartmentCode,TotalEmployees,PresentCount,LateCount,AbsentCount,ProlongedAwayEvents,SecurityAlertsCount,AttendanceRatePercent");

        foreach (var row in report.DailyBreakdown)
        {
            sb.AppendLine(
                $"{row.SummaryDate:yyyy-MM-dd},{row.DepartmentCode},{row.TotalEmployees},{row.PresentCount},{row.LateCount},{row.AbsentCount},{row.ProlongedAwayEvents},{row.SecurityAlertsCount},{row.AttendanceRatePercent:F1}");
        }

        var preamble = Encoding.UTF8.GetPreamble();
        var body = Encoding.UTF8.GetBytes(sb.ToString());
        var result = new byte[preamble.Length + body.Length];
        Buffer.BlockCopy(preamble, 0, result, 0, preamble.Length);
        Buffer.BlockCopy(body, 0, result, preamble.Length, body.Length);
        return result;
    }

    public static string HashPassword(string password)
    {
        byte[] salt = RandomNumberGenerator.GetBytes(16);
        byte[] hash = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password),
            salt,
            iterations: 100_000,
            HashAlgorithmName.SHA256,
            outputLength: 32);

        return $"$PBKDF2-SHA256$100000${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
    }

    public static bool VerifyPassword(string password, string storedHash)
    {
        var parts = storedHash.Split('$', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length != 4 || parts[0] != "PBKDF2-SHA256")
        {
            return false;
        }

        if (!int.TryParse(parts[1], out int iterations))
        {
            return false;
        }

        byte[] salt = Convert.FromBase64String(parts[2]);
        byte[] expectedHash = Convert.FromBase64String(parts[3]);
        byte[] actualHash = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password),
            salt,
            iterations,
            HashAlgorithmName.SHA256,
            expectedHash.Length);

        return CryptographicOperations.FixedTimeEquals(actualHash, expectedHash);
    }

    private static string GenerateJwtToken(AppUser user)
    {
        var headerJson = JsonSerializer.Serialize(new { alg = "HS256", typ = "JWT" });
        var nowUnix = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var payloadJson = JsonSerializer.Serialize(new
        {
            sub = user.Id.ToString(),
            unique_name = user.Username,
            full_name = user.FullName,
            role = user.Role,
            department_id = user.DepartmentId?.ToString(),
            iat = nowUnix,
            exp = nowUnix + TokenExpirySeconds
        });

        var headerB64 = Base64UrlEncode(Encoding.UTF8.GetBytes(headerJson));
        var payloadB64 = Base64UrlEncode(Encoding.UTF8.GetBytes(payloadJson));
        var unsignedToken = $"{headerB64}.{payloadB64}";
        var sigBytes = HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(JwtSigningKey),
            Encoding.UTF8.GetBytes(unsignedToken));
        var sigB64 = Base64UrlEncode(sigBytes);

        return $"{unsignedToken}.{sigB64}";
    }

    private static string Base64UrlEncode(byte[] input)
    {
        return Convert.ToBase64String(input)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    private static AppUserResponse MapUser(AppUser user)
    {
        return new AppUserResponse(
            user.Id,
            user.Username,
            user.FullName,
            user.Role,
            user.DepartmentId,
            user.IsActive,
            user.CreatedAt);
    }

    private static DailyDepartmentSummaryDto MapSummary(DailyDepartmentSummary s)
    {
        double rate = s.TotalEmployees > 0
            ? Math.Round((double)s.PresentCount * 100.0 / s.TotalEmployees, 1)
            : 0.0;

        return new DailyDepartmentSummaryDto(
            s.Id,
            s.SummaryDate,
            s.DepartmentId,
            s.DepartmentCode,
            s.TotalEmployees,
            s.PresentCount,
            s.LateCount,
            s.AbsentCount,
            s.ProlongedAwayEvents,
            s.SecurityAlertsCount,
            rate,
            s.UpdatedAt ?? DateTimeOffset.UtcNow);
    }
}

