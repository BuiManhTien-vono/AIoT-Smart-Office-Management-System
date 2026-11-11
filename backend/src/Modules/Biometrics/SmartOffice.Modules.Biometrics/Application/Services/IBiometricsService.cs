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
    Task<Result<EmployeeResponse>> UpdateEmployeeAsync(Guid id, UpdateEmployeeRequest request, CancellationToken ct = default);
    Task<Result> DeactivateEmployeeAsync(Guid id, CancellationToken ct = default);
    Task<Result> ReactivateEmployeeAsync(Guid id, CancellationToken ct = default);
    Task<Result> DeleteEmployeePermanentlyAsync(Guid id, CancellationToken ct = default);

    Task<Result<BiometricMediaUploadResponse>> UploadEmployeeAvatarAsync(
        Guid employeeId,
        Stream fileStream,
        string contentType,
        CancellationToken ct = default);

    Task<Result<BiometricMediaUploadResponse>> UploadBiometricSampleImageAsync(
        Guid employeeId,
        string poseLabel,
        Stream fileStream,
        string contentType,
        CancellationToken ct = default);

    Task<Result<BiometricMediaUploadResponse>> GetBiometricPresignedUploadUrlAsync(
        Guid employeeId,
        string poseLabel = "FRONTAL",
        string contentType = "image/jpeg",
        CancellationToken ct = default);

    Task<Result<BiometricVectorResponse>> RegisterBiometricSampleAsync(Guid employeeId, RegisterBiometricVectorRequest request, CancellationToken ct = default);
    Task<Result<IdentifyFaceResponse>> IdentifyByVectorAsync(IdentifyFaceRequest request, CancellationToken ct = default);
}
