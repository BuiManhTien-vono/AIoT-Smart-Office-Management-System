# THIẾT KẾ KIẾN TRÚC HỆ THỐNG (SYSTEM ARCHITECTURE DESIGN)

> **Đề tài**: Hệ thống Thị giác Máy tính Giám sát Văn phòng Thông minh (Hỗ trợ Chấm công, Giám sát Hiện diện và An ninh Văn phòng)  
> **Tiêu chuẩn áp dụng**: Chuẩn đầu ra CLO1 & CLO2 – Kiến trúc Modular Monolith, Docker Compose, Cloudflare R2/SSL & CI/CD  
> **Tài liệu liên quan**: [`01_YEU_CAU_HE_THONG.md`](./01_YEU_CAU_HE_THONG.md), [`02_SO_DO_PHAN_RA_CHUC_NANG.md`](./02_SO_DO_PHAN_RA_CHUC_NANG.md)

---

## 1. TỔNG QUAN KIẾN TRÚC HỆ THỐNG

Hệ thống được thiết kế theo mô hình **Hybrid Modular Monolith kết hợp Dedicated AI Worker**:

1. **Core Backend (`SmartOffice.WebApi` - C# .NET)**:
   - Áp dụng kiến trúc **Modular Monolith**: Toàn bộ nghiệp vụ quản trị, chấm công, máy trạng thái chỗ ngồi, an ninh và báo cáo được chia thành 5 module độc lập (`Biometrics`, `Attendance`, `Occupancy`, `Security`, `Reporting`), chạy chung trong một tiến trình `.NET` duy nhất.
   - Giảm thiểu độ trễ giao tiếp mạng nội bộ, đồng thời giữ ranh giới miền (*Domain Boundaries*) chặt chẽ để dễ dàng tách thành Microservices khi mở rộng quy mô.
2. **AI & Computer Vision Service (`ai_service` - Python)**:
   - Tách riêng thành một dịch vụ chuyên biệt sử dụng **PyTorch CUDA**, **InsightFace (ArcFace 512D)**, **YOLOv8-Nano** và **OpenCV** chạy trên GPU **NVIDIA GeForce GTX 1650**.
   - Đảm nhận việc đọc luồng video thời gian thực (Webcam / RTSP / Replay Video), suy luận AI và gửi sự kiện đã tinh lọc sang Backend C# .NET.
3. **Frontend Dashboard (`frontend` - React + TypeScript)**:
   - Ứng dụng đơn trang (SPA) cung cấp công cụ vẽ đa giác bàn làm việc (*Virtual Zone Editor* trên HTML5 Canvas), sơ đồ văn phòng thời gian thực (*Live Seat Map*) và màn hình giám sát an ninh (*SOC Video Wall*) nhận dữ liệu tức thời qua **SignalR WebSocket**.
4. **Hạ tầng Lưu trữ & Đám mây**:
   - **PostgreSQL 16**: Lưu trữ dữ liệu giao dịch có cấu trúc và vector sinh trắc học.
   - **Cloudflare R2 (tương thích S3 API)**: Lưu trữ đám mây (10GB miễn phí) cho ảnh mẫu khuôn mặt, ảnh chụp vi phạm và video bằng chứng 10 giây.
   - **Cloudflare DNS & Full (Strict) SSL**: Bảo mật tên miền `.id.vn` từ trình duyệt tới máy chủ VPS.

---

## 2. SƠ ĐỒ KIẾN TRÚC TỔNG THỂ (HIGH-LEVEL ARCHITECTURE DIAGRAM)

```mermaid
flowchart TB
    subgraph ClientLayer["TẦNG NGƯỜI DÙNG & THIẾT BỊ (CLIENT & EDGE)"]
        Browser["Trình duyệt Web (Admin / HR / Lead / Security)"]
        TelegramApp["Ứng dụng Telegram (Nhóm Trực ban An ninh)"]
        CamGate["Camera Cửa / Sảnh (Webcam / IP Cam)"]
        CamDesk["Camera Phòng làm việc (Góc rộng / Điện thoại / Replay)"]
    end

    subgraph CloudflareLayer["TẦNG BẢO MẬT & PHÂN PHỐI (CLOUDFLARE)"]
        CF_DNS["Cloudflare DNS (Domain .id.vn)"]
        CF_SSL["Cloudflare Edge Proxy (HTTPS / TLS 1.3)"]
    end

    subgraph VPS_Docker["MÁY CHỦ VPS / WORKSTATION (DOCKER COMPOSE NETWORK)"]
        Nginx["Nginx Reverse Proxy (Origin CA Certificate)"]
        ReactUI["Frontend Container (React + TypeScript + Canvas)"]

        subgraph DotNetBackend["Backend Container: C# .NET Modular Monolith"]
            APIHost["SmartOffice.WebApi Host + SignalR Hub"]
            ModBio["Module: Biometrics"]
            ModAtt["Module: Attendance"]
            ModOcc["Module: Occupancy (FSM)"]
            ModSec["Module: Security"]
            ModRep["Module: Reporting"]
            Infra["SmartOffice.Infrastructure (EF Core, S3 Client, Telegram Client)"]
        end

        subgraph PythonAI["AI Service Container: Python 3.12 (GPU GTX 1650 CUDA)"]
            FastAPI_AI["FastAPI AI Controller"]
            FacePipe["Face Pipeline (SCRFD + Anti-Spoof + ArcFace 512D)"]
            YoloPipe["Occupancy Pipeline (YOLOv8-Nano + Ray Casting)"]
            RingBuf["Circular Ring Buffer (RAM 150 frames - 10s Video)"]
        end

        Postgres[("PostgreSQL 16 Database")]
    end

    subgraph ExternalCloud["DỊCH VỤ ĐÁM MÂY BÊN NGOÀI (EXTERNAL CLOUD)"]
        R2Storage[("Cloudflare R2 / MinIO (Object Storage - S3 API)")]
        TelegramAPI["Telegram Bot API Gateway"]
    end

    %% Luồng kết nối
    Browser -->|"HTTPS (443)"| CF_DNS --> CF_SSL
    CF_SSL -->|"TLS (Origin CA)"| Nginx
    Nginx -->|"Static / SPA"| ReactUI
    Nginx -->|"REST /api/* & WebSocket /hub/*"| APIHost

    CamGate -->|"RTSP / USB / HTTP"| FacePipe
    CamDesk -->|"RTSP / HTTP / MP4"| YoloPipe
    CamDesk --> RingBuf

    FacePipe -->|"HTTP Event (Check-in / Unknown)"| APIHost
    YoloPipe -->|"HTTP Event (Seat Occupancy)"| APIHost
    APIHost <-->|"REST (Verify / Calibrate / Extract Clip)"| FastAPI_AI

    APIHost --> ModBio & ModAtt & ModOcc & ModSec & ModRep
    ModBio & ModAtt & ModOcc & ModSec & ModRep --> Infra

    Infra -->|"EF Core (TCP 5432)"| Postgres
    Infra -->|"S3 SDK (PUT/GET Pre-signed URL)"| R2Storage
    RingBuf -->|"Upload MP4 10s"| R2Storage
    Infra -->|"Webhook HTTPS"| TelegramAPI --> TelegramApp
```

---

## 3. KIẾN TRÚC NỘI BỘ BACKEND C# .NET (MODULAR MONOLITH)

Mỗi module trong thư mục `backend/src/Modules/` tuân thủ nghiêm ngặt kiến trúc **Clean Architecture** gồm 4 lớp:

```mermaid
flowchart LR
    subgraph ModuleStructure["Cấu trúc chuẩn 1 Module (VD: SmartOffice.Modules.Occupancy)"]
        EP["Endpoints Layer (Controllers / SignalR)"]
        APP["Application Layer (Use Cases, Services, DTOs, FSM Logic)"]
        DOM["Domain Layer (Entities, Value Objects, Enums, Domain Rules)"]
        INF["Infrastructure Layer (EF Configurations, Repositories)"]

        EP --> APP
        APP --> DOM
        INF --> APP
        INF --> DOM
    end

    Shared["SmartOffice.SharedKernel (BaseEntity, Result, IEventBus)"]
    DOM -.-> Shared
```

### Nguyên tắc giao tiếp giữa các Module:
1. **Cô lập dữ liệu (Database Isolation)**: Mỗi module quản lý nhóm bảng (Entities) riêng thông qua cấu hình schema/table prefix trong EF Core. Không một module nào được phép truy vấn trực tiếp `DbSet` nội bộ của module khác.
2. **Giao tiếp qua Hợp đồng (Contract / In-Process Event Bus)**:
   - Khi `Attendance Module` ghi nhận nhân viên A đã Check-in vào ca sáng, nó phát một sự kiện nội bộ `EmployeeCheckedInEvent`.
   - `Occupancy Module` lắng nghe sự kiện này để kích hoạt theo dõi vị trí bàn làm việc của nhân viên A từ trạng thái `EMPTY` sang chờ `PRESENT`.

---

## 4. SƠ ĐỒ TUẦN TỰ CÁC LUỒNG NGHIỆP VỤ TRỌNG TÂM (SEQUENCE DIAGRAMS)

### 4.1. Luồng 1: Đăng ký Khuôn mặt & Kiểm tra Trùng lặp Sinh trắc

```mermaid
sequenceDiagram
    actor HR as Chuyên viên HR
    participant UI as React Frontend
    participant API as .NET Biometrics Module
    participant AI as Python AI Service
    participant R2 as Cloudflare R2 (S3)
    participant DB as PostgreSQL

    HR->>UI: Nhập hồ sơ NV & tải lên 3-5 ảnh mặt
    UI->>API: POST /api/v1/biometrics/register
    API->>AI: POST /internal/face/extract-and-validate
    AI->>AI: 1. Kiểm tra đúng 1 khuôn mặt & Bbox >= 112x112
    AI->>AI: 2. Tính độ sắc nét Laplace Var > 100
    alt Ảnh mờ (Score <= 100) hoặc sai quy cách
        AI-->>API: Trả lỗi: BLURRY_IMAGE / INVALID_FACE
        API-->>UI: Yêu cầu HR chụp lại ảnh rõ nét
    else Ảnh đạt chuẩn chất lượng
        AI->>AI: 3. Căn chỉnh 5 điểm mốc & Trích xuất Vector 512D chuẩn hóa L2
        AI-->>API: Trả về Vector 512D
        API->>DB: Truy vấn danh sách Vector hiện có
        API->>API: 4. Tính Cosine Similarity với toàn bộ NV
        alt Tồn tại Similarity > 0.85 (Trùng sinh trắc)
            API-->>UI: Cảnh báo: DUPLICATE_BIOMETRIC (Nghi ngờ trùng hồ sơ)
        else Hợp lệ (Similarity <= 0.85)
            API->>R2: 5. Upload ảnh mẫu gốc lên Bucket R2
            API->>DB: 6. Lưu thông tin NV & Vector 512D
            API->>AI: 7. Đồng bộ Vector mới vào RAM Index của AI Service
            API-->>UI: Thông báo Đăng ký thành công (201 Created)
        end
    end
```

---

### 4.2. Luồng 2: Điểm danh Vào ca Không chạm (Check-in & Debounce 5 phút)

```mermaid
sequenceDiagram
    actor Emp as Nhân viên
    participant Cam as Camera Cửa
    participant AI as Python AI Service
    participant API as .NET Attendance Module
    participant DB as PostgreSQL
    participant UI as React Dashboard (SignalR)

    Emp->>Cam: Đi qua khu vực cửa sảnh
    Cam->>AI: Truyền khung hình (Frame)
    AI->>AI: 1. Kiểm tra Anti-Spoofing (Liveness)
    alt Phát hiện giả mạo (Ảnh in / Điện thoại)
        AI->>API: POST /api/v1/security/spoofing-alert (Kèm Snapshot)
        API->>UI: Push cảnh báo SPOOFING_ATTEMPT
    else Thực thể sống hợp lệ
        AI->>AI: 2. Trích xuất Vector 512D & So khớp 1:N (Max Cosine >= 0.70)
        AI->>API: POST /api/v1/attendance/events (EmployeeId, Score, Timestamp)
        API->>DB: 3. Kiểm tra thời점 quét gần nhất (T_last)
        alt Delta_t < 300 giây (5 phút - Debounce)
            API-->>AI: 200 OK (Ignored - Debounced)
        else Delta_t >= 300 giây (Lượt chấm công hợp lệ)
            API->>DB: Lấy thông tin Ca làm việc (T_start, T_grace = 15p)
            API->>API: 4. Đánh giá ON_TIME hoặc LATE (Tính số phút muộn)
            API->>DB: Lưu bản ghi AttendanceLog
            API->>UI: Push sự kiện Check-in qua SignalR Hub
        end
    end
```

---

### 4.3. Luồng 3: Giám sát Chỗ ngồi Thời gian thực (4-State FSM)

```mermaid
sequenceDiagram
    participant Cam as Camera Phòng
    participant AI as Python AI Service (YOLOv8n)
    participant API as .NET Occupancy Module
    participant DB as PostgreSQL
    participant UI as React Live Seat Map

    loop Mỗi khung hình (15-25 FPS)
        Cam->>AI: Khung hình không gian làm việc
        AI->>AI: 1. YOLOv8-Nano phát hiện người -> Tọa độ đáy (x, y_bottom)
        AI->>AI: 2. Ray Casting kiểm tra điểm nằm trong Đa giác bàn P_seat
        AI->>AI: 3. Lọc nhiễu cử động nhỏ (Duy trì >= 15 frames / 3s)
    end

    AI->>API: POST /api/v1/occupancy/state-sync (Danh sách trạng thái các bàn)
    API->>API: Kiểm tra khung giờ Nghỉ trưa (12:00 - 13:30 -> Mute)
    alt Có người tại bàn
        API->>API: Chuyển trạng thái -> PRESENT (Màu Xanh), Reset bộ đếm vắng = 0
    else Không có người tại bàn (t < 15 phút)
        API->>API: Chuyển trạng thái -> TEMP_AWAY (Màu Vàng cam)
    else Vắng mặt liên tục (t >= 15 phút) & Ngoài giờ nghỉ trưa
        API->>API: Chuyển trạng thái -> PROLONGED_AWAY (Đỏ nhấp nháy)
        API->>DB: Ghi log sự cố vắng mặt quá hạn
        API->>UI: Gửi thông báo cảnh báo tới Trưởng bộ phận
    end
    API->>UI: Broadcast trạng thái Seat Map qua SignalR (< 1s)
```

---

### 4.4. Luồng 4: Kiểm soát An ninh Ngoài giờ & Đóng gói Bằng chứng Số 10s

```mermaid
sequenceDiagram
    actor Intruder as Đối tượng Xâm nhập
    participant AI as Python AI Service (Night Guard)
    participant R2 as Cloudflare R2 Storage
    participant API as .NET Security Module
    participant Tele as Telegram Bot API
    participant SOC as Màn hình Trực ban SOC

    Note over AI,API: Chế độ Trực đêm kích hoạt (19:00 - 06:30 / T7, CN, Lễ)
    Intruder->>AI: Xuất hiện trong vùng Camera
    AI->>AI: Lưu liên tục Frame vào Ring Buffer RAM (150 frames)
    AI->>AI: Phát hiện người & Nhận diện khuôn mặt
    alt Nhận diện là Nhân viên (S_max >= 0.70)
        AI->>API: Kiểm tra đăng ký OT (EmployeeId)
        API->>API: Có OT -> Ghi log APPROVED_OVERTIME (Mức 1)<br/>Không OT -> Cảnh báo Mức 2 (UNAUTHORIZED_PRESENCE)
    else Không nhận diện được / Người lạ (UNKNOWN) -> CẢNH BÁO MỨC 3
        AI->>AI: 1. Chụp 01 ảnh Snapshot rõ nét nhất
        AI->>AI: 2. Thu thêm 5s tiếp theo -> Ghép với 5s trước từ Ring Buffer thành Clip 10s (.mp4)
        AI->>API: POST /api/v1/security/incidents (Snapshot + Video 10s)
        API->>R2: 3. Upload Snapshot & Video 10s lên Cloudflare R2
        API->>SOC: 4. SignalR: Bật giao diện Đỏ, Hú còi, Phóng to Camera vi phạm
        API->>Tele: 5. Gửi tin nhắn Khẩn cấp + Ảnh chụp tới Telegram Nhóm Bảo vệ
        SOC->>API: 6. Bảo vệ kiểm tra hiện trường & Đóng Ticket (Acknowledge / False Alarm)
    end
```

---

## 5. THIẾT KẾ TRIỂN KHAI HẠ TẦNG, MẠNG & CI/CD (DEPLOYMENT VIEW)

### 5.1. Mô hình Bảo mật SSL/TLS qua Cloudflare và Nginx VPS

```mermaid
flowchart LR
    User["Người dùng (Browser)"]
    CF["Cloudflare Edge Proxy (DNS: *.id.vn)"]
    Nginx["Nginx Container (Port 80/443)"]
    DotNet["Backend .NET Container (Port 8080)"]
    React["Frontend Nginx Container (Port 80)"]

    User -->|"1. HTTPS (TLS 1.3 - Cloudflare Universal CA)"| CF
    CF -->|"2. HTTPS Full Strict (Cloudflare Origin CA Certificate)"| Nginx
    Nginx -->|"3. HTTP Internal (/api, /hub)"| DotNet
    Nginx -->|"4. HTTP Internal (/)"| React
```

### 5.2. Quy trình Tự động hóa CI/CD (GitHub Actions)

```mermaid
flowchart LR
    Dev["Lập trình viên Push Code (main)"] --> GHA["GitHub Actions Runner"]
    GHA --> Step1["1. Build & Unit Test .NET (xUnit)"]
    Step1 --> Step2["2. Build & Check TypeScript React"]
    Step2 --> Step3["3. Build & Push Docker Images lên GHCR"]
    Step3 --> Step4["4. SSH vào VPS -> Docker Compose Pull & Up -d"]
```

---

## 6. BẢNG TỔNG HỢP CÔNG NGHỆ SỬ DỤNG TRONG HỆ THỐNG

| Tầng (Layer) | Thành phần Kỹ thuật | Phiên bản / Công nghệ | Lý do lựa chọn cho Đồ án |
| :--- | :--- | :--- | :--- |
| **Backend Core** | Framework & Runtime | **C# .NET 10 / 9 (ASP.NET Core WebAPI)** | Hiệu năng cực cao, hỗ trợ hoàn hảo kiến trúc Modular Monolith, kiểu dữ liệu chặt chẽ. |
| **Real-time** | Giao thức thời gian thực | **ASP.NET Core SignalR** | Đồng bộ trạng thái bàn làm việc và báo động đỏ dưới 1 giây qua WebSockets. |
| **AI Service** | Thị giác máy tính | **Python 3.12 + FastAPI + OpenCV** | Tận dụng hệ sinh thái AI chuẩn công nghiệp trên card rời NVIDIA GTX 1650 (CUDA). |
| **Model Khuôn mặt** | Face Recognition | **InsightFace (SCRFD + ArcFace 512D)** | Độ chính xác hàng đầu thế giới, trích xuất vector chuẩn hóa $L_2$ nhanh và ổn định. |
| **Model Phát hiện người** | Object Detection | **Ultralytics YOLOv8-Nano / YOLO11-Nano** | Mô hình siêu nhẹ (~6MB), đạt 25+ FPS dễ dàng trên GTX 1650 4GB VRAM. |
| **Frontend** | Giao diện Quản trị | **React + TypeScript (Vite) + HTML5 Canvas** | Tương tác vẽ đa giác mượt mà, cập nhật DOM thời gian thực không giật lag. |
| **Database** | Cơ sở dữ liệu quan hệ | **PostgreSQL 16 + Entity Framework Core** | Hỗ trợ lưu trữ JSONB (cho tọa độ đa giác bàn) và mảng số thực hiệu quả. |
| **Object Storage** | Lưu trữ tệp đa phương tiện | **Cloudflare R2 (AWS S3 SDK) / MinIO** | Miễn phí 10GB lưu trữ và miễn phí băng thông tải ra (Zero Egress Fee). |
| **Cloud & DevOps** | Đóng gói & Triển khai | **Docker Compose + Nginx + Cloudflare + GitHub Actions** | Đảm bảo chuẩn đầu ra CLO1, tự động hóa hoàn toàn từ lúc code đến lúc lên VPS. |

