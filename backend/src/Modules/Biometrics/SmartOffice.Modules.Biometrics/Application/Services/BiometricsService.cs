using Microsoft.EntityFrameworkCore;
using SmartOffice.Modules.Biometrics.Application.DTOs;
using SmartOffice.Modules.Biometrics.Domain;
using SmartOffice.Modules.Biometrics.Infrastructure;
using SmartOffice.SharedKernel.Common;
using SmartOffice.SharedKernel.Events;
using SmartOffice.SharedKernel.Storage;

namespace SmartOffice.Modules.Biometrics.Application.Services;

/// <summary>
/// Dịch vụ xử lý nghiệp vụ của Module 1 (Biometrics):
/// Quản lý phòng ban, hồ sơ nhân sự, tải ảnh mẫu sinh trắc học lên MinIO/S3 (Presigned URL),
/// kiểm tra chất lượng & trùng lặp khuôn mặt, và phát sự kiện tích hợp qua InMemoryEventBus.
/// </summary>
public sealed class BiometricsService(
    BiometricsDbContext dbContext,
    IObjectStorageService objectStorage,
    IInMemoryEventBus eventBus) : IBiometricsService
{
    public const int DefaultPresignedExpiryMinutes = 15;

    public async Task<Result<DepartmentResponse>> CreateDepartmentAsync(
        CreateDepartmentRequest request,
        CancellationToken ct = default)
    {
        var code = request.DepartmentCode.Trim().ToUpperInvariant();
        var exists = await dbContext.Departments.AnyAsync(d => d.DepartmentCode == code, ct);
        if (exists)
        {
            return Result.Failure<DepartmentResponse>(
                new Error("DEPARTMENT_EXISTS", $"Mã phòng ban '{code}' đã tồn tại trong hệ thống."));
        }

        var department = new Department
        {
            DepartmentCode = code,
            DepartmentName = request.DepartmentName.Trim(),
            Description = request.Description
        };

        dbContext.Departments.Add(department);
        await dbContext.SaveChangesAsync(ct);

        return Result.Success(new DepartmentResponse(
            department.Id,
            department.DepartmentCode,
            department.DepartmentName,
            department.Description,
            department.CreatedAt));
    }

    public async Task<IReadOnlyList<DepartmentResponse>> GetDepartmentsAsync(CancellationToken ct = default)
    {
        return await dbContext.Departments
            .OrderBy(d => d.DepartmentCode)
            .Select(d => new DepartmentResponse(
                d.Id,
                d.DepartmentCode,
                d.DepartmentName,
                d.Description,
                d.CreatedAt))
            .ToListAsync(ct);
    }

    public async Task<Result<EmployeeResponse>> CreateEmployeeAsync(
        CreateEmployeeRequest request,
        CancellationToken ct = default)
    {
        var empCode = request.EmployeeCode.Trim().ToUpperInvariant();

        var department = await dbContext.Departments
            .FirstOrDefaultAsync(d => d.Id == request.DepartmentId, ct);
        if (department is null)
        {
            return Result.Failure<EmployeeResponse>(
                new Error("DEPARTMENT_NOT_FOUND", "Không tìm thấy phòng ban được chọn."));
        }

        var codeExists = await dbContext.Employees
            .AnyAsync(e => e.EmployeeCode == empCode, ct);
        if (codeExists)
        {
            return Result.Failure<EmployeeResponse>(
                new Error("EMPLOYEE_CODE_EXISTS", $"Mã nhân viên '{empCode}' đã tồn tại."));
        }

        var employee = new Employee
        {
            EmployeeCode = empCode,
            FullName = request.FullName.Trim(),
            Email = request.Email?.Trim(),
            PhoneNumber = request.PhoneNumber?.Trim(),
            DepartmentId = request.DepartmentId,
            DefaultShiftId = request.DefaultShiftId,
            AvatarObjectKey = request.AvatarObjectKey,
            IsActive = true
        };

        dbContext.Employees.Add(employee);
        await dbContext.SaveChangesAsync(ct);

        // PHƯƠNG THỨC GIAO TIẾP 1 (In-Memory Event Bus):
        // Phát thông báo "Có nhân viên mới" để các Module khác (như Reporting) tự động cập nhật dữ liệu.
        await eventBus.PublishAsync(new EmployeeRegisteredIntegrationEvent(
            Guid.NewGuid(),
            DateTimeOffset.UtcNow,
            employee.Id,
            employee.EmployeeCode,
            employee.FullName,
            employee.DepartmentId,
            department.DepartmentCode,
            employee.DefaultShiftId), ct);

        return Result.Success(await MapEmployeeResponseAsync(employee, department.DepartmentCode, 0, ct));
    }

    public async Task<IReadOnlyList<EmployeeResponse>> GetEmployeesAsync(
        Guid? departmentId = null,
        CancellationToken ct = default)
    {
        var query = from e in dbContext.Employees.Include(x => x.BiometricVectors)
                    join d in dbContext.Departments on e.DepartmentId equals d.Id
                    select new { Employee = e, DepartmentCode = d.DepartmentCode };

        if (departmentId.HasValue)
        {
            query = query.Where(x => x.Employee.DepartmentId == departmentId.Value);
        }

        var items = await query.OrderBy(x => x.Employee.EmployeeCode).ToListAsync(ct);
        var results = new List<EmployeeResponse>(items.Count);

        foreach (var item in items)
        {
            results.Add(await MapEmployeeResponseAsync(
                item.Employee,
                item.DepartmentCode,
                item.Employee.BiometricVectors.Count,
                ct));
        }

        return results;
    }

    public async Task<Result<EmployeeResponse>> GetEmployeeByIdAsync(Guid id, CancellationToken ct = default)
    {
        var employee = await dbContext.Employees
            .Include(e => e.BiometricVectors)
            .FirstOrDefaultAsync(e => e.Id == id, ct);

        if (employee is null)
        {
            return Result.Failure<EmployeeResponse>(
                new Error("EMPLOYEE_NOT_FOUND", "Không tìm thấy hồ sơ nhân viên."));
        }

        var department = await dbContext.Departments
            .FirstOrDefaultAsync(d => d.Id == employee.DepartmentId, ct);

        return Result.Success(await MapEmployeeResponseAsync(
            employee,
            department?.DepartmentCode ?? string.Empty,
            employee.BiometricVectors.Count,
            ct));
    }

    public async Task<Result<EmployeeResponse>> UpdateEmployeeAsync(
        Guid id,
        UpdateEmployeeRequest request,
        CancellationToken ct = default)
    {
        var employee = await dbContext.Employees
            .Include(e => e.BiometricVectors)
            .FirstOrDefaultAsync(e => e.Id == id, ct);
        if (employee is null)
        {
            return Result.Failure<EmployeeResponse>(
                new Error("EMPLOYEE_NOT_FOUND", "Không tìm thấy hồ sơ nhân viên."));
        }

        var department = await dbContext.Departments
            .FirstOrDefaultAsync(d => d.Id == request.DepartmentId, ct);
        if (department is null)
        {
            return Result.Failure<EmployeeResponse>(
                new Error("DEPARTMENT_NOT_FOUND", "Không tìm thấy phòng ban được chọn."));
        }

        employee.FullName = request.FullName.Trim();
        employee.Email = request.Email?.Trim();
        employee.PhoneNumber = request.PhoneNumber?.Trim();
        employee.DepartmentId = request.DepartmentId;
        employee.DefaultShiftId = request.DefaultShiftId;

        if (request.IsActive.HasValue)
        {
            employee.IsActive = request.IsActive.Value;
        }

        employee.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(ct);

        return Result.Success(await MapEmployeeResponseAsync(
            employee,
            department.DepartmentCode,
            employee.BiometricVectors.Count,
            ct));
    }

    public async Task<Result> DeactivateEmployeeAsync(Guid id, CancellationToken ct = default)
    {
        var employee = await dbContext.Employees.FirstOrDefaultAsync(e => e.Id == id, ct);
        if (employee is null)
        {
            return Result.Failure(new Error("EMPLOYEE_NOT_FOUND", "Không tìm thấy hồ sơ nhân viên."));
        }

        employee.IsActive = false;
        employee.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(ct);
        return Result.Success();
    }

    public async Task<Result> ReactivateEmployeeAsync(Guid id, CancellationToken ct = default)
    {
        var employee = await dbContext.Employees.FirstOrDefaultAsync(e => e.Id == id, ct);
        if (employee is null)
        {
            return Result.Failure(new Error("EMPLOYEE_NOT_FOUND", "Không tìm thấy hồ sơ nhân viên."));
        }

        employee.IsActive = true;
        employee.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(ct);
        return Result.Success();
    }

    public async Task<Result> DeleteEmployeePermanentlyAsync(Guid id, CancellationToken ct = default)
    {
        var employee = await dbContext.Employees
            .Include(e => e.BiometricVectors)
            .FirstOrDefaultAsync(e => e.Id == id, ct);
        if (employee is null)
        {
            return Result.Failure(new Error("EMPLOYEE_NOT_FOUND", "Không tìm thấy hồ sơ nhân viên."));
        }

        if (employee.BiometricVectors.Count > 0)
        {
            dbContext.BiometricVectors.RemoveRange(employee.BiometricVectors);
        }

        dbContext.Employees.Remove(employee);
        await dbContext.SaveChangesAsync(ct);
        return Result.Success();
    }

    public async Task<Result<BiometricMediaUploadResponse>> UploadEmployeeAvatarAsync(
        Guid employeeId,
        Stream fileStream,
        string contentType,
        CancellationToken ct = default)
    {
        var employee = await dbContext.Employees.FirstOrDefaultAsync(e => e.Id == employeeId, ct);
        if (employee is null)
        {
            return Result.Failure<BiometricMediaUploadResponse>(
                new Error("EMPLOYEE_NOT_FOUND", "Không tìm thấy nhân viên để cập nhật ảnh đại diện."));
        }

        var objectKey = $"biometrics/{employee.EmployeeCode.ToLowerInvariant()}/avatar.jpg";
        var savedKey = await objectStorage.UploadFileAsync(objectKey, fileStream, contentType, ct);

        employee.AvatarObjectKey = savedKey;
        await dbContext.SaveChangesAsync(ct);

        var viewUrl = await objectStorage.GetPresignedUrlAsync(savedKey, DefaultPresignedExpiryMinutes, ct);
        var uploadUrl = await objectStorage.GetPresignedUploadUrlAsync(savedKey, contentType, DefaultPresignedExpiryMinutes, ct);

        return Result.Success(new BiometricMediaUploadResponse(
            employee.Id,
            employee.EmployeeCode,
            savedKey,
            viewUrl,
            uploadUrl,
            DefaultPresignedExpiryMinutes));
    }

    public async Task<Result<BiometricMediaUploadResponse>> UploadBiometricSampleImageAsync(
        Guid employeeId,
        string poseLabel,
        Stream fileStream,
        string contentType,
        CancellationToken ct = default)
    {
        var employee = await dbContext.Employees.FirstOrDefaultAsync(e => e.Id == employeeId, ct);
        if (employee is null)
        {
            return Result.Failure<BiometricMediaUploadResponse>(
                new Error("EMPLOYEE_NOT_FOUND", "Không tìm thấy nhân viên để tải ảnh mẫu khuôn mặt."));
        }

        var normalizedPose = string.IsNullOrWhiteSpace(poseLabel)
            ? "frontal"
            : poseLabel.Trim().ToLowerInvariant();

        var objectKey = $"biometrics/{employee.EmployeeCode.ToLowerInvariant()}/samples/{normalizedPose}_{DateTimeOffset.UtcNow:yyyyMMddHHmmss}.jpg";
        var savedKey = await objectStorage.UploadFileAsync(objectKey, fileStream, contentType, ct);

        var viewUrl = await objectStorage.GetPresignedUrlAsync(savedKey, DefaultPresignedExpiryMinutes, ct);
        var uploadUrl = await objectStorage.GetPresignedUploadUrlAsync(savedKey, contentType, DefaultPresignedExpiryMinutes, ct);

        return Result.Success(new BiometricMediaUploadResponse(
            employee.Id,
            employee.EmployeeCode,
            savedKey,
            viewUrl,
            uploadUrl,
            DefaultPresignedExpiryMinutes));
    }

    public async Task<Result<BiometricMediaUploadResponse>> GetBiometricPresignedUploadUrlAsync(
        Guid employeeId,
        string poseLabel = "FRONTAL",
        string contentType = "image/jpeg",
        CancellationToken ct = default)
    {
        var employee = await dbContext.Employees.FirstOrDefaultAsync(e => e.Id == employeeId, ct);
        if (employee is null)
        {
            return Result.Failure<BiometricMediaUploadResponse>(
                new Error("EMPLOYEE_NOT_FOUND", "Không tìm thấy nhân viên để cấp Presigned URL."));
        }

        var normalizedPose = string.IsNullOrWhiteSpace(poseLabel)
            ? "frontal"
            : poseLabel.Trim().ToLowerInvariant();

        var objectKey = $"biometrics/{employee.EmployeeCode.ToLowerInvariant()}/samples/{normalizedPose}_{DateTimeOffset.UtcNow:yyyyMMddHHmmss}.jpg";
        var viewUrl = await objectStorage.GetPresignedUrlAsync(objectKey, DefaultPresignedExpiryMinutes, ct);
        var uploadUrl = await objectStorage.GetPresignedUploadUrlAsync(objectKey, contentType, DefaultPresignedExpiryMinutes, ct);

        return Result.Success(new BiometricMediaUploadResponse(
            employee.Id,
            employee.EmployeeCode,
            objectKey,
            viewUrl,
            uploadUrl,
            DefaultPresignedExpiryMinutes));
    }

    public async Task<Result<BiometricVectorResponse>> RegisterBiometricSampleAsync(
        Guid employeeId,
        RegisterBiometricVectorRequest request,
        CancellationToken ct = default)
    {
        var employee = await dbContext.Employees.FirstOrDefaultAsync(e => e.Id == employeeId, ct);
        if (employee is null)
        {
            return Result.Failure<BiometricVectorResponse>(
                new Error("EMPLOYEE_NOT_FOUND", "Không tìm thấy nhân viên để đăng ký mẫu khuôn mặt."));
        }

        if (request.EmbeddingVector is null || request.EmbeddingVector.Length == 0)
        {
            return Result.Failure<BiometricVectorResponse>(
                new Error("INVALID_VECTOR", "Vector đặc trưng khuôn mặt không được để trống."));
        }

        // Kiểm tra chất lượng ảnh (FR-BIO-03)
        if (request.QualityScore <= BiometricMath.MinQualityScore)
        {
            return Result.Failure<BiometricVectorResponse>(
                new Error("LOW_QUALITY_IMAGE", $"Ảnh bị mờ nhòe (Điểm chất lượng {request.QualityScore:F1} <= {BiometricMath.MinQualityScore}). Vui lòng chụp lại."));
        }

        // Kiểm tra trùng lặp khuôn mặt với các nhân viên khác (FR-BIO-05: Ngưỡng > 0.85)
        var otherVectors = await (from v in dbContext.BiometricVectors
                                  join e in dbContext.Employees on v.EmployeeId equals e.Id
                                  where v.EmployeeId != employeeId && e.IsActive
                                  select new { v.EmbeddingVector, e.EmployeeCode, e.FullName })
                                 .ToListAsync(ct);

        foreach (var other in otherVectors)
        {
            var similarity = BiometricMath.CosineSimilarity(request.EmbeddingVector, other.EmbeddingVector);
            if (similarity > BiometricMath.DuplicateThreshold)
            {
                return Result.Failure<BiometricVectorResponse>(
                    new Error(
                        "DUPLICATE_BIOMETRIC",
                        $"Khuôn mặt này bị trùng với nhân viên '{other.FullName}' (Mã: {other.EmployeeCode}, độ giống: {similarity * 100:F1}%)."));
            }
        }

        var normalizedPose = string.IsNullOrWhiteSpace(request.PoseLabel)
            ? "FRONTAL"
            : request.PoseLabel.Trim().ToUpperInvariant();

        var sampleKey = string.IsNullOrWhiteSpace(request.SampleImageKey)
            ? $"biometrics/{employee.EmployeeCode.ToLowerInvariant()}/samples/{normalizedPose.ToLowerInvariant()}_{DateTimeOffset.UtcNow:yyyyMMddHHmmss}.jpg"
            : request.SampleImageKey.Trim();

        var biometricVector = new BiometricVector
        {
            EmployeeId = employeeId,
            EmbeddingVector = request.EmbeddingVector,
            SampleImageKey = sampleKey,
            QualityScore = request.QualityScore,
            PoseLabel = normalizedPose
        };

        dbContext.BiometricVectors.Add(biometricVector);
        await dbContext.SaveChangesAsync(ct);

        string? samplePresignedUrl = null;
        if (!string.IsNullOrWhiteSpace(biometricVector.SampleImageKey))
        {
            samplePresignedUrl = await objectStorage.GetPresignedUrlAsync(
                biometricVector.SampleImageKey,
                DefaultPresignedExpiryMinutes,
                ct);
        }

        return Result.Success(new BiometricVectorResponse(
            biometricVector.Id,
            biometricVector.EmployeeId,
            biometricVector.SampleImageKey,
            biometricVector.QualityScore,
            biometricVector.PoseLabel,
            biometricVector.EmbeddingVector.Length,
            biometricVector.CreatedAt,
            samplePresignedUrl));
    }

    public async Task<Result<IdentifyFaceResponse>> IdentifyByVectorAsync(
        IdentifyFaceRequest request,
        CancellationToken ct = default)
    {
        var queryVector = request.QueryVector is { Length: > 0 }
            ? request.QueryVector
            : request.Embedding;

        if (queryVector is null || queryVector.Length == 0)
        {
            return Result.Failure<IdentifyFaceResponse>(
                new Error("INVALID_VECTOR", "Vector truy vấn không hợp lệ."));
        }

        var candidates = await (from v in dbContext.BiometricVectors
                                join e in dbContext.Employees on v.EmployeeId equals e.Id
                                where e.IsActive
                                select new { e.Id, e.EmployeeCode, e.FullName, v.EmbeddingVector })
                               .ToListAsync(ct);

        float maxSimilarity = -1.0f;
        Guid? matchedEmpId = null;
        string? matchedCode = null;
        string? matchedName = null;

        foreach (var candidate in candidates)
        {
            var sim = BiometricMath.CosineSimilarity(queryVector, candidate.EmbeddingVector);
            if (sim > maxSimilarity)
            {
                maxSimilarity = sim;
                matchedEmpId = candidate.Id;
                matchedCode = candidate.EmployeeCode;
                matchedName = candidate.FullName;
            }
        }

        var matchThreshold = request.Threshold ?? BiometricMath.MatchThreshold;
        if (maxSimilarity >= matchThreshold && matchedEmpId.HasValue)
        {
            return Result.Success(new IdentifyFaceResponse(
                true,
                matchedEmpId,
                matchedCode,
                matchedName,
                maxSimilarity,
                matchedCode!));
        }

        return Result.Success(new IdentifyFaceResponse(
            false,
            null,
            null,
            null,
            Math.Max(0f, maxSimilarity),
            "UNKNOWN"));
    }

    private async Task<EmployeeResponse> MapEmployeeResponseAsync(
        Employee employee,
        string departmentCode,
        int vectorCount,
        CancellationToken ct)
    {
        string? avatarUrl = null;
        if (!string.IsNullOrWhiteSpace(employee.AvatarObjectKey))
        {
            avatarUrl = await objectStorage.GetPresignedUrlAsync(
                employee.AvatarObjectKey,
                DefaultPresignedExpiryMinutes,
                ct);
        }

        return new EmployeeResponse(
            employee.Id,
            employee.EmployeeCode,
            employee.FullName,
            employee.Email,
            employee.PhoneNumber,
            employee.DepartmentId,
            departmentCode,
            employee.DefaultShiftId,
            employee.AvatarObjectKey,
            employee.IsActive,
            vectorCount,
            employee.CreatedAt,
            avatarUrl);
    }
}
