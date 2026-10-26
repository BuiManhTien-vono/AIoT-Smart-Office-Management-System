namespace SmartOffice.SharedKernel.Contracts;

/// <summary>
/// DTO mỏng chứa thông tin nhân viên cơ bản dùng để trao đổi liên Module qua Contract.
/// </summary>
public sealed record EmployeeContractDto(
    Guid EmployeeId,
    string EmployeeCode,
    string FullName,
    Guid DepartmentId,
    Guid? DefaultShiftId,
    bool IsActive);

/// <summary>
/// PHƯƠNG THỨC GIAO TIẾP 2 (Contract Interface):
/// Đặt tại SharedKernel để các Module khác (như Attendance, Occupancy, Security)
/// có thể hỏi thông tin nhân viên từ Module Biometrics mà KHÔNG cần tham chiếu trực tiếp sang Biometrics.
/// </summary>
public interface IEmployeeLookupContract
{
    Task<EmployeeContractDto?> GetByIdAsync(Guid employeeId, CancellationToken cancellationToken = default);
    Task<EmployeeContractDto?> GetByCodeAsync(string employeeCode, CancellationToken cancellationToken = default);
}
