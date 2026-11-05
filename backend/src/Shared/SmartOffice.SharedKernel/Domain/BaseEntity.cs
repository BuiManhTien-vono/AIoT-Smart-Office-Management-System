namespace SmartOffice.SharedKernel.Domain;

/// <summary>
/// Lớp cơ sở cho mọi thực thể nghiệp vụ (Entity) trong toàn bộ các Module.
/// </summary>
public abstract class BaseEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedAt { get; set; }

    public void MarkUpdated()
    {
        UpdatedAt = DateTimeOffset.UtcNow;
    }
}
