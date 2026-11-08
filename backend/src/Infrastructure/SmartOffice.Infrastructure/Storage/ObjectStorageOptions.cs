namespace SmartOffice.Infrastructure.Storage;

/// <summary>
/// Cấu hình kết nối kho lưu trữ đối tượng tương thích chuẩn S3 (Cloudflare R2 / MinIO).
/// </summary>
public sealed class ObjectStorageOptions
{
    public const string SectionName = "ObjectStorage";
    public const string LegacySectionName = "Storage";

    public string Provider { get; set; } = "MinIO";
    public string Endpoint { get; set; } = "http://localhost:9000";
    public string BucketName { get; set; } = "smartoffice-media";
    public string AccessKey { get; set; } = "minioadmin";
    public string SecretKey { get; set; } = "minioadmin";
    public string Region { get; set; } = "auto";
    public long MaxFileSizeBytes { get; set; } = 25 * 1024 * 1024; // 25 MB
    public int DefaultPresignedExpiryMinutes { get; set; } = 15;
    public bool UseRemoteS3Put { get; set; } = false;
}
