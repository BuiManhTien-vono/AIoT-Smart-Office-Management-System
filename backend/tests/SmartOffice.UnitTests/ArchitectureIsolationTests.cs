using SmartOffice.Modules.Attendance.Infrastructure;
using SmartOffice.Modules.Biometrics.Infrastructure;
using SmartOffice.Modules.Occupancy.Infrastructure;
using SmartOffice.Modules.Reporting.Infrastructure;
using SmartOffice.Modules.Security.Infrastructure;

namespace SmartOffice.UnitTests;

public class ArchitectureIsolationTests
{
    [Fact]
    public void Modules_Should_Not_Reference_Each_Other_Directly()
    {
        var moduleAssemblies = new[]
        {
            typeof(BiometricsDbContext).Assembly,
            typeof(AttendanceDbContext).Assembly,
            typeof(OccupancyDbContext).Assembly,
            typeof(SecurityDbContext).Assembly,
            typeof(ReportingDbContext).Assembly
        };

        var moduleNames = moduleAssemblies.Select(a => a.GetName().Name!).ToHashSet();

        foreach (var assembly in moduleAssemblies)
        {
            var currentName = assembly.GetName().Name!;
            var otherModules = moduleNames.Where(name => name != currentName).ToHashSet();

            var referencedModules = assembly
                .GetReferencedAssemblies()
                .Select(r => r.Name!)
                .Where(name => otherModules.Contains(name))
                .ToList();

            Assert.Empty(referencedModules);
        }
    }

    [Fact]
    public void Each_Module_DbContext_Should_Have_Unique_Isolated_Database_Schema()
    {
        var schemas = new[]
        {
            BiometricsDbContext.SchemaName,
            AttendanceDbContext.SchemaName,
            OccupancyDbContext.SchemaName,
            SecurityDbContext.SchemaName,
            ReportingDbContext.SchemaName
        };

        Assert.Equal(5, schemas.Distinct().Count());
        Assert.Contains("biometrics", schemas);
        Assert.Contains("attendance", schemas);
        Assert.Contains("occupancy", schemas);
        Assert.Contains("security", schemas);
        Assert.Contains("reporting", schemas);
    }
}
