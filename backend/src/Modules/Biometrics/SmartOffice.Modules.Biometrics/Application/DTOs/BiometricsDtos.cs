namespace SmartOffice.Modules.Biometrics.Application.DTOs;

public sealed record CreateDepartmentRequest(
    string DepartmentCode,
    string DepartmentName,
    string? Description);

public sealed record DepartmentResponse(
    Guid Id,
    string DepartmentCode,
    string DepartmentName,
    string? Description,
    DateTimeOffset CreatedAt);

public sealed record CreateEmployeeRequest(
    string EmployeeCode,
    string FullName,
    string? Email,
    string? PhoneNumber,
    Guid DepartmentId,
    Guid? DefaultShiftId,
    string? AvatarObjectKey);

public sealed record EmployeeResponse(
    Guid Id,
    string EmployeeCode,
    string FullName,
    string? Email,
    string? PhoneNumber,
    Guid DepartmentId,
    string DepartmentCode,
    Guid? DefaultShiftId,
    string? AvatarObjectKey,
    bool IsActive,
    int RegisteredVectorCount,
    DateTimeOffset CreatedAt);

public sealed record RegisterBiometricVectorRequest(
    float[] EmbeddingVector,
    string SampleImageKey,
    float QualityScore = 120.0f,
    string PoseLabel = "FRONTAL");

public sealed record BiometricVectorResponse(
    Guid Id,
    Guid EmployeeId,
    string SampleImageKey,
    float QualityScore,
    string PoseLabel,
    int VectorDimension,
    DateTimeOffset CreatedAt);

public sealed record IdentifyFaceRequest(float[] QueryVector);

public sealed record IdentifyFaceResponse(
    bool IsMatched,
    Guid? EmployeeId,
    string? EmployeeCode,
    string? FullName,
    float MaxSimilarity,
    string Label);
