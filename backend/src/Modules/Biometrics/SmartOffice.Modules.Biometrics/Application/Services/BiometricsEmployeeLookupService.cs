using Microsoft.EntityFrameworkCore;
using SmartOffice.Modules.Biometrics.Infrastructure;
using SmartOffice.SharedKernel.Contracts;

namespace SmartOffice.Modules.Biometrics.Application.Services;

/// <summary>
/// PHƯƠNG THỨC GIAO TIẾP 2 (Thực thi Contract Interface):
/// Module Biometrics viết phần ruột cho IEmployeeLookupContract (đặt tại SharedKernel)
/// để các Module khác như Attendance hỏi thông tin nhân viên mà không vi phạm cô lập Module.
/// </summary>
public sealed class BiometricsEmployeeLookupService(BiometricsDbContext dbContext) : IEmployeeLookupContract
{
    public async Task<EmployeeContractDto?> GetByIdAsync(Guid employeeId, CancellationToken cancellationToken = default)
    {
        return await dbContext.Employees
            .Where(e => e.Id == employeeId)
            .Select(e => new EmployeeContractDto(
                e.Id,
                e.EmployeeCode,
                e.FullName,
                e.DepartmentId,
                e.DefaultShiftId,
                e.IsActive))
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<EmployeeContractDto?> GetByCodeAsync(string employeeCode, CancellationToken cancellationToken = default)
    {
        var normalized = employeeCode.Trim().ToUpperInvariant();
        return await dbContext.Employees
            .Where(e => e.EmployeeCode == normalized)
            .Select(e => new EmployeeContractDto(
                e.Id,
                e.EmployeeCode,
                e.FullName,
                e.DepartmentId,
                e.DefaultShiftId,
                e.IsActive))
            .FirstOrDefaultAsync(cancellationToken);
    }
}
