namespace SmartOffice.SharedKernel.Events;

/// <summary>
/// Hợp đồng chung cho mọi sự kiện tích hợp liên Module (Integration Event).
/// Đảm bảo các Module giao tiếp lỏng (Loose-coupling) mà không cần tham chiếu trực tiếp nhau.
/// </summary>
public interface IIntegrationEvent
{
    Guid EventId { get; }
    DateTimeOffset OccurredOnUtc { get; }
}

/// <summary>
/// Bộ xử lý sự kiện tích hợp tại các Module lắng nghe.
/// </summary>
public interface IIntegrationEventHandler<in TEvent>
    where TEvent : IIntegrationEvent
{
    Task HandleAsync(TEvent integrationEvent, CancellationToken cancellationToken = default);
}

/// <summary>
/// Giao diện Bus sự kiện trong bộ nhớ (In-Memory Event Bus) dùng cho kiến trúc Modular Monolith.
/// </summary>
public interface IInMemoryEventBus
{
    Task PublishAsync<TEvent>(TEvent integrationEvent, CancellationToken cancellationToken = default)
        where TEvent : class, IIntegrationEvent;
}
