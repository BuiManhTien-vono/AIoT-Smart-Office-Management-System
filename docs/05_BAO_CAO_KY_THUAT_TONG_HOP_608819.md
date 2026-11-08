# BÁO CÁO KỸ THUẬT ĐỒ ÁN MÔN HỌC (MÃ HỌC PHẦN: 608819)
**TRƯỜNG ĐẠI HỌC XÂY DỰNG HÀ NỘI – KHOA CÔNG NGHỆ THÔNG TIN**  
**Học phần:** Đồ án Phát triển Ứng dụng phía Máy chủ Nâng cao (*Advanced Server-Side Programming Project*)  
**Giảng viên hướng dẫn:** ThS. Lê Văn Minh – ThS. Nguyễn Đình Quý  
**Đề tài:** Hệ thống Quản lý Văn phòng Thông minh ứng dụng Thị giác Máy tính và AIoT (*Smart Office AIoT & Computer Vision Management System*)  
**Nhóm sinh viên thực hiện:**
1. **Bùi Mạnh Tiến** (Trưởng nhóm / Scrum Master – Kiến trúc Core, Module 3 Occupancy, SignalR Realtime, DevOps Docker/CI-CD)
2. **Nguyễn Phúc Thanh** (Phụ trách Module 2 Attendance, Module 4 Security & Night Guard, Giao diện Chấm công & An ninh)
3. **Mai Trí Toàn** (Phụ trách Dịch vụ AI Python ONNX, Module 1 Biometrics, Giao diện Biometrics Studio & Canvas Zone Editor)
4. **Nguyễn Anh Tuấn** (Phụ trách Module 5 Reporting, RBAC Auth, Database 5 Schemas, Giao diện Web Shell & Dashboard Báo cáo)

---

## CHƯƠNG 1. TỔNG QUAN ĐỀ TÀI & PHÂN RÃ PRODUCT BACKLOG (BUỔI 1)

### 1.1. Đặt vấn đề & Mục tiêu hệ thống
Trong các doanh nghiệp hiện đại, việc quản lý chấm công, theo dõi hiệu suất sử dụng không gian làm việc và giám sát an ninh ngoài giờ hành chính thường bị phân mảnh thành nhiều phần mềm rời rạc. Đồ án **Smart Office** giải quyết bài toán này bằng cách kết hợp **Thị giác máy tính (Computer Vision)** với kiến trúc máy chủ hiện đại **Modular Monolith trên nền tảng .NET 10**, lưu trữ đối tượng chuẩn **S3/MinIO** và đóng gói đa container bằng **Docker Compose**.

### 1.2. Phân rã 5 Phân hệ Nghiệp vụ (Bounded Contexts)
Hệ thống được phân rã thành **05 Module độc lập** trong cùng một tiến trình thực thi (`.NET 10 Modular Monolith`):
1. **Module 1 – Biometrics (`SmartOffice.Modules.Biometrics`):** Quản lý phòng ban, hồ sơ nhân sự, kiểm định chất lượng ảnh (Laplace > 100), kiểm tra trùng lặp sinh trắc học ($\text{Cosine Similarity} \ge 0.85$) và định danh khuôn mặt $1:N$ bằng vector 512 chiều (`ArcFace iResNet-50`).
2. **Module 2 – Attendance (`SmartOffice.Modules.Attendance`):** Quản lý ca làm việc, chấm công tự động tại cổng Camera (`GATE`), bộ lọc chống quét trùng lặp trong 5 phút (`Debounce 300s`), quản lý đơn nghỉ phép và tiến trình chốt vắng mặt cuối ngày (`ABSENT`).
3. **Module 3 – Occupancy (`SmartOffice.Modules.Occupancy`):** Quản lý camera bàn làm việc (`DESK`), lưu ảnh hiệu chuẩn góc máy trên MinIO/S3, thiết lập đa giác vùng ảo chuẩn hóa $[0.0, 1.0]$, thuật toán Ray-casting và Máy trạng thái hữu hạn 4 trạng thái (`EMPTY`, `PRESENT`, `TEMP_AWAY`, `PROLONGED_AWAY` + `WRONG_SEAT`) kết hợp lọc nhiễu 3 giây (`Anti-Flicker`) và đóng băng giờ nghỉ trưa (`12:00 – 13:30`).
4. **Module 4 – Security (`SmartOffice.Modules.Security`):** Quản lý đăng ký làm thêm giờ (`OT Registration` hỗ trợ ca vắt qua nửa đêm) và Cây quyết định cảnh báo an ninh trực đêm 3 mức (`LEVEL_1_OT`, `LEVEL_2_UNAUTH`, `LEVEL_3_BREACH` + `SPOOFING_ATTEMPT`).
5. **Module 5 – Reporting (`SmartOffice.Modules.Reporting`):** Xác thực & phân quyền người dùng (`RBAC`: `ADMIN`, `HR`, `DEPT_LEAD`, `SECURITY`), lắng nghe sự kiện từ các module khác để cập nhật bảng tổng hợp Read-Model (`daily_department_summaries`) và xuất báo cáo tháng ra tệp Excel CSV (`UTF-8 BOM`).

---

## CHƯƠNG 2. THIẾT KẾ KIẾN TRÚC MODULAR MONOLITH & CSDL PHÂN RÃ SCHEMA (BUỔI 2 & BUỔI 3)

### 2.1. Cấu trúc Clean Architecture trong từng Module
Mỗi Module trong thư mục `backend/src/Modules/<ModuleName>/` tuân thủ nghiêm ngặt cấu trúc phân tầng:
- **`Domain/`**: Chứa các thực thể nghiệp vụ (`Entities`), quy tắc tính toán thuần túy (`BiometricMath`, `PolygonValidator`, `SeatStateMachine`).
- **`Application/`**: Chứa các `DTOs`, `Services` thực thi Use Cases và `Handlers` xử lý sự kiện tích hợp.
- **`Infrastructure/`**: Chứa `DbContext` riêng biệt của từng Module, ánh xạ vào đúng `Schema` độc lập trên PostgreSQL 16.
- **`Endpoints/`**: Chứa các `ApiController` xuất RESTful API theo chuẩn `/api/v1/<module>/...`.

### 2.2. Thiết kế Cơ sở dữ liệu Phân rã 5 Schema Độc lập
Hệ thống sử dụng **PostgreSQL 16** (tập lệnh khởi tạo tại [`backend/database/01_init_schemas_and_tables.sql`](file:///d:/AI_Engineer_TT/IOT_camrea/backend/database/01_init_schemas_and_tables.sql)) với nguyên tắc cô lập tuyệt đối:
- **Schema `biometrics` (`BiometricsDbContext`):** `departments`, `employees`, `biometric_vectors`.
- **Schema `attendance` (`AttendanceDbContext`):** `shifts`, `attendance_logs`, `leave_requests`.
- **Schema `occupancy` (`OccupancyDbContext`):** `cameras`, `seats`, `seat_occupancy_logs`.
- **Schema `security` (`SecurityDbContext`):** `ot_registrations`, `security_incidents`.
- **Schema `reporting` (`ReportingDbContext`):** `users`, `daily_department_summaries`.

> [!IMPORTANT]
> **Quy tắc Cô lập Kiến trúc (Được kiểm chứng tự động bằng Unit Test):**
> 1. Không một Module nào được phép chứa `ProjectReference` tới một Module nghiệp vụ khác.
> 2. Chỉ sử dụng khóa ngoại vật lý (`FOREIGN KEY`) cho các bảng nằm trong cùng 1 Schema; giữa các bảng khác Schema chỉ lưu khóa tham chiếu logic (`UUID`).
> 3. Hai bài kiểm thử kiến trúc trong [`ArchitectureIsolationTests.cs`](file:///d:/AI_Engineer_TT/IOT_camrea/backend/tests/SmartOffice.UnitTests/ArchitectureIsolationTests.cs) tự động quét Assembly và `DbContext` để chặn mọi hành vi vi phạm ranh giới Module.

---

## CHƯƠNG 3. GIAO TIẾP LIÊN MODULE & TÍCH HỢP AI THỊ GIÁC MÁY TÍNH (BUỔI 4, BUỔI 5 & BUỔI 6)

### 3.1. Hai Phương thức Giao tiếp Liên Module Lỏng (Loose Coupling)
Để 5 Module phối hợp nhịp nhàng mà không phụ thuộc trực tiếp vào nhau, tầng [`SmartOffice.SharedKernel`](file:///d:/AI_Engineer_TT/IOT_camrea/backend/src/Shared/SmartOffice.SharedKernel) và [`SmartOffice.Infrastructure`](file:///d:/AI_Engineer_TT/IOT_camrea/backend/src/Infrastructure/SmartOffice.Infrastructure) cung cấp 2 cơ chế:

1. **Giao tiếp Bất đồng bộ qua `InMemoryEventBus` (Publish / Subscribe):**
   - Cài đặt tại [`InMemoryEventBus.cs`](file:///d:/AI_Engineer_TT/IOT_camrea/backend/src/Infrastructure/SmartOffice.Infrastructure/Events/InMemoryEventBus.cs) và định nghĩa 6 sự kiện tại [`ModuleIntegrationEvents.cs`](file:///d:/AI_Engineer_TT/IOT_camrea/backend/src/Shared/SmartOffice.SharedKernel/Events/ModuleIntegrationEvents.cs):
     - `EmployeeRegisteredIntegrationEvent` (`Biometrics` $\rightarrow$ `Reporting`)
     - `AttendanceCheckedIntegrationEvent` (`Attendance` $\rightarrow$ `Reporting`)
     - `AttendanceAbsentMarkedIntegrationEvent` (`Attendance` $\rightarrow$ `Reporting`)
     - `SeatStateChangedIntegrationEvent` (`Occupancy` $\rightarrow$ `SignalR OccupancyHub`)
     - `ProlongedAbsenceDetectedIntegrationEvent` (`Occupancy` $\rightarrow$ `Reporting` & `SignalR`)
     - `SecurityIncidentDetectedIntegrationEvent` (`Security` $\rightarrow$ `Reporting`)
2. **Giao tiếp Đồng bộ qua Hợp đồng Tra cứu (`Contract Interfaces`):**
   - [`IEmployeeLookupContract`](file:///d:/AI_Engineer_TT/IOT_camrea/backend/src/Shared/SmartOffice.SharedKernel/Contracts/IEmployeeLookupContract.cs): Giúp Module `Attendance`, `Occupancy`, `Security` tra cứu thông tin nhân sự từ Module `Biometrics`.
   - [`IOvertimeLookupContract`](file:///d:/AI_Engineer_TT/IOT_camrea/backend/src/Shared/SmartOffice.SharedKernel/Contracts/IOvertimeLookupContract.cs): Giúp `SecurityIncidentService` kiểm tra nhân viên có lịch đăng ký OT hợp lệ hay không trước khi phát cảnh báo trực đêm.

### 3.2. Cầu nối Đồng bộ 2 Chiều với Dịch vụ AI (`BackendSyncClient`)
Dịch vụ AI (`ai_service/`) vận hành 4 mô hình ONNX (`RT-DETR-L`, `SCRFD`, `MiniFASNet-V2`, `ArcFace iResNet-50`) và giao tiếp với Backend `.NET 10` thông qua [`BackendSyncClient`](file:///d:/AI_Engineer_TT/IOT_camrea/ai_service/shared/backend_client.py):
- Tự động tải cấu hình đa giác vùng bàn chuẩn hóa từ `GET /api/v1/occupancy/cameras/{cameraCode}/zones`.
- Đẩy bất đồng bộ (background thread) trạng thái vị trí ngồi về `POST /api/v1/occupancy/state-sync`.
- Thực hiện luồng chấm công tự động tại cổng (`POST /api/v1/face/gate-checkin` $\rightarrow$ `/biometrics/identify` $\rightarrow$ `/attendance/check`) hoặc báo động giả mạo khuôn mặt (`/security/incidents`).

---

## CHƯƠNG 4. TÍCH HỢP LƯU TRỮ ĐỐI TƯỢNG MINIO/S3 & PRESIGNED URL (BUỔI 7)

### 4.1. Thiết kế Wrapper Service `S3ObjectStorageService`
Hệ thống định nghĩa hợp đồng [`IObjectStorageService`](file:///d:/AI_Engineer_TT/IOT_camrea/backend/src/Shared/SmartOffice.SharedKernel/Storage/IObjectStorageService.cs) và cài đặt thực thi tại [`S3ObjectStorageService.cs`](file:///d:/AI_Engineer_TT/IOT_camrea/backend/src/Infrastructure/SmartOffice.Infrastructure/Storage/S3ObjectStorageService.cs):
- **Chống lỗ hổng Path Traversal:** Hàm `NormalizeAndValidateKey` chuẩn hóa khóa đối tượng và chặn mọi đường dẫn chứa `..` hoặc `//`.
- **Kiểm soát luồng Stream & Toàn vẹn dữ liệu:** Chặn tệp rỗng (`0 byte`), giới hạn kích thước tối đa `25 MB`, tính toán mã băm `SHA-256` (`x-amz-content-sha256`) và đẩy tệp lên Bucket `smartoffice-media` của MinIO/Cloudflare R2 qua phương thức `PUT` ký số chuẩn **AWS Signature V4**.
- **Sinh đường dẫn bảo mật có thời hạn (`Presigned GET URL` & `Presigned PUT URL`):**
  - Cài đặt thuật toán băm 4 tầng `HMAC-SHA256` (`AWS4-HMAC-SHA256`) với thời hạn mặc định **15 phút (`900 giây`)**, đảm bảo Bucket luôn ở chế độ riêng tư (Private) mà trình duyệt Web vẫn xem được ảnh/video bằng chứng.

### 4.2. Phân vùng Lưu trữ Đối tượng trên Bucket `smartoffice-media`
1. `biometrics/{employee_code}/avatar.jpg` & `biometrics/{employee_code}/samples/{pose}_{timestamp}.jpg`: Ảnh đại diện và ảnh mẫu đăng ký khuôn mặt (Module 1).
2. `attendance_snapshots/{yyyy-MM-dd}/{employee_code}_{log_id}.jpg`: Ảnh chụp xác thực lúc chấm công (Module 2).
3. `calibration/{camera_code}_frame.jpg`: Ảnh chụp góc máy Camera phục vụ vẽ đa giác vùng ngồi trên Canvas (Module 3).
4. `security_evidence/{yyyy-MM-dd}/incident_{id}_snapshot.jpg` & `_clip10s.mp4`: Ảnh hiện trường và video bằng chứng 10 giây khi phát hiện đột nhập ban đêm (Module 4).

---

## CHƯƠNG 5. ĐÓNG GÓI ĐA CONTAINER DOCKER COMPOSE & CI/CD JENKINS PIPELINE (BUỔI 8 & BUỔI 9)

### 5.1. Kiến trúc Đa Container trên Mạng Cô lập `smartoffice_net`
Tệp cấu hình [`deploy/docker-compose.yml`](file:///d:/AI_Engineer_TT/IOT_camrea/deploy/docker-compose.yml) đóng gói toàn bộ hệ thống thành **06 Containers** khởi chạy chỉ với 1 lệnh duy nhất (`docker compose -f deploy/docker-compose.yml up -d --build`):
1. **`smartoffice_postgres` (`pgvector/pgvector:pg16` – Cổng `5432`):** Tự động nạp script tạo 5 Schema độc lập và gắn volume `postgres_data`.
2. **`smartoffice_minio` (`elestio/minio:latest` – Cổng `9000`, `9001`):** Tự động tạo bucket `smartoffice-media` và gắn volume `minio_data`.
3. **`smartoffice_backend` (`.NET 10` Multi-stage build – Cổng `5000:8080`):** Chỉ khởi động sau khi `postgres` và `minio` đạt trạng thái `service_healthy`.
4. **`smartoffice_ai_service` (`python:3.12-slim` – Cổng `8000:8000`):** Gắn 2 volume `ai_occupancy_weights` và `ai_face_weights` để lưu bền vững 4 mô hình `.onnx`.
5. **`smartoffice_frontend` (`node:20-alpine` $\rightarrow$ `nginx:alpine` – Cổng `3000:80`):** Đóng gói giao diện React SPA.
6. **`smartoffice_gateway` (`nginx:alpine` – Cổng `80:80`):** Định tuyến tập trung `/`, `/api/`, `/swagger`, `/ai/` và nâng cấp kết nối WebSocket (`Upgrade`) cho `/hubs/occupancy`.

### 5.2. Tự động hóa CI/CD với `Jenkinsfile` và GitHub Actions
Hệ thống trang bị song song cả kịch bản **[`Jenkinsfile`](file:///d:/AI_Engineer_TT/IOT_camrea/Jenkinsfile)** (Declarative Pipeline 7 bước theo đúng đề cương học phần 608819) và **[`.github/workflows/deploy.yml`](file:///d:/AI_Engineer_TT/IOT_camrea/.github/workflows/deploy.yml)**:
- Tự động kích hoạt qua Webhook (`githubPush()`) mỗi khi thành viên merge Pull Request vào nhánh `main`.
- Tự động chạy **8 bài kiểm thử kiến trúc & tích hợp `.NET 10`**, **17 bài kiểm thử đơn vị Python AI**, kiểm tra `oxlint` & build Frontend, build Docker Multi-stage Images, triển khai container và chạy Smoke Test kiểm tra `/api/health`.

---

## CHƯƠNG 6. KẾT QUẢ KIỂM THỬ & ĐÁNH GIÁ THEO CHUẨN ĐẦU RA (CLO1 & CLO2)

| Hạng mục Kiểm thử | Công cụ / Lệnh Thực thi | Kết quả Thực tế |
| :--- | :--- | :---: |
| **Kiểm thử Cô lập Kiến trúc & Nghiệp vụ 5 Module (.NET 10)** | `dotnet test backend/SmartOffice.slnx` | **PASS (8/8 Tests, 0 Warning, 0 Error)** |
| **Kiểm thử Đơn vị Dịch vụ AI (FSM, Ray-casting, Face 512D)** | `python -m unittest discover -s ai_service/tests -v` | **PASS (17/17 Tests OK)** |
| **Kiểm thử Linter & Đóng gói Giao diện Web Frontend** | `npm run lint && npm run build` | **PASS (0 Warning, 0 Error)** |
| **Kiểm thử Vận hành 6 Containers Docker Compose** | `docker compose -f deploy/docker-compose.yml up -d` | **PASS (6/6 Containers Up & Healthy)** |

