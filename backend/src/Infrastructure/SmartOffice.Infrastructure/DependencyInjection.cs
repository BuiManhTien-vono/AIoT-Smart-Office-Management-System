using Microsoft.Extensions.DependencyInjection;
using SmartOffice.Infrastructure.Events;
using SmartOffice.SharedKernel.Events;

namespace SmartOffice.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddSharedInfrastructure(this IServiceCollection services)
    {
        services.AddSingleton<IInMemoryEventBus, InMemoryEventBus>();
        return services;
    }
}

