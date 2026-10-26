using SmartOffice.Modules.Biometrics.Application.DTOs;
using SmartOffice.SharedKernel.Common;

namespace SmartOffice.Modules.Biometrics.Application.Services;

public interface IBiometricsService
{
    Task<Result<DepartmentResponse>> CreateDepartmentAsync(CreateDepartmentRequest request, CancellationToken ct = default);
    Task<IReadOnlyList<DepartmentResponse>> GetDepartmentsAsync(CancellationToken ct = default);

    Task<Result<EmployeeResponse>> CreateEmployeeAsync(CreateEmployeeRequest request, CancellationToken ct = default);
    Task<IReadOnlyList<EmployeeResponse>> GetEmployeesAsync(Guid? departmentId = null, CancellationToken ct = default);
    Task<Result<EmployeeResponse>> GetEmployeeByIdAsync(Guid id, CancellationToken ct = default);
    Task<Result> DeactivateEmployeeAsync(Guid id, CancellationToken ct = default);

    Task<Result<BiometricVectorResponse>> RegisterBiometricSampleAsync(Guid employeeId, RegisterBiometricVectorRequest request, CancellationToken ct = default);
    Task<Result<IdentifyFaceResponse>> IdentifyByVectorAsync(IdentifyFaceRequest request, CancellationToken ct = default);
}
