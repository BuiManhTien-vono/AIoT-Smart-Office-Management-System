namespace SmartOffice.SharedKernel.Domain;

/// <summary>
/// Lớp cơ sở cho mọi thực thể nghiệp vụ (Entity) trong toàn bộ các Module.
/// </summary>
public abstract class BaseEntity
{
    public Guid Id { get; protected set; } = Guid.NewGuid();
    public DateTimeOffset CreatedAt { get; protected set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedAt { get; protected set; }

    protected void MarkUpdated()
    {
        UpdatedAt = DateTimeOffset.UtcNow;
    }
}
