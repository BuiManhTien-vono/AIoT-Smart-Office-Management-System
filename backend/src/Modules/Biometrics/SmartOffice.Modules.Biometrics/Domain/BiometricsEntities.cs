using SmartOffice.SharedKernel.Domain;

namespace SmartOffice.Modules.Biometrics.Domain;

public sealed class Department : BaseEntity
{
    public string DepartmentCode { get; set; } = string.Empty;
    public string DepartmentName { get; set; } = string.Empty;
    public string? Description { get; set; }
}

public sealed class Employee : BaseEntity
{
    public string EmployeeCode { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string? PhoneNumber { get; set; }
    public Guid DepartmentId { get; set; }
    public Guid? DefaultShiftId { get; set; }
    public string? AvatarObjectKey { get; set; }
    public bool IsActive { get; set; } = true;

    public List<BiometricVector> BiometricVectors { get; set; } = [];
}

public sealed class BiometricVector : BaseEntity
{
    public Guid EmployeeId { get; set; }
    public float[] EmbeddingVector { get; set; } = [];
    public string SampleImageKey { get; set; } = string.Empty;
    public float QualityScore { get; set; }
    public string PoseLabel { get; set; } = "FRONTAL";
}

