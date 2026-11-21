using Microsoft.EntityFrameworkCore;
using SmartOffice.Modules.Biometrics.Infrastructure;
using SmartOffice.SharedKernel.Contracts;

namespace SmartOffice.Modules.Biometrics.Application.Services;

/// <summary>
/// PHƯƠNG THỨC GIAO TIẾP 2 (Thực thi Contract Interface):
/// Module Biometrics viết phần ruột cho IEmployeeLookupContract (đặt tại SharedKernel)
/// để các Module khác như Attendance, Occupancy, Security hỏi thông tin nhân viên mà không vi phạm cô lập Module.
/// </summary>
public sealed class BiometricsEmployeeLookupService(BiometricsDbContext dbContext) : IEmployeeLookupContract
{
    public async Task<EmployeeContractDto?> GetByIdAsync(Guid employeeId, CancellationToken cancellationToken = default)
    {
        return await (
            from e in dbContext.Employees
            join d in dbContext.Departments on e.DepartmentId equals d.Id into deptJoin
            from dept in deptJoin.DefaultIfEmpty()
            where e.Id == employeeId
            select new EmployeeContractDto(
                e.Id,
                e.EmployeeCode,
                e.FullName,
                e.DepartmentId,
                e.DefaultShiftId,
                e.IsActive,
                dept != null ? dept.DepartmentCode : "DEPT")
        ).FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<EmployeeContractDto?> GetByCodeAsync(string employeeCode, CancellationToken cancellationToken = default)
    {
        var normalized = employeeCode.Trim().ToUpperInvariant();
        return await (
            from e in dbContext.Employees
            join d in dbContext.Departments on e.DepartmentId equals d.Id into deptJoin
            from dept in deptJoin.DefaultIfEmpty()
            where e.EmployeeCode == normalized
            select new EmployeeContractDto(
                e.Id,
                e.EmployeeCode,
                e.FullName,
                e.DepartmentId,
                e.DefaultShiftId,
                e.IsActive,
                dept != null ? dept.DepartmentCode : "DEPT")
        ).FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<EmployeeContractDto>> GetAllActiveAsync(CancellationToken cancellationToken = default)
    {
        return await (
            from e in dbContext.Employees
            join d in dbContext.Departments on e.DepartmentId equals d.Id into deptJoin
            from dept in deptJoin.DefaultIfEmpty()
            where e.IsActive
            orderby e.EmployeeCode
            select new EmployeeContractDto(
                e.Id,
                e.EmployeeCode,
                e.FullName,
                e.DepartmentId,
                e.DefaultShiftId,
                e.IsActive,
                dept != null ? dept.DepartmentCode : "DEPT")
        ).ToListAsync(cancellationToken);
    }

    public async Task<string?> GetTelegramChatIdAsync(Guid employeeId, CancellationToken cancellationToken = default)
    {
        return await dbContext.Employees
            .Where(e => e.Id == employeeId && e.IsActive)
            .Select(e => e.TelegramChatId)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<string?> GetEmailAsync(Guid employeeId, CancellationToken cancellationToken = default)
    {
        return await dbContext.Employees
            .Where(e => e.Id == employeeId && e.IsActive)
            .Select(e => e.Email)
            .FirstOrDefaultAsync(cancellationToken);
    }
}
