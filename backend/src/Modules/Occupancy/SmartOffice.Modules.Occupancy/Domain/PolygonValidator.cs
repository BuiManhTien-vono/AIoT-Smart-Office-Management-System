using SmartOffice.Modules.Occupancy.Application.DTOs;
using SmartOffice.SharedKernel.Common;

namespace SmartOffice.Modules.Occupancy.Domain;

/// <summary>
/// Bộ kiểm định hình học đa giác vùng ảo bàn làm việc / khu vực cấm (FR-OCC-01, FR-ADM-01, NFR-ACC-02):
/// - Kiểm tra tối thiểu 3 đỉnh.
/// - Kiểm tra tọa độ chuẩn hóa trong đoạn [0.0, 1.0].
/// - Kiểm tra đa giác không bị suy biến (diện tích Shoelace > 1e-6).
/// - Cung cấp thuật toán Point-in-Polygon (Ray Casting).
/// </summary>
public static class PolygonValidator
{
    public const int MinVertices = 3;
    public const double MinPolygonArea = 1e-6;

    public static readonly HashSet<string> AllowedZoneTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "WORK_DESK",
        "RESTRICTED_ZONE"
    };

    public static Result Validate(IReadOnlyList<PolygonPointDto>? points, string? zoneType = "WORK_DESK")
    {
        if (!string.IsNullOrWhiteSpace(zoneType) && !AllowedZoneTypes.Contains(zoneType.Trim()))
        {
            return Result.Failure(new Error(
                "INVALID_ZONE_TYPE",
                $"Loại vùng ảo '{zoneType}' không hợp lệ. Chỉ chấp nhận 'WORK_DESK' hoặc 'RESTRICTED_ZONE'."));
        }

        if (points is null || points.Count < MinVertices)
        {
            return Result.Failure(new Error(
                "POLYGON_TOO_FEW_VERTICES",
                $"Đa giác vùng ảo phải có tối thiểu {MinVertices} đỉnh (hiện có {points?.Count ?? 0} đỉnh)."));
        }

        for (int i = 0; i < points.Count; i++)
        {
            var pt = points[i];
            if (double.IsNaN(pt.X) || double.IsInfinity(pt.X) ||
                double.IsNaN(pt.Y) || double.IsInfinity(pt.Y) ||
                pt.X < 0.0 || pt.X > 1.0 ||
                pt.Y < 0.0 || pt.Y > 1.0)
            {
                return Result.Failure(new Error(
                    "POLYGON_COORDINATE_OUT_OF_RANGE",
                    $"Đỉnh thứ {i + 1} ({pt.X}, {pt.Y}) nằm ngoài miền chuẩn hóa [0.0, 1.0]."));
            }
        }

        var distinctCount = points
            .Select(p => (Math.Round(p.X, 6), Math.Round(p.Y, 6)))
            .Distinct()
            .Count();

        if (distinctCount < MinVertices)
        {
            return Result.Failure(new Error(
                "POLYGON_DEGENERATE_VERTICES",
                "Đa giác có các đỉnh bị trùng nhau, không tạo thành mặt phẳng khép kín hợp lệ."));
        }

        var area = CalculateArea(points);
        if (area < MinPolygonArea)
        {
            return Result.Failure(new Error(
                "POLYGON_ZERO_AREA",
                "Các đỉnh đa giác thẳng hàng hoặc có diện tích quá nhỏ (đa giác suy biến)."));
        }

        return Result.Success();
    }

    /// <summary>
    /// Tính diện tích đa giác 2D bằng công thức Shoelace.
    /// </summary>
    public static double CalculateArea(IReadOnlyList<PolygonPointDto> points)
    {
        if (points is null || points.Count < MinVertices)
        {
            return 0.0;
        }

        double sum = 0.0;
        int n = points.Count;
        for (int i = 0; i < n; i++)
        {
            var current = points[i];
            var next = points[(i + 1) % n];
            sum += (current.X * next.Y) - (next.X * current.Y);
        }

        return Math.Abs(sum) * 0.5;
    }

    /// <summary>
    /// Giải thuật Point-in-Polygon (Ray Casting - FR-OCC-01):
    /// Kiểm tra điểm đáy bounding box (x, y) có nằm bên trong đa giác bàn làm việc hay không.
    /// </summary>
    public static bool IsPointInPolygon(double x, double y, IReadOnlyList<PolygonPointDto> polygon)
    {
        if (polygon is null || polygon.Count < MinVertices)
        {
            return false;
        }

        bool inside = false;
        int n = polygon.Count;

        for (int i = 0, j = n - 1; i < n; j = i++)
        {
            double xi = polygon[i].X, yi = polygon[i].Y;
            double xj = polygon[j].X, yj = polygon[j].Y;

            bool intersect = ((yi > y) != (yj > y)) &&
                             (x < (xj - xi) * (y - yi) / ((yj - yi) + 1e-12) + xi);
            if (intersect)
            {
                inside = !inside;
            }
        }

        return inside;
    }
}

