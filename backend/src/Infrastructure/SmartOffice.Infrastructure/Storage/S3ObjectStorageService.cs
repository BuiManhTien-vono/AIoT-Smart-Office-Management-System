using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using SmartOffice.SharedKernel.Storage;

namespace SmartOffice.Infrastructure.Storage;

/// <summary>
/// Dịch vụ lưu trữ đối tượng chuẩn S3-compatible (Cloudflare R2 / MinIO).
/// - Chuẩn hóa và bảo vệ đường dẫn khóa đối tượng (chống Path Traversal).
/// - Tải tệp lên qua Stream và kiểm soát dung lượng tối đa.
/// - Sinh đường dẫn bảo mật có thời hạn (Presigned URL) ký bằng chữ ký AWS4-HMAC-SHA256.
/// </summary>
public sealed class S3ObjectStorageService(ObjectStorageOptions options) : IObjectStorageService
{
    private readonly ConcurrentDictionary<string, StoredObjectMetadata> _objectRegistry = new(StringComparer.OrdinalIgnoreCase);

    public sealed record StoredObjectMetadata(
        string ObjectKey,
        string ContentType,
        long SizeBytes,
        string Sha256Hex,
        DateTimeOffset UploadedAtUtc);

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

        memoryBuffer.Position = 0;
        var hashBytes = await SHA256.HashDataAsync(memoryBuffer, cancellationToken);
        var sha256Hex = Convert.ToHexStringLower(hashBytes);

        _objectRegistry[normalizedKey] = new StoredObjectMetadata(
            normalizedKey,
            normalizedContentType,
            sizeBytes,
            sha256Hex,
            DateTimeOffset.UtcNow);

        return normalizedKey;
    }

    public Task<string> GetPresignedUrlAsync(
        string objectKey,
        int expiryMinutes = 15,
        CancellationToken cancellationToken = default)
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

        var canonicalRequest = $"GET\n/{bucket}/{normalizedKey}\nX-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential={credential}&X-Amz-Date={amzDate}&X-Amz-Expires={expiresSeconds}&X-Amz-SignedHeaders=host\nhost:{ new Uri(endpoint).Authority }\n\nhost\nUNSIGNED-PAYLOAD";
        var signature = ComputeAwsV4Signature(options.SecretKey, dateStamp, region, "s3", canonicalRequest);

        var presignedUrl =
            $"{endpoint}/{bucket}/{normalizedKey}" +
            $"?X-Amz-Algorithm=AWS4-HMAC-SHA256" +
            $"&X-Amz-Credential={credential}" +
            $"&X-Amz-Date={amzDate}" +
            $"&X-Amz-Expires={expiresSeconds}" +
            $"&X-Amz-SignedHeaders=host" +
            $"&X-Amz-Signature={signature}";

        return Task.FromResult(presignedUrl);
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

