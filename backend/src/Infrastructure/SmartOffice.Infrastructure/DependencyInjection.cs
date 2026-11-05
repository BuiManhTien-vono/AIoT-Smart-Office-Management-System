using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SmartOffice.Infrastructure.Events;
using SmartOffice.Infrastructure.Storage;
using SmartOffice.SharedKernel.Events;
using SmartOffice.SharedKernel.Storage;

namespace SmartOffice.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddSharedInfrastructure(
        this IServiceCollection services,
        IConfiguration? configuration = null)
    {
        services.AddSingleton<IInMemoryEventBus, InMemoryEventBus>();

        var storageOptions = new ObjectStorageOptions();
        if (configuration is not null)
        {
            var section = configuration.GetSection(ObjectStorageOptions.SectionName);
            if (!section.Exists())
            {
                section = configuration.GetSection(ObjectStorageOptions.LegacySectionName);
            }

            if (section.Exists())
            {
                storageOptions.Provider = section[nameof(ObjectStorageOptions.Provider)] ?? storageOptions.Provider;
                storageOptions.Endpoint = section[nameof(ObjectStorageOptions.Endpoint)] ?? storageOptions.Endpoint;
                storageOptions.BucketName = section[nameof(ObjectStorageOptions.BucketName)] ?? storageOptions.BucketName;
                storageOptions.AccessKey = section[nameof(ObjectStorageOptions.AccessKey)] ?? storageOptions.AccessKey;
                storageOptions.SecretKey = section[nameof(ObjectStorageOptions.SecretKey)] ?? storageOptions.SecretKey;
                storageOptions.Region = section[nameof(ObjectStorageOptions.Region)] ?? storageOptions.Region;
            }
        }

        services.AddSingleton(storageOptions);
        services.AddSingleton<IObjectStorageService, S3ObjectStorageService>();

        return services;
    }
}
