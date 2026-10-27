namespace SmartOffice.SharedKernel.Storage;

/// <summary>
/// Hợp đồng dịch vụ lưu trữ đối tượng chuẩn S3 / MinIO / Cloudflare R2.
/// Phục vụ tải tệp lên qua Stream và sinh đường dẫn bảo mật có thời hạn (Presigned URL).
/// </summary>
public interface IObjectStorageService
{
    Task<string> UploadFileAsync(
        string objectKey,
        Stream fileStream,
        string contentType,
        CancellationToken cancellationToken = default);

    Task<string> GetPresignedUrlAsync(
        string objectKey,
        int expiryMinutes = 15,
        CancellationToken cancellationToken = default);
}
