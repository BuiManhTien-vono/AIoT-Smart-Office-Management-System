using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SmartOffice.Modules.Biometrics.Application.DTOs;
using SmartOffice.Modules.Biometrics.Application.Services;

namespace SmartOffice.Modules.Biometrics.Endpoints;

[ApiController]
[Route("api/v1/biometrics")]
public sealed class BiometricsController(IBiometricsService biometricsService) : ControllerBase
{
    [HttpGet("departments")]
    public async Task<IActionResult> GetDepartments(CancellationToken ct)
    {
        var list = await biometricsService.GetDepartmentsAsync(ct);
        return Ok(list);
    }

    [HttpPost("departments")]
    public async Task<IActionResult> CreateDepartment([FromBody] CreateDepartmentRequest request, CancellationToken ct)
    {
        var result = await biometricsService.CreateDepartmentAsync(request, ct);
        if (result.IsFailure)
        {
            return BadRequest(new { code = result.Error.Code, message = result.Error.Message });
        }

        return Created($"/api/v1/biometrics/departments/{result.Value.Id}", result.Value);
    }

    [HttpGet("employees")]
    public async Task<IActionResult> GetEmployees([FromQuery] Guid? departmentId, CancellationToken ct)
    {
        var list = await biometricsService.GetEmployeesAsync(departmentId, ct);
        return Ok(list);
    }

    [HttpGet("employees/{id:guid}")]
    public async Task<IActionResult> GetEmployeeById(Guid id, CancellationToken ct)
    {
        var result = await biometricsService.GetEmployeeByIdAsync(id, ct);
        if (result.IsFailure)
        {
            return NotFound(new { code = result.Error.Code, message = result.Error.Message });
        }

        return Ok(result.Value);
    }

    [HttpPost("employees")]
    public async Task<IActionResult> CreateEmployee([FromBody] CreateEmployeeRequest request, CancellationToken ct)
    {
        var result = await biometricsService.CreateEmployeeAsync(request, ct);
        if (result.IsFailure)
        {
            return BadRequest(new { code = result.Error.Code, message = result.Error.Message });
        }

        return CreatedAtAction(nameof(GetEmployeeById), new { id = result.Value.Id }, result.Value);
    }

    [HttpDelete("employees/{id:guid}")]
    public async Task<IActionResult> DeactivateEmployee(Guid id, CancellationToken ct)
    {
        var result = await biometricsService.DeactivateEmployeeAsync(id, ct);
        if (result.IsFailure)
        {
            return NotFound(new { code = result.Error.Code, message = result.Error.Message });
        }

        return NoContent();
    }

    [HttpPost("employees/{id:guid}/avatar")]
    public async Task<IActionResult> UploadEmployeeAvatar(
        Guid id,
        IFormFile file,
        CancellationToken ct)
    {
        if (file is null || file.Length == 0)
        {
            return BadRequest(new { code = "EMPTY_FILE", message = "Vui lòng chọn tệp ảnh đại diện hợp lệ." });
        }

        await using var stream = file.OpenReadStream();
        var result = await biometricsService.UploadEmployeeAvatarAsync(
            id,
            stream,
            file.ContentType ?? "image/jpeg",
            ct);

        if (result.IsFailure)
        {
            return BadRequest(new { code = result.Error.Code, message = result.Error.Message });
        }

        return Ok(result.Value);
    }

    [HttpPost("employees/{id:guid}/sample-image")]
    public async Task<IActionResult> UploadBiometricSampleImage(
        Guid id,
        IFormFile file,
        [FromQuery] string poseLabel = "FRONTAL",
        CancellationToken ct = default)
    {
        if (file is null || file.Length == 0)
        {
            return BadRequest(new { code = "EMPTY_FILE", message = "Vui lòng chọn tệp ảnh mẫu khuôn mặt hợp lệ." });
        }

        await using var stream = file.OpenReadStream();
        var result = await biometricsService.UploadBiometricSampleImageAsync(
            id,
            poseLabel,
            stream,
            file.ContentType ?? "image/jpeg",
            ct);

        if (result.IsFailure)
        {
            return BadRequest(new { code = result.Error.Code, message = result.Error.Message });
        }

        return Ok(result.Value);
    }

    [HttpGet("employees/{id:guid}/presigned-upload-url")]
    public async Task<IActionResult> GetBiometricPresignedUploadUrl(
        Guid id,
        [FromQuery] string poseLabel = "FRONTAL",
        [FromQuery] string contentType = "image/jpeg",
        CancellationToken ct = default)
    {
        var result = await biometricsService.GetBiometricPresignedUploadUrlAsync(id, poseLabel, contentType, ct);
        if (result.IsFailure)
        {
            return NotFound(new { code = result.Error.Code, message = result.Error.Message });
        }

        return Ok(result.Value);
    }

    [HttpPost("employees/{id:guid}/vectors")]
    public async Task<IActionResult> RegisterBiometricSample(
        Guid id,
        [FromBody] RegisterBiometricVectorRequest request,
        CancellationToken ct)
    {
        var result = await biometricsService.RegisterBiometricSampleAsync(id, request, ct);
        if (result.IsFailure)
        {
            return BadRequest(new { code = result.Error.Code, message = result.Error.Message });
        }

        return Ok(result.Value);
    }

    [HttpPost("identify")]
    public async Task<IActionResult> IdentifyFace([FromBody] IdentifyFaceRequest request, CancellationToken ct)
    {
        var result = await biometricsService.IdentifyByVectorAsync(request, ct);
        if (result.IsFailure)
        {
            return BadRequest(new { code = result.Error.Code, message = result.Error.Message });
        }

        return Ok(result.Value);
    }
}
