using Microsoft.Extensions.DependencyInjection;
using SmartOffice.SharedKernel.Events;

namespace SmartOffice.Infrastructure.Events;

/// <summary>
/// Triển khai In-Memory Event Bus giúp các Module trong kiến trúc Modular Monolith
/// giao tiếp lỏng (Loose-coupling) mà không cần tham chiếu trực tiếp lẫn nhau.
/// </summary>
public sealed class InMemoryEventBus(IServiceScopeFactory scopeFactory) : IInMemoryEventBus
{
    public async Task PublishAsync<TEvent>(TEvent integrationEvent, CancellationToken cancellationToken = default)
        where TEvent : class, IIntegrationEvent
    {
        using var scope = scopeFactory.CreateScope();
        var handlers = scope.ServiceProvider.GetServices<IIntegrationEventHandler<TEvent>>();

        foreach (var handler in handlers)
        {
            await handler.HandleAsync(integrationEvent, cancellationToken);
        }
    }
}

