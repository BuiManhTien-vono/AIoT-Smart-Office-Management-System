namespace SmartOffice.Modules.Security.Application.DTOs;

public sealed record CreateOtRegistrationRequest(
    Guid EmployeeId,
    DateOnly OtDate,
    TimeOnly StartTime,
    TimeOnly EndTime,
    string? Reason = null,
    string ApprovalStatus = "APPROVED",
    Guid? ApprovedByUserId = null);

public sealed record UpdateOtApprovalRequest(
    string ApprovalStatus,
    Guid? ApprovedByUserId = null,
    string? Reason = null);

public sealed record OtRegistrationResponse(
    Guid Id,
    Guid EmployeeId,
    string EmployeeCode,
    string EmployeeFullName,
    DateOnly OtDate,
    TimeOnly StartTime,
    TimeOnly EndTime,
    bool IsOvernight,
    string? Reason,
    string ApprovalStatus,
    Guid? ApprovedByUserId,
    DateTimeOffset CreatedAt);

