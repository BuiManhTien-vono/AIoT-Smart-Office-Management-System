namespace SmartOffice.SharedKernel.Common;

/// <summary>
/// Quản lý múi giờ chuẩn Việt Nam (ICT / GMT+7 / UTC+7).
/// Đảm bảo tính toán đúng ca làm việc, thời gian ra vào, giờ ăn trưa và ca trực đêm
/// độc lập với môi trường chạy thực tế của máy chủ hay Docker container.
/// </summary>
public static class VietnamDateTime
{
    public static readonly TimeZoneInfo TimeZone = ResolveVietnamTimeZone();

    public static DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
    public static DateTimeOffset Now => TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, TimeZone);
    public static DateOnly Today => DateOnly.FromDateTime(Now.DateTime);
    public static TimeOnly CurrentTime => TimeOnly.FromDateTime(Now.DateTime);

    public static DateTimeOffset ToVietnamTime(DateTimeOffset utcTime) =>
        TimeZoneInfo.ConvertTime(utcTime, TimeZone);

    public static TimeOnly ToVietnamTimeOnly(DateTimeOffset utcTime) =>
        TimeOnly.FromDateTime(ToVietnamTime(utcTime).DateTime);

    public static DateOnly ToVietnamDateOnly(DateTimeOffset utcTime) =>
        DateOnly.FromDateTime(ToVietnamTime(utcTime).DateTime);

    private static TimeZoneInfo ResolveVietnamTimeZone()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById("SE Asia Standard Time");
        }
        catch
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById("Asia/Ho_Chi_Minh");
            }
            catch
            {
                return TimeZoneInfo.CreateCustomTimeZone(
                    "ICT",
                    TimeSpan.FromHours(7),
                    "(UTC+07:00) Bangkok, Hanoi, Jakarta",
                    "Indochina Time");
            }
        }
    }
}
