using System.Collections.Concurrent;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using SmartOffice.SharedKernel.Storage;

namespace SmartOffice.Infrastructure.Storage;

/// <summary>
/// Dịch vụ lưu trữ đối tượng chuẩn S3-compatible (Cloudflare R2 / MinIO).
/// - Chuẩn hóa và bảo vệ đường dẫn khóa đối tượng (chống Path Traversal).
/// - Tải tệp lên qua Stream, kiểm soát dung lượng tối đa, băm SHA-256 và đẩy HTTP PUT ký AWSv4 lên MinIO/R2.
/// - Sinh đường dẫn bảo mật có thời hạn (Presigned GET URL & Presigned PUT URL) ký bằng chữ ký AWS4-HMAC-SHA256.
/// </summary>
public sealed class S3ObjectStorageService(
    ObjectStorageOptions options,
    HttpClient? httpClient = null) : IObjectStorageService
{
    private static readonly HttpClient SharedHttpClient = new()
    {
        Timeout = TimeSpan.FromSeconds(10)
    };

    private readonly HttpClient _httpClient = httpClient ?? SharedHttpClient;
    private readonly ConcurrentDictionary<string, StoredObjectMetadata> _objectRegistry = new(StringComparer.OrdinalIgnoreCase);

    public sealed record StoredObjectMetadata(
        string ObjectKey,
        string ContentType,
        long SizeBytes,
        string Sha256Hex,
        DateTimeOffset UploadedAtUtc,
        bool SyncedToRemoteBucket = false);

    public async Task<string> UploadFileAsync(
        string objectKey,
        Stream fileStream,
        string contentType,
        CancellationToken cancellationToken = default)
    {
        var normalizedKey = NormalizeAndValidateKey(objectKey);

        if (fileStream is null || !fileStream.CanRead)
        {
            throw new ArgumentException("Stream dữ liệu tải lên không hợp lệ hoặc không thể đọc.", nameof(fileStream));
        }

        var normalizedContentType = string.IsNullOrWhiteSpace(contentType)
            ? "application/octet-stream"
            : contentType.Trim();

        using var memoryBuffer = new MemoryStream();
        await fileStream.CopyToAsync(memoryBuffer, cancellationToken);
        var sizeBytes = memoryBuffer.Length;

        if (sizeBytes == 0)
        {
            throw new ArgumentException("Không cho phép tải lên tệp rỗng (0 byte).", nameof(fileStream));
        }

        if (sizeBytes > options.MaxFileSizeBytes)
        {
            throw new InvalidOperationException(
                $"Kích thước tệp ({sizeBytes} bytes) vượt quá giới hạn cho phép ({options.MaxFileSizeBytes} bytes).");
        }

        var payloadBytes = memoryBuffer.ToArray();
        var hashBytes = SHA256.HashData(payloadBytes);
        var sha256Hex = Convert.ToHexStringLower(hashBytes);
        var nowUtc = DateTimeOffset.UtcNow;

        bool syncedRemote = false;
        if (options.UseRemoteS3Put)
        {
            syncedRemote = await TryPutObjectToS3ServerAsync(
                normalizedKey,
                payloadBytes,
                normalizedContentType,
                sha256Hex,
                nowUtc,
                cancellationToken);
        }

        _objectRegistry[normalizedKey] = new StoredObjectMetadata(
            normalizedKey,
            normalizedContentType,
            sizeBytes,
            sha256Hex,
            nowUtc,
            syncedRemote);

        return normalizedKey;
    }

    public Task<string> GetPresignedUrlAsync(
        string objectKey,
        int expiryMinutes = 15,
        CancellationToken cancellationToken = default)
    {
        return BuildPresignedUrlAsync(
            httpMethod: "GET",
            objectKey: objectKey,
            contentType: null,
            expiryMinutes: expiryMinutes,
            cancellationToken: cancellationToken);
    }

    public Task<string> GetPresignedUploadUrlAsync(
        string objectKey,
        string contentType = "image/jpeg",
        int expiryMinutes = 15,
        CancellationToken cancellationToken = default)
    {
        var normalizedContentType = string.IsNullOrWhiteSpace(contentType)
            ? "application/octet-stream"
            : contentType.Trim();

        return BuildPresignedUrlAsync(
            httpMethod: "PUT",
            objectKey: objectKey,
            contentType: normalizedContentType,
            expiryMinutes: expiryMinutes,
            cancellationToken: cancellationToken);
    }

    public StoredObjectMetadata? GetObjectMetadata(string objectKey)
    {
        var normalizedKey = NormalizeAndValidateKey(objectKey);
        return _objectRegistry.TryGetValue(normalizedKey, out var meta) ? meta : null;
    }

    public static string NormalizeAndValidateKey(string objectKey)
    {
        if (string.IsNullOrWhiteSpace(objectKey))
        {
            throw new ArgumentException("Khóa định danh đối tượng (objectKey) không được để trống.", nameof(objectKey));
        }

        var replaced = objectKey.Trim().Replace('\\', '/').TrimStart('/');
        if (string.IsNullOrWhiteSpace(replaced) ||
            replaced.Contains("..", StringComparison.Ordinal) ||
            replaced.Contains("//", StringComparison.Ordinal))
        {
            throw new ArgumentException($"Khóa đối tượng '{objectKey}' chứa ký tự đường dẫn không an toàn.", nameof(objectKey));
        }

        return replaced;
    }

    private Task<string> BuildPresignedUrlAsync(
        string httpMethod,
        string objectKey,
        string? contentType,
        int expiryMinutes,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var normalizedKey = NormalizeAndValidateKey(objectKey);
        if (expiryMinutes <= 0 || expiryMinutes > 7 * 24 * 60)
        {
            throw new ArgumentOutOfRangeException(
                nameof(expiryMinutes),
                "Thời hạn hiệu lực của Presigned URL phải nằm trong khoảng từ 1 phút đến 10080 phút (7 ngày).");
        }

        var nowUtc = DateTimeOffset.UtcNow;
        var amzDate = nowUtc.ToString("yyyyMMdd'T'HHmmss'Z'");
        var dateStamp = nowUtc.ToString("yyyyMMdd");
        var expiresSeconds = expiryMinutes * 60;

        var endpoint = options.Endpoint.TrimEnd('/');
        var bucket = options.BucketName.Trim('/');
        var region = string.IsNullOrWhiteSpace(options.Region) ? "auto" : options.Region.Trim();
        var credentialScope = $"{dateStamp}/{region}/s3/aws4_request";
        var credential = Uri.EscapeDataString($"{options.AccessKey}/{credentialScope}");
        var hostAuthority = new Uri(endpoint).Authority;

        var signedHeaders = string.IsNullOrWhiteSpace(contentType) ? "host" : "content-type;host";
        var canonicalHeaders = string.IsNullOrWhiteSpace(contentType)
            ? $"host:{hostAuthority}\n"
            : $"content-type:{contentType}\nhost:{hostAuthority}\n";

        var queryParameters =
            $"X-Amz-Algorithm=AWS4-HMAC-SHA256" +
            $"&X-Amz-Credential={credential}" +
            $"&X-Amz-Date={amzDate}" +
            $"&X-Amz-Expires={expiresSeconds}" +
            $"&X-Amz-SignedHeaders={ Uri.EscapeDataString(signedHeaders) }";

        var canonicalRequest =
            $"{httpMethod}\n" +
            $"/{bucket}/{normalizedKey}\n" +
            $"{queryParameters}\n" +
            $"{canonicalHeaders}\n" +
            $"{signedHeaders}\n" +
            $"UNSIGNED-PAYLOAD";

        var signature = ComputeAwsV4Signature(options.SecretKey, dateStamp, region, "s3", canonicalRequest);

        var presignedUrl =
            $"{endpoint}/{bucket}/{normalizedKey}" +
            $"?{queryParameters}" +
            $"&X-Amz-Signature={signature}";

        return Task.FromResult(presignedUrl);
    }

    private async Task<bool> TryPutObjectToS3ServerAsync(
        string normalizedKey,
        byte[] payloadBytes,
        string contentType,
        string payloadSha256Hex,
        DateTimeOffset nowUtc,
        CancellationToken cancellationToken)
    {
        try
        {
            var endpoint = options.Endpoint.TrimEnd('/');
            var bucket = options.BucketName.Trim('/');
            var region = string.IsNullOrWhiteSpace(options.Region) ? "auto" : options.Region.Trim();
            var amzDate = nowUtc.ToString("yyyyMMdd'T'HHmmss'Z'");
            var dateStamp = nowUtc.ToString("yyyyMMdd");
            var hostAuthority = new Uri(endpoint).Authority;

            const string signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
            var canonicalHeaders =
                $"content-type:{contentType}\n" +
                $"host:{hostAuthority}\n" +
                $"x-amz-content-sha256:{payloadSha256Hex}\n" +
                $"x-amz-date:{amzDate}\n";

            var canonicalRequest =
                $"PUT\n" +
                $"/{bucket}/{normalizedKey}\n" +
                $"\n" +
                $"{canonicalHeaders}\n" +
                $"{signedHeaders}\n" +
                $"{payloadSha256Hex}";

            var signature = ComputeAwsV4Signature(options.SecretKey, dateStamp, region, "s3", canonicalRequest);
            var credentialScope = $"{dateStamp}/{region}/s3/aws4_request";
            var authorizationHeader =
                $"AWS4-HMAC-SHA256 Credential={options.AccessKey}/{credentialScope}, SignedHeaders={signedHeaders}, Signature={signature}";

            using var request = new HttpRequestMessage(HttpMethod.Put, $"{endpoint}/{bucket}/{normalizedKey}");
            request.Content = new ByteArrayContent(payloadBytes);
            request.Content.Headers.ContentType = new MediaTypeHeaderValue(contentType);
            request.Headers.TryAddWithoutValidation("x-amz-date", amzDate);
            request.Headers.TryAddWithoutValidation("x-amz-content-sha256", payloadSha256Hex);
            request.Headers.TryAddWithoutValidation("Authorization", authorizationHeader);

            using var response = await _httpClient.SendAsync(request, cancellationToken);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    private static string ComputeAwsV4Signature(
        string secretKey,
        string dateStamp,
        string region,
        string service,
        string canonicalRequest)
    {
        var kSecret = Encoding.UTF8.GetBytes("AWS4" + secretKey);
        var kDate = HMACSHA256.HashData(kSecret, Encoding.UTF8.GetBytes(dateStamp));
        var kRegion = HMACSHA256.HashData(kDate, Encoding.UTF8.GetBytes(region));
        var kService = HMACSHA256.HashData(kRegion, Encoding.UTF8.GetBytes(service));
        var kSigning = HMACSHA256.HashData(kService, Encoding.UTF8.GetBytes("aws4_request"));

        var requestHash = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(canonicalRequest)));
        var stringToSign = $"AWS4-HMAC-SHA256\n{dateStamp}\n{dateStamp}/{region}/{service}/aws4_request\n{requestHash}";
        var signatureBytes = HMACSHA256.HashData(kSigning, Encoding.UTF8.GetBytes(stringToSign));

        return Convert.ToHexStringLower(signatureBytes);
    }
}
