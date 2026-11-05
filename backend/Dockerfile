# Multi-stage build cho .NET 10 WebApi (Modular Monolith)
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy file Solution và các file .csproj của từng Module để tối ưu Docker Layer Caching
COPY ["SmartOffice.slnx", "./"]
COPY ["src/Host/SmartOffice.WebApi/SmartOffice.WebApi.csproj", "src/Host/SmartOffice.WebApi/"]
COPY ["src/Shared/SmartOffice.SharedKernel/SmartOffice.SharedKernel.csproj", "src/Shared/SmartOffice.SharedKernel/"]
COPY ["src/Infrastructure/SmartOffice.Infrastructure/SmartOffice.Infrastructure.csproj", "src/Infrastructure/SmartOffice.Infrastructure/"]
COPY ["src/Modules/Biometrics/SmartOffice.Modules.Biometrics/SmartOffice.Modules.Biometrics.csproj", "src/Modules/Biometrics/SmartOffice.Modules.Biometrics/"]
COPY ["src/Modules/Attendance/SmartOffice.Modules.Attendance/SmartOffice.Modules.Attendance.csproj", "src/Modules/Attendance/SmartOffice.Modules.Attendance/"]
COPY ["src/Modules/Occupancy/SmartOffice.Modules.Occupancy/SmartOffice.Modules.Occupancy.csproj", "src/Modules/Occupancy/SmartOffice.Modules.Occupancy/"]
COPY ["src/Modules/Security/SmartOffice.Modules.Security/SmartOffice.Modules.Security.csproj", "src/Modules/Security/SmartOffice.Modules.Security/"]
COPY ["src/Modules/Reporting/SmartOffice.Modules.Reporting/SmartOffice.Modules.Reporting.csproj", "src/Modules/Reporting/SmartOffice.Modules.Reporting/"]
COPY ["tests/SmartOffice.UnitTests/SmartOffice.UnitTests.csproj", "tests/SmartOffice.UnitTests/"]

RUN dotnet restore "SmartOffice.slnx"

# Copy toàn bộ mã nguồn và publish bản Release
COPY . .
WORKDIR "/src/src/Host/SmartOffice.WebApi"
RUN dotnet publish "SmartOffice.WebApi.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Tầng chạy thực tế (Runtime Image gọn nhẹ & bảo mật)
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "SmartOffice.WebApi.dll"]
