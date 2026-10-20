# Multi-stage build cho .NET WebApi
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copy toàn bộ source và restore
COPY ["SmartOffice.slnx", "./"]
COPY ["src/Host/SmartOffice.WebApi/SmartOffice.WebApi.csproj", "src/Host/SmartOffice.WebApi/"]
COPY ["src/Shared/SmartOffice.SharedKernel/SmartOffice.SharedKernel.csproj", "src/Shared/SmartOffice.SharedKernel/"]
COPY ["src/Infrastructure/SmartOffice.Infrastructure/SmartOffice.Infrastructure.csproj", "src/Infrastructure/SmartOffice.Infrastructure/"]
COPY ["src/Modules/Biometrics/SmartOffice.Modules.Biometrics/SmartOffice.Modules.Biometrics.csproj", "src/Modules/Biometrics/SmartOffice.Modules.Biometrics/"]
COPY ["src/Modules/Attendance/SmartOffice.Modules.Attendance/SmartOffice.Modules.Attendance.csproj", "src/Modules/Attendance/SmartOffice.Modules.Attendance/"]
COPY ["src/Modules/Occupancy/SmartOffice.Modules.Occupancy/SmartOffice.Modules.Occupancy.csproj", "src/Modules/Occupancy/SmartOffice.Modules.Occupancy/"]
COPY ["src/Modules/Security/SmartOffice.Modules.Security/SmartOffice.Modules.Security.csproj", "src/Modules/Security/SmartOffice.Modules.Security/"]
COPY ["src/Modules/Reporting/SmartOffice.Modules.Reporting/SmartOffice.Modules.Reporting.csproj", "src/Modules/Reporting/SmartOffice.Modules.Reporting/"]

RUN dotnet restore "SmartOffice.slnx"

COPY . .
WORKDIR "/src/src/Host/SmartOffice.WebApi"
RUN dotnet publish "SmartOffice.WebApi.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "SmartOffice.WebApi.dll"]

