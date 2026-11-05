namespace SmartOffice.Modules.Reporting.Application.DTOs;

// =============================================================================
// 1. DTOs Quản trị Tài khoản & Phân quyền RBAC (US-REP-01)
// =============================================================================

public sealed record CreateAppUserRequest(
    string Username,
    string Password,
    string FullName,
    string Role = "HR",
    Guid? DepartmentId = null);

public sealed record LoginRequest(
    string Username,
    string Password);

public sealed record AppUserResponse(
    Guid Id,
    string Username,
    string FullName,
    string Role,
    Guid? DepartmentId,
    bool IsActive,
    DateTimeOffset CreatedAt);

public sealed record LoginResponse(
    string AccessToken,
    string TokenType,
    int ExpiresInSeconds,
    AppUserResponse User);

// =============================================================================
// 2. DTOs Báo cáo & Thống kê Tổng hợp (US-REP-02, FR-ADM-03)
// =============================================================================

public sealed record DailyDepartmentSummaryDto(
    Guid Id,
    DateOnly SummaryDate,
    Guid DepartmentId,
    string DepartmentCode,
    int TotalEmployees,
    int PresentCount,
    int LateCount,
    int AbsentCount,
    int ProlongedAwayEvents,
    int SecurityAlertsCount,
    double AttendanceRatePercent,
    DateTimeOffset UpdatedAt);

public sealed record MonthlyDepartmentReportDto(
    int Year,
    int Month,
    Guid? DepartmentId,
    int TotalDaysRecorded,
    int TotalPresentManDays,
    int TotalLateEvents,
    int TotalAbsentManDays,
    int TotalProlongedAwayEvents,
    int TotalSecurityAlerts,
    IReadOnlyList<DailyDepartmentSummaryDto> DailyBreakdown);

