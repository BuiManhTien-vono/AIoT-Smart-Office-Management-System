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
