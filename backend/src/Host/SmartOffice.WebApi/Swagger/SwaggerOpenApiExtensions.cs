using System.Collections;
using System.Reflection;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.AspNetCore.Mvc.Controllers;

namespace SmartOffice.WebApi.Swagger;

/// <summary>
/// Tích hợp OpenAPI 3.0.1 Specification (/swagger/v1/swagger.json) và giao diện tương tác Swagger UI (/swagger)
/// tự động quét toàn bộ Controllers của cả 5 Module trong kiến trúc Modular Monolith.
/// </summary>
public static class SwaggerOpenApiExtensions
{
    public static void MapSmartOfficeSwagger(this WebApplication app)
    {
        app.MapGet("/swagger/v1/swagger.json", (IApiDescriptionGroupCollectionProvider explorer) =>
        {
            var doc = BuildOpenApiDocument(explorer);
            return Results.Json(doc);
        }).ExcludeFromDescription();

        app.MapGet("/swagger", () => Results.Content(GetSwaggerUiHtml(), "text/html; charset=utf-8"))
           .ExcludeFromDescription();

        app.MapGet("/swagger/index.html", () => Results.Content(GetSwaggerUiHtml(), "text/html; charset=utf-8"))
           .ExcludeFromDescription();
    }

    private static Dictionary<string, object?> BuildOpenApiDocument(IApiDescriptionGroupCollectionProvider explorer)
    {
        var paths = new Dictionary<string, Dictionary<string, object?>>(StringComparer.OrdinalIgnoreCase);

        foreach (var group in explorer.ApiDescriptionGroups.Items)
        {
            foreach (var api in group.Items)
            {
                if (string.IsNullOrWhiteSpace(api.RelativePath) || string.IsNullOrWhiteSpace(api.HttpMethod))
                {
                    continue;
                }

                var routePath = "/" + api.RelativePath.TrimStart('/');
                // Chuẩn hóa route constraint như {id:guid} -> {id} cho chuẩn OpenAPI 3.0
                routePath = System.Text.RegularExpressions.Regex.Replace(routePath, @"\{([^}:]+):[^}]+\}", "{$1}");

                if (!paths.TryGetValue(routePath, out var operations))
                {
                    operations = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
                    paths[routePath] = operations;
                }

                var method = api.HttpMethod.ToLowerInvariant();
                var controllerAction = api.ActionDescriptor as ControllerActionDescriptor;
                var tag = GetModuleTagName(controllerAction?.ControllerName ?? "System");
                var operationId = controllerAction is not null
                    ? $"{controllerAction.ControllerName}_{controllerAction.ActionName}_{method}"
                    : $"{method}_{routePath.Replace('/', '_')}";

                var parameters = new List<object>();
                object? requestBody = null;
                var formProperties = new Dictionary<string, object>();

                foreach (var param in api.ParameterDescriptions)
                {
                    var sourceId = param.Source?.Id ?? "Query";

                    if (param.Type == typeof(IFormFile) || sourceId.Equals("FormFile", StringComparison.OrdinalIgnoreCase))
                    {
                        formProperties[param.Name] = new
                        {
                            type = "string",
                            format = "binary",
                            description = "Tệp tải lên (Ảnh hiệu chuẩn / Snapshot)"
                        };
                        continue;
                    }

                    if (sourceId.Equals("Body", StringComparison.OrdinalIgnoreCase))
                    {
                        var bodySchema = BuildJsonSchemaForType(param.Type, 0);
                        var bodyExample = BuildExampleForType(param.Type, 0);
                        requestBody = new
                        {
                            required = true,
                            content = new Dictionary<string, object>
                            {
                                ["application/json"] = new
                                {
                                    schema = bodySchema,
                                    example = bodyExample
                                }
                            }
                        };
                        continue;
                    }

                    var location = sourceId.Equals("Path", StringComparison.OrdinalIgnoreCase) ? "path" : "query";
                    parameters.Add(new
                    {
                        name = param.Name,
                        @in = location,
                        required = location == "path" || param.IsRequired,
                        schema = BuildJsonSchemaForType(param.Type, 0)
                    });
                }

                if (formProperties.Count > 0)
                {
                    requestBody = new
                    {
                        required = true,
                        content = new Dictionary<string, object>
                        {
                            ["multipart/form-data"] = new
                            {
                                schema = new
                                {
                                    type = "object",
                                    properties = formProperties
                                }
                            }
                        }
                    };
                }

                var operationObj = new Dictionary<string, object?>
                {
                    ["tags"] = new[] { tag },
                    ["summary"] = controllerAction is not null
                        ? $"{controllerAction.ActionName} ({controllerAction.ControllerName})"
                        : routePath,
                    ["operationId"] = operationId,
                    ["parameters"] = parameters,
                    ["responses"] = new Dictionary<string, object>
                    {
                        ["200"] = new { description = "Thành công (200 OK)" },
                        ["201"] = new { description = "Khởi tạo thành công (201 Created)" },
                        ["400"] = new { description = "Dữ liệu đầu vào hoặc quy tắc nghiệp vụ không hợp lệ (400 Bad Request)" },
                        ["404"] = new { description = "Không tìm thấy tài nguyên (404 Not Found)" }
                    }
                };

                if (requestBody is not null)
                {
                    operationObj["requestBody"] = requestBody;
                }

                operations[method] = operationObj;
            }
        }

        return new Dictionary<string, object?>
        {
            ["openapi"] = "3.0.1",
            ["info"] = new
            {
                title = "Smart Office Computer Vision Backend API (Modular Monolith)",
                version = "v1.0",
                description = "Hệ thống Backend C# .NET 10 Modular Monolith gồm 5 Module độc lập: Biometrics, Attendance, Occupancy, Security và Reporting."
            },
            ["tags"] = new object[]
            {
                new { name = "1. Module Biometrics (Hồ sơ & Khuôn mặt 512D)", description = "Schema: biometrics | Quản lý phòng ban, nhân sự, kiểm định chất lượng và chống trùng lặp khuôn mặt." },
                new { name = "2. Module Attendance (Điểm danh & Chấm công)", description = "Schema: attendance | Quản lý ca làm việc, chấm công tự động, Debounce 5 phút, nghỉ phép và chốt vắng mặt ABSENT." },
                new { name = "3. Module Occupancy (Giám sát Chỗ ngồi & Vùng ảo)", description = "Schema: occupancy | Quản lý camera, khung hình hiệu chuẩn S3/R2, đa giác chuẩn hóa [0,1], 4-State FSM, Anti-Flicker & Lunchtime Mute." },
                new { name = "4. Module Security (An ninh Ngoài giờ & Đăng ký OT)", description = "Schema: security | Quản lý đăng ký làm thêm giờ (OT), chế độ Night Guard, cây quyết định cảnh báo 3 mức và đóng biên bản sự cố." },
                new { name = "5. Module Reporting (Báo cáo, Thống kê & RBAC Auth)", description = "Schema: reporting | Quản lý tài khoản RBAC, tổng hợp dữ liệu liên module qua InMemoryEventBus và xuất báo cáo CSV/Excel." },
                new { name = "0. System Health", description = "Kiểm tra trạng thái hệ thống và 5 Schema CSDL độc lập." }
            },
            ["paths"] = paths
        };
    }

    private static string GetModuleTagName(string controllerName) => controllerName switch
    {
        "Biometrics" => "1. Module Biometrics (Hồ sơ & Khuôn mặt 512D)",
        "Attendance" => "2. Module Attendance (Điểm danh & Chấm công)",
        "Occupancy" => "3. Module Occupancy (Giám sát Chỗ ngồi & Vùng ảo)",
        "Ot" or "SecurityIncidents" => "4. Module Security (An ninh Ngoài giờ & Đăng ký OT)",
        "Reporting" => "5. Module Reporting (Báo cáo, Thống kê & RBAC Auth)",
        _ => "0. System Health"
    };

    private static object BuildJsonSchemaForType(Type? type, int depth)
    {
        if (type is null || depth > 4)
        {
            return new { type = "string" };
        }

        var underlying = Nullable.GetUnderlyingType(type) ?? type;

        if (underlying == typeof(string))
            return new { type = "string" };
        if (underlying == typeof(Guid))
            return new { type = "string", format = "uuid" };
        if (underlying == typeof(bool))
            return new { type = "boolean" };
        if (underlying == typeof(int) || underlying == typeof(short) || underlying == typeof(byte))
            return new { type = "integer", format = "int32" };
        if (underlying == typeof(long))
            return new { type = "integer", format = "int64" };
        if (underlying == typeof(float) || underlying == typeof(double) || underlying == typeof(decimal))
            return new { type = "number", format = "double" };
        if (underlying == typeof(DateOnly))
            return new { type = "string", format = "date", example = "2026-11-03" };
        if (underlying == typeof(TimeOnly))
            return new { type = "string", format = "time", example = "08:00:00" };
        if (underlying == typeof(DateTimeOffset) || underlying == typeof(DateTime))
            return new { type = "string", format = "date-time" };

        if (underlying.IsArray)
        {
            return new
            {
                type = "array",
                items = BuildJsonSchemaForType(underlying.GetElementType(), depth + 1)
            };
        }

        if (typeof(IEnumerable).IsAssignableFrom(underlying) && underlying.IsGenericType)
        {
            return new
            {
                type = "array",
                items = BuildJsonSchemaForType(underlying.GetGenericArguments()[0], depth + 1)
            };
        }

        if (underlying.IsClass || (underlying.IsValueType && !underlying.IsPrimitive && !underlying.IsEnum))
        {
            var props = new Dictionary<string, object>();
            foreach (var prop in underlying.GetProperties(BindingFlags.Public | BindingFlags.Instance))
            {
                var propName = char.ToLowerInvariant(prop.Name[0]) + prop.Name[1..];
                props[propName] = BuildJsonSchemaForType(prop.PropertyType, depth + 1);
            }

            return new
            {
                type = "object",
                properties = props
            };
        }

        return new { type = "string" };
    }

    private static object? BuildExampleForType(Type? type, int depth)
    {
        if (type is null || depth > 3)
        {
            return null;
        }

        var underlying = Nullable.GetUnderlyingType(type) ?? type;

        if (underlying == typeof(string)) return "SAMPLE_CODE";
        if (underlying == typeof(Guid)) return Guid.Parse("11111111-1111-1111-1111-111111111101");
        if (underlying == typeof(bool)) return true;
        if (underlying == typeof(int) || underlying == typeof(long)) return 15;
        if (underlying == typeof(float) || underlying == typeof(double)) return 0.92;
        if (underlying == typeof(DateOnly)) return "2026-11-03";
        if (underlying == typeof(TimeOnly)) return "08:00:00";
        if (underlying == typeof(DateTimeOffset) || underlying == typeof(DateTime)) return "2026-11-03T09:00:00Z";

        if (underlying.IsArray)
        {
            var elemType = underlying.GetElementType();
            if (elemType == typeof(float))
            {
                return new[] { 0.8f, 0.6f, 0.0f, 0.0f };
            }
            return new[] { BuildExampleForType(elemType, depth + 1) };
        }

        if (typeof(IEnumerable).IsAssignableFrom(underlying) && underlying.IsGenericType)
        {
            var elemType = underlying.GetGenericArguments()[0];
            if (elemType.Name == "PolygonPointDto")
            {
                return new object[]
                {
                    new { x = 0.12, y = 0.40 },
                    new { x = 0.28, y = 0.40 },
                    new { x = 0.28, y = 0.65 },
                    new { x = 0.12, y = 0.65 }
                };
            }
            return new[] { BuildExampleForType(elemType, depth + 1) };
        }

        if (underlying.IsClass)
        {
            var dict = new Dictionary<string, object?>();
            foreach (var prop in underlying.GetProperties(BindingFlags.Public | BindingFlags.Instance))
            {
                var propName = char.ToLowerInvariant(prop.Name[0]) + prop.Name[1..];
                dict[propName] = GetFriendlyPropertyExample(prop.Name, prop.PropertyType, depth + 1);
            }
            return dict;
        }

        return null;
    }

    private static object? GetFriendlyPropertyExample(string propName, Type propType, int depth)
    {
        return propName switch
        {
            "DepartmentCode" => "DEPT_IT",
            "DepartmentName" => "Phòng Kỹ thuật Phần mềm & AI",
            "Description" => "Phát triển hệ thống Smart Office",
            "EmployeeCode" => "NV001",
            "FullName" => "Nguyễn Văn An",
            "Email" => "annv@smartoffice.id.vn",
            "PhoneNumber" => "0901234567",
            "ShiftCode" => "SHIFT_HC",
            "ShiftName" => "Ca Hành chính Tiêu chuẩn",
            "StartTime" => "08:00:00",
            "EndTime" => "17:30:00",
            "GraceMinutes" => 15,
            "QualityScore" => 135.5,
            "PoseLabel" => "FRONTAL",
            "SampleImageKey" => "biometrics/NV001/sample_front_01.jpg",
            "CameraCode" => "CAM_DESK_IT",
            "CameraName" => "Camera Phòng Kỹ thuật",
            "CameraType" => "DESK",
            "StreamSource" => "rtsp://localhost:8554/desk_it",
            "SeatCode" => "SEAT_IT_01",
            "SeatName" => "Bàn làm việc Kỹ thuật 01",
            "ZoneType" => "WORK_DESK",
            "ApprovalStatus" => "APPROVED",
            "TicketStatus" => "ACKNOWLEDGED",
            "ResolutionNote" => "Đã kiểm tra hiện trường, nhân viên đối tác bảo trì định kỳ.",
            "Username" => "admin_smartoffice",
            "Password" => "Admin@123",
            "Role" => "ADMIN",
            _ => BuildExampleForType(propType, depth)
        };
    }

    private static string GetSwaggerUiHtml() => """
        <!DOCTYPE html>
        <html lang="vi">
        <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>Smart Office Backend API - Swagger UI</title>
            <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui.css" />
            <style>
                body { margin: 0; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
                .topbar-banner {
                    background: linear-gradient(90deg, #0f172a 0%, #1e3a8a 100%);
                    color: #fff;
                    padding: 14px 28px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                }
                .topbar-banner h1 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: 0.3px; }
                .topbar-banner span { font-size: 13px; background: rgba(255,255,255,0.15); padding: 4px 10px; border-radius: 99px; }
            </style>
        </head>
        <body>
            <div class="topbar-banner">
                <h1>Smart Office Computer Vision Backend — Modular Monolith (.NET 10)</h1>
                <span>5 Modules • 5 Isolated Schemas • SignalR • S3/R2 Storage</span>
            </div>
            <div id="swagger-ui"></div>
            <script src="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-bundle.js" crossorigin></script>
            <script>
                window.onload = () => {
                    window.ui = SwaggerUIBundle({
                        url: '/swagger/v1/swagger.json',
                        dom_id: '#swagger-ui',
                        deepLinking: true,
                        docExpansion: 'list',
                        defaultModelsExpandDepth: -1,
                        tryItOutEnabled: true
                    });
                };
            </script>
        </body>
        </html>
        """;
}

