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
    DateTimeOffset CreatedAt,
    string? AvatarPresignedUrl = null);

public sealed record RegisterBiometricVectorRequest(
    float[] EmbeddingVector,
    string? SampleImageKey = null,
    float QualityScore = 120.0f,
    string PoseLabel = "FRONTAL");

public sealed record BiometricVectorResponse(
    Guid Id,
    Guid EmployeeId,
    string SampleImageKey,
    float QualityScore,
    string PoseLabel,
    int VectorDimension,
    DateTimeOffset CreatedAt,
    string? SampleImagePresignedUrl = null);

public sealed record BiometricMediaUploadResponse(
    Guid EmployeeId,
    string EmployeeCode,
    string ObjectKey,
    string PresignedViewUrl,
    string PresignedUploadUrl,
    int ExpiryMinutes);

public sealed record IdentifyFaceRequest(
    float[]? QueryVector = null,
    float[]? Embedding = null,
    float? Threshold = null)
{
    public float[] EffectiveVector => QueryVector ?? Embedding ?? [];
}

public sealed record IdentifyFaceResponse(
    bool IsMatched,
    Guid? EmployeeId,
    string? EmployeeCode,
    string? FullName,
    float MaxSimilarity,
    string Label)
{
    public float Similarity => MaxSimilarity;
}
