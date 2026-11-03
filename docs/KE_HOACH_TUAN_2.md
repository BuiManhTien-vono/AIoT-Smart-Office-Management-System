# Kế hoạch triển khai Tuần 2 - Smart Office (Sprint 2)

> **Phạm vi:** Tuần 2 tương ứng **Sprint 2 (Buổi 6–7)** theo lộ trình Agile/Scrum tại [`docs/00_PRODUCT_BACKLOG_USER_STORIES.md`](./00_PRODUCT_BACKLOG_USER_STORIES.md). Trọng tâm là hoàn thiện **Module Occupancy (Giám sát chỗ ngồi & Vùng ảo)**, **In-Memory Event Bus + SignalR Real-time Hub**, **Object Storage (S3/MinIO/R2)** và **Đăng ký & Tra cứu OT (Security Module - US-SEC-01)**. Phần `ai_service` (Python) được tách biệt qua hợp đồng REST API chuẩn để cập nhật độc lập.

---

## 1. Mục tiêu tuần & Quyết định kiến trúc đã chốt

### 1.1. Mục tiêu trọng tâm
1. **Hoàn thiện Module `Occupancy` (`SmartOffice.Modules.Occupancy`):** CRUD Camera & Bàn làm việc/Vùng ảo (`WORK_DESK`, `RESTRICTED_ZONE`), kiểm định đa giác chuẩn hóa $[0.0, 1.0]$ (`PolygonValidator`), luồng ảnh hiệu chuẩn (`Calibration Frame`), máy trạng thái chỗ ngồi 4 mức (`EMPTY`, `PRESENT`, `TEMP_AWAY`, `PROLONGED_AWAY`) + phát hiện ngồi sai vị trí (`WRONG_SEAT`).
2. **Giao tiếp liên Module & Real-time (`InMemoryEventBus` + `SignalR`):** Phát sự kiện từ `Occupancy` sang `Reporting` (cập nhật `ProlongedAwayEvents` trong bảng `reporting.daily_department_summaries`) và đẩy trạng thái bàn thời gian thực qua SignalR Hub (`/hubs/occupancy`) với độ trễ $\le 1\text{s}$.
3. **Tích hợp Object Storage (`IObjectStorageService`):** Cài đặt adapter lưu trữ chuẩn S3/MinIO/Cloudflare R2 (`S3ObjectStorageService`) hỗ trợ tải tệp qua `Stream` và cấp đường dẫn bảo mật có thời hạn (`Presigned URL`).
4. **Hoàn thiện Đăng ký làm thêm giờ (`US-SEC-01` - `SmartOffice.Modules.Security`):** CRUD đăng ký OT, phê duyệt OT và cung cấp `IOvertimeLookupContract` trong `SharedKernel` để phục vụ cây quyết định trực đêm (Night Guard) ở Tuần 3.

### 1.2. Các quyết định kỹ thuật đã chốt (Không mở lại tranh luận)
* **Quyết định 1 – Kiến trúc AI Service:** Giữ nguyên kiến trúc **Hybrid Modular Monolith + Dedicated Python `ai_service`** theo đúng [`docs/03_THIET_KE_HE_THONG.md`](./03_THIET_KE_HE_THONG.md). Không nhúng ONNX vào `.NET`; `ai_service` (Python FastAPI + YOLOv8-Nano + Shapely) đọc luồng video, tính Ray Casting, lọc nhiễu 15 frames và giao tiếp với `.NET Backend` qua 2 chiều REST API.
* **Quyết định 2 – In-Memory Event Bus:** Giữ nguyên [`InMemoryEventBus`](../backend/src/Infrastructure/SmartOffice.Infrastructure/Events/InMemoryEventBus.cs) tự định nghĩa (đã dùng `IServiceScopeFactory` chuẩn chỉnh và pass Unit Test từ Tuần 1). Không chuyển sang `MediatR` để tránh phụ thuộc thư viện thương mại và giữ đồng nhất toàn bộ 5 module.
* **Quyết định 3 – Đồng bộ Schema PostgreSQL (`snake_case`):** Ánh xạ tường minh tên cột `snake_case` trong các `DbContext` để khớp 100% với [`backend/database/01_init_schemas_and_tables.sql`](../backend/database/01_init_schemas_and_tables.sql), đồng thời vẫn chạy tốt trên `EF Core InMemory` khi chạy Unit Test.

---

## 2. Phân chia nhiệm vụ cho 4 thành viên & Lộ trình theo ngày

Tạm ký hiệu thành viên theo vai trò: `M1`, `M2` (Nhóm Model/AI - cập nhật `ai_service` sau khi chốt API Backend) và `B1`, `B2` (Nhóm Backend & Hạ tầng).

| Thành viên | Nhóm | Nhiệm vụ chính | Đầu ra bàn giao |
| :--- | :--- | :--- | :--- |
| **M1 - Nghiên cứu & Benchmark Model** | Model/AI | Đối chiếu `FR-OCC-01..05` với model `YOLOv8-Nano`; chuẩn bị video kịch bản mẫu (ngồi làm việc, rời bàn < 15p, rời bàn > 15p, ngồi nhầm bàn); đo FPS và độ chính xác điểm đáy bounding box. | Trọng số model, bộ video replay mẫu, tài liệu benchmark FPS/latency và điều kiện ánh sáng/góc máy. |
| **M2 - Pipeline AI & Ray Casting** | Model/AI | Xây dựng pipeline trong `ai_service` (cập nhật ở pha tiếp theo): kéo cấu hình polygon từ `GET /api/v1/occupancy/cameras/{cameraCode}/zones`, tính điểm đáy $P_{\text{bottom}} = (\frac{x_1+x_2}{2W}, \frac{y_2}{H})$, kiểm tra Ray Casting, lọc nhiễu Anti-Flicker 15 frames (3s) và đẩy kết quả về `POST /api/v1/occupancy/state-sync`. | Pipeline Python `desk_camera.py` + `geometry.py`, log xử lý lỗi mạng/timeout, kịch bản chạy Replay end-to-end. |
| **B1 - Occupancy Domain, FSM & API** | Backend | Triển khai `PolygonValidator`, `SeatStateMachine`, `OccupancyService`, `OccupancyController`; xử lý 4-State FSM + `WRONG_SEAT` (qua `IEmployeeLookupContract`), Lunchtime Mute (`12:00–13:30`), cộng dồn `ActiveSecondsToday`, ghi `SeatOccupancyLog` và đồng bộ `snake_case` mapping. | Toàn bộ tầng Application/Endpoints của `SmartOffice.Modules.Occupancy`, Unit Tests cho FSM & Polygon Validator. |
| **B2 - Event Bus, SignalR, Storage & OT** | Backend | Triển khai `S3ObjectStorageService`, `OccupancyHub` (`/hubs/occupancy`), `ProlongedAbsenceDetectedEventHandler` bên `Reporting`, và hoàn thiện `OtService` + `OtController` + `IOvertimeLookupContract` bên `Security`. Đồng bộ biến môi trường Docker Compose. | Storage adapter, SignalR Hub + Event Handlers, API đăng ký/tra cứu OT, Integration Tests liên module. |

### Lộ trình kiểm soát theo ngày (Daily Milestones)
* **Ngày 1–2 (Chốt Contract & Hạ tầng):** Hoàn thành `W2-1` (JSON Contract), `W2-5` (`S3ObjectStorageService` + đồng bộ config) và `W2-2` (CRUD Camera/Seat + `PolygonValidator` + mapping `snake_case`).
* **Ngày 3–4 (Nghiệp vụ cốt lõi & Real-time):** Hoàn thành `W2-3` (`SeatStateMachine` 4 trạng thái + `WRONG_SEAT` + Lunchtime Mute + `state-sync` API), `W2-4` (`OccupancyHub` SignalR + `Reporting` Event Handler) và `W2-6` (OT Registration & Lookup Contract).
* **Ngày 5–6 (Kiểm thử & Nối AI Replay):** Viết đầy đủ Unit/Integration Tests (`xUnit`) cho toàn bộ luồng Backend; sau đó cập nhật `ai_service` chạy video replay gọi vào API `state-sync` và quan sát SignalR/Database.

---

## 3. Hiện trạng nền móng & Mục tiêu hoàn thiện ở Tầng Backend

| Thành phần | Trạng thái đầu Tuần 2 | Hạng mục hoàn thiện trong Tuần 2 |
| :--- | :--- | :--- |
| **Module Occupancy** | Đã có `Camera`, `Seat`, `SeatOccupancyLog` trong [`OccupancyEntities.cs`](../backend/src/Modules/Occupancy/SmartOffice.Modules.Occupancy/Domain/OccupancyEntities.cs) và [`OccupancyDbContext.cs`](../backend/src/Modules/Occupancy/SmartOffice.Modules.Occupancy/Infrastructure/OccupancyDbContext.cs). | Bổ sung `PolygonValidator`, `SeatStateMachine`, `OccupancyDtos`, `IOccupancyService`, `OccupancyService`, `OccupancyController` và ánh xạ cột `snake_case`. |
| **Event Bus & Reporting** | Đã có [`InMemoryEventBus.cs`](../backend/src/Infrastructure/SmartOffice.Infrastructure/Events/InMemoryEventBus.cs) và [`ProlongedAbsenceDetectedIntegrationEvent`](../backend/src/Shared/SmartOffice.SharedKernel/Events/ModuleIntegrationEvents.cs). | Thêm `SeatStateChangedIntegrationEvent`, `WrongSeatDetectedIntegrationEvent`; bổ sung `ProlongedAbsenceDetectedEventHandler` tại module `Reporting`. |
| **SignalR Real-time** | [`Program.cs`](../backend/src/Host/SmartOffice.WebApi/Program.cs) đã gọi `AddSignalR()`. | Tạo `OccupancyHub` (hỗ trợ join group theo `DepartmentId` và `Role`), handler đẩy thông báo real-time và map `/hubs/occupancy` tại `Program.cs`. |
| **Object Storage** | Đã có hợp đồng [`IObjectStorageService.cs`](../backend/src/Shared/SmartOffice.SharedKernel/Storage/IObjectStorageService.cs). | Cài đặt `S3ObjectStorageService` trong `SmartOffice.Infrastructure`, hỗ trợ upload ảnh hiệu chuẩn/snapshot và sinh `Presigned URL`. |
| **Module Security (OT)** | Đã có `OtRegistration`, `SecurityIncident` trong [`SecurityEntities.cs`](../backend/src/Modules/Security/SmartOffice.Modules.Security/Domain/SecurityEntities.cs) và [`SecurityDbContext.cs`](../backend/src/Modules/Security/SmartOffice.Modules.Security/Infrastructure/SecurityDbContext.cs). | Bổ sung `IOvertimeLookupContract` tại `SharedKernel`, cài đặt `OtService`, `OtController` để quản lý và tra cứu lịch tăng ca hợp lệ. |

---

## 4. Chi tiết các hạng mục triển khai Tuần 2 (W2-1 $\rightarrow$ W2-6)

### W2-1. Hợp đồng giao tiếp (API Contract) giữa `ai_service`, `Occupancy` và `UI`

#### Chiều 1: `ai_service` lấy cấu hình đa giác vùng ảo từ Backend
* **Endpoint:** `GET /api/v1/occupancy/cameras/{cameraCode}/zones`
* **Response mẫu (`200 OK`):**
```json
{
  "cameraId": "33333333-3333-3333-3333-333333333302",
  "cameraCode": "CAM_DESK_IT",
  "streamSource": "rtsp://localhost:8554/desk_it",
  "isOnline": true,
  "zones": [
    {
      "seatId": "44444444-4444-4444-4444-444444444401",
      "seatCode": "SEAT_IT_01",
      "zoneType": "WORK_DESK",
      "departmentId": "11111111-1111-1111-1111-111111111101",
      "assignedEmployeeId": "55555555-5555-5555-5555-555555555501",
      "polygonPoints": [
        { "x": 0.12, "y": 0.40 },
        { "x": 0.28, "y": 0.40 },
        { "x": 0.28, "y": 0.65 },
        { "x": 0.12, "y": 0.65 }
      ]
    }
  ]
}
```

#### Chiều 2: `ai_service` đồng bộ trạng thái phát hiện về Backend
* **Endpoint:** `POST /api/v1/occupancy/state-sync`
* **Request mẫu:**
```json
{
  "cameraCode": "CAM_DESK_IT",
  "capturedAtUtc": "2026-11-03T09:15:00Z",
  "frameSequence": 150,
  "observations": [
    {
      "seatCode": "SEAT_IT_01",
      "isOccupied": true,
      "unoccupiedContinuousFrames": 0,
      "unoccupiedContinuousSeconds": 0,
      "detectedEmployeeId": "55555555-5555-5555-5555-555555555501",
      "detectionConfidence": 0.91
    }
  ]
}
```

#### Phân định trách nhiệm xử lý:
1. **`ai_service` (Python):** Phát hiện người bằng YOLOv8-Nano, tính điểm tâm đáy $P_{\text{bottom}}$, kiểm tra điểm nằm trong đa giác bằng Ray Casting, duy trì bộ đếm **Anti-Flicker 15 frames liên tiếp (3 giây)** và gửi trạng thái cảm biến (`isOccupied`, `unoccupiedContinuousFrames`, `detectedEmployeeId`).
2. **`SmartOffice.Modules.Occupancy` (.NET):** Sở hữu toàn bộ quy tắc nghiệp vụ: kiểm tra nhân viên qua [`IEmployeeLookupContract`](../backend/src/Shared/SmartOffice.SharedKernel/Contracts/IEmployeeLookupContract.cs), vận hành máy trạng thái 4 mức (`EMPTY`, `PRESENT`, `TEMP_AWAY`, `PROLONGED_AWAY`) + `WRONG_SEAT`, kiểm tra giờ nghỉ trưa (`12:00–13:30`), cộng dồn `ActiveSecondsToday`, lưu `SeatOccupancyLog` và phát sự kiện.

---

### W2-2. Quản lý Camera, Bàn làm việc & Vùng ảo (`Virtual Zones`)

**Đầu việc:**
* Xây dựng CRUD cho `Camera` (`camera_code` duy nhất, `camera_type` gồm `GATE` | `DESK`, `stream_source`, `calibration_frame_key`, `is_online`).
* Xây dựng endpoint upload ảnh khung hình hiệu chuẩn (`POST /api/v1/occupancy/cameras/{id}/calibration-frame`) lưu qua `IObjectStorageService` theo key chuẩn `calibration/{camera_code}_frame.jpg` và trả về `Presigned URL`.
* Xây dựng CRUD cho `Seat` / `VirtualZone` (`seat_code` duy nhất, `zone_type` gồm `WORK_DESK` | `RESTRICTED_ZONE`, `camera_id`, `department_id`, `assigned_employee_id`, `polygon_points`).
* Cài đặt `PolygonValidator`:
  * Tối thiểu $N \ge 3$ đỉnh.
  * Tọa độ mọi đỉnh chuẩn hóa nghiêm ngặt trong đoạn $[0.0, 1.0]$ (`FR-ADM-01`, `NFR-ACC-02`).
  * Đa giác có diện tích khác $0$ (không suy biến thành đường thẳng/điểm trùng nhau).

**Đặc tả tham chiếu:** [`PROJECT_REQUIREMENTS.md`](../PROJECT_REQUIREMENTS.md) (`FR-ADM-01`, `NFR-ACC-02`), [`docs/00_PRODUCT_BACKLOG_USER_STORIES.md`](./00_PRODUCT_BACKLOG_USER_STORIES.md) (`US-OCC-01`), [`docs/04_THIET_KE_CO_SO_DU_LIEU.md`](./04_THIET_KE_CO_SO_DU_LIEU.md).

---

### W2-3. Máy trạng thái chỗ ngồi (`SeatStateMachine`) & Xử lý Tình huống Biên

**Đầu việc:**
* Cài đặt `SeatStateMachine` thuần khiết (Domain Service dễ kiểm thử đơn vị) với các quy tắc chuyển trạng thái:
  1. **`EMPTY`**: Bàn chưa gán nhân viên (`AssignedEmployeeId == null`) và không có người ngồi $\rightarrow$ giữ `EMPTY`, tắt bộ đếm vắng.
  2. **`PRESENT`**: Có người ngồi tại bàn (`isOccupied == true`) và không vi phạm ngồi sai bàn $\rightarrow$ đặt lại bộ đếm vắng về $0$, cộng dồn $\Delta t$ vào `ActiveSecondsToday`.
  3. **`WRONG_SEAT` (`FR-OCC-05`)**: Có người ngồi tại bàn đã phân bổ cho nhân viên A (`AssignedEmployeeId = A`), nhưng khuôn mặt định danh được là nhân viên B (`DetectedEmployeeId = B != A`) $\rightarrow$ chuyển sang `WRONG_SEAT` và phát cảnh báo nhắc nhở.
  4. **Chống nhấp nháy Anti-Flicker (`FR-OCC-03`)**: Khi bàn đang `PRESENT` (hoặc `WRONG_SEAT`) mà mất tín hiệu người (`isOccupied == false`), nếu thời gian vắng liên tục $< 3\text{ giây}$ (hoặc $< 15\text{ frames}$) thì **giữ nguyên trạng thái hiện tại**, chưa chuyển sang `TEMP_AWAY`.
  5. **`TEMP_AWAY` (`FR-OCC-02`)**: Khi vắng liên tục $\ge 3\text{ giây}$ và $< 900\text{ giây}$ ($15\text{ phút}$) $\rightarrow$ chuyển sang `TEMP_AWAY`.
  6. **Cơ chế Mute giờ nghỉ trưa (`FR-OCC-04`)**: Trong khung giờ `12:00` – `13:30` (theo giờ địa phương/ca làm việc), hệ thống tạm ngắt chuyển đổi sang `PROLONGED_AWAY` (giữ ở `TEMP_AWAY` hoặc `EMPTY` mà không phát cảnh báo).
  7. **`PROLONGED_AWAY` (`FR-OCC-02`, `US-OCC-03`)**: Ngoài giờ nghỉ trưa, nếu thời gian vắng mặt liên tục $\ge 900\text{ giây}$ ($15\text{ phút}$) $\rightarrow$ chuyển sang `PROLONGED_AWAY`, ghi `SeatOccupancyLog` và phát `ProlongedAbsenceDetectedIntegrationEvent` (chỉ phát đúng 1 lần cho mỗi đợt chuyển sang `PROLONGED_AWAY`).
* Chống xử lý lặp / sự kiện đến trễ (Out-of-order protection): Nếu `capturedAtUtc < seat.StateUpdatedAt`, bỏ qua việc lùi trạng thái.

---

### W2-4. Phát Integration Event, Đồng bộ Reporting & Cập nhật Live Seat Map qua SignalR

**Đầu việc:**
* Khi `Seat` đổi trạng thái trong `OccupancyService`:
  * Phát `SeatStateChangedIntegrationEvent` để đẩy cập nhật tức thời qua `OccupancyHub` (`/hubs/occupancy`) tới group phòng ban (`dept:{departmentId}`) và group quản trị (`role:ADMIN`, `role:HR`).
  * Khi chuyển sang `PROLONGED_AWAY`: phát `ProlongedAbsenceDetectedIntegrationEvent`.
  * Khi chuyển sang `WRONG_SEAT`: phát `WrongSeatDetectedIntegrationEvent`.
* Tại `SmartOffice.Modules.Reporting`:
  * Bổ sung `ProlongedAbsenceDetectedEventHandler` vào [`ReportingIntegrationEventHandlers.cs`](../backend/src/Modules/Reporting/SmartOffice.Modules.Reporting/Application/Handlers/ReportingIntegrationEventHandlers.cs) và đăng ký trong [`ReportingModuleExtensions.cs`](../backend/src/Modules/Reporting/SmartOffice.Modules.Reporting/ReportingModuleExtensions.cs) để tự động tăng `ProlongedAwayEvents` trong bảng `reporting.daily_department_summaries`.
* Tại `OccupancyHub`:
  * Hỗ trợ client gọi `JoinDepartmentGroup(Guid departmentId)` và lấy snapshot sơ đồ bàn hiện tại qua `GET /api/v1/occupancy/seat-map?departmentId=...` khi kết nối lại.

---

### W2-5. Tích hợp Object Storage S3-compatible (`Cloudflare R2 / MinIO`)

**Đầu việc:**
* Cài đặt `S3ObjectStorageService` thực thi [`IObjectStorageService`](../backend/src/Shared/SmartOffice.SharedKernel/Storage/IObjectStorageService.cs) trong `SmartOffice.Infrastructure/Storage/`:
  * Chuẩn hóa key đối tượng (không cho phép path traversal `..`, tự động chuẩn hóa dấu `/`).
  * Hỗ trợ chế độ S3/MinIO/R2 thực tế và chế độ Local/In-Memory Storage an toàn khi chạy môi trường Dev/Test chưa cấu hình khóa S3.
  * Sinh `Presigned URL` có thời hạn (`expiryMinutes` mặc định 15 phút) kèm chữ ký HMAC-SHA256.
* Đồng bộ cấu hình `ObjectStorage` giữa `appsettings.json` và `deploy/docker-compose.yml`.

---

### W2-6. Đăng ký và Tra cứu Làm thêm giờ (`US-SEC-01` - Security Module)

**Đầu việc:**
* Định nghĩa `IOvertimeLookupContract` trong `SmartOffice.SharedKernel/Contracts/` để kiểm tra một nhân viên có lịch đăng ký OT đã được duyệt (`APPROVED`) tại một thời điểm bất kỳ hay không.
* Triển khai `OtService` và `OtController` (`/api/v1/security/ot-registrations`) trong `SmartOffice.Modules.Security`:
  * Đăng ký lịch OT mới (kiểm tra nhân viên tồn tại qua `IEmployeeLookupContract`, hỗ trợ cả ca OT trong ngày và ca OT vắt qua nửa đêm).
  * Phê duyệt / Từ chối đơn đăng ký OT (`PENDING` $\rightarrow$ `APPROVED` / `REJECTED`).
  * Tra cứu danh sách OT theo ngày/nhân viên và API kiểm tra nhanh hiệu lực OT tại thời điểm kiểm tra (`GET /api/v1/security/ot-registrations/check`).

---

## 5. Definition of Done (DoD) Tuần 2

1. Toàn bộ Solution `SmartOffice.slnx` biên dịch thành công (`dotnet build` 0 lỗi, 0 cảnh báo).
2. Bài kiểm thử kiến trúc [`ArchitectureIsolationTests.cs`](../backend/tests/SmartOffice.UnitTests/ArchitectureIsolationTests.cs) tiếp tục Pass 100% (5 Module hoàn toàn không tham chiếu trực tiếp lẫn nhau).
3. Bộ kiểm thử tự động (`xUnit`) bao phủ đầy đủ:
   * Kiểm định đa giác `PolygonValidator` (tọa độ chuẩn hóa $[0, 1]$, số đỉnh, đa giác suy biến).
   * Máy trạng thái `SeatStateMachine` & `OccupancyService` (`EMPTY` $\rightarrow$ `PRESENT` $\rightarrow$ `TEMP_AWAY` $\rightarrow$ `PROLONGED_AWAY`, Anti-Flicker `< 3s`, Lunchtime Mute `12:00–13:30`, `WRONG_SEAT`, đồng bộ sự kiện sang `ReportingDbContext`).
   * Dịch vụ `S3ObjectStorageService` (upload stream & sinh Presigned URL).
   * Dịch vụ `OtService` & `IOvertimeLookupContract` (đăng ký, duyệt và tra cứu OT hợp lệ).
4. Tài liệu API Contract trong kế hoạch này sẵn sàng để ghép nối với `ai_service` ở bước tiếp theo.
