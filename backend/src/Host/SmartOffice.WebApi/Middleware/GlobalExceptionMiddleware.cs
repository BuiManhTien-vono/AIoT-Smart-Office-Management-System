using System.Net;
using System.Text.Json;

namespace SmartOffice.WebApi.Middleware;

/// <summary>
/// Middleware xử lý ngoại lệ tập trung cho toàn bộ hệ thống Backend Modular Monolith.
/// </summary>
public sealed class GlobalExceptionMiddleware(
    RequestDelegate next,
    ILogger<GlobalExceptionMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Ngoại lệ chưa xử lý tại đường dẫn {Path}", context.Request.Path);

            context.Response.ContentType = "application/json";
            context.Response.StatusCode = (int)HttpStatusCode.InternalServerError;

            var response = new
            {
                status = context.Response.StatusCode,
                error = "INTERNAL_SERVER_ERROR",
                message = "Đã xảy ra lỗi hệ thống trong quá trình xử lý yêu cầu.",
                detail = ex.Message,
                timestamp = DateTimeOffset.UtcNow
            };

            await context.Response.WriteAsync(JsonSerializer.Serialize(response));
        }
    }
}

