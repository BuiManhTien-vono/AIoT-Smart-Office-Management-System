using SmartOffice.SharedKernel.Domain;

namespace SmartOffice.Modules.Reporting.Domain;

public sealed class AppUser : BaseEntity
{
    public string Username { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Role { get; set; } = "HR";
    public Guid? DepartmentId { get; set; }
    public bool IsActive { get; set; } = true;
}

public sealed class DailyDepartmentSummary : BaseEntity
{
    public DateOnly SummaryDate { get; set; }
    public Guid DepartmentId { get; set; }
    public string DepartmentCode { get; set; } = string.Empty;
    public int TotalEmployees { get; set; }
    public int PresentCount { get; set; }
    public int LateCount { get; set; }
    public int AbsentCount { get; set; }
    public int ProlongedAwayEvents { get; set; }
    public int SecurityAlertsCount { get; set; }
}

