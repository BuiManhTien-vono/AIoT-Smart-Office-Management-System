# SƠ ĐỒ PHÂN RÃ CHỨC NĂNG HỆ THỐNG (FUNCTIONAL DECOMPOSITION DIAGRAM - FDD)

> **Đề tài**: Hệ thống Thị giác Máy tính Giám sát Văn phòng Thông minh (Hỗ trợ Chấm công, Giám sát Hiện diện và An ninh Văn phòng)  
> **Tiêu chuẩn áp dụng**: Chuẩn đầu ra CLO2 – Phân tích & Thiết kế Hệ thống Thông tin  
> **Tài liệu liên quan**: [`01_YEU_CAU_HE_THONG.md`](./01_YEU_CAU_HE_THONG.md)

---

## 1. TỔNG QUAN PHÂN RÃ CHỨC NĂNG

Sơ đồ phân rã chức năng (*Functional Decomposition Diagram - FDD* hay *Work Breakdown Structure - WBS chức năng*) chia nhỏ hệ thống **Smart Office Computer Vision System** từ mức tổng quát (Mức 0) thành **5 phân hệ nghiệp vụ chính (Mức 1)** tương ứng 1-1 với kiến trúc **Modular Monolith** trên Backend C# .NET và **25 chức năng nghiệp vụ chi tiết (Mức 2 & Mức 3)**.

---

## 2. SƠ ĐỒ PHÂN RÃ CHỨC NĂNG TỔNG THỂ (MERMAID DIAGRAM)

```mermaid
flowchart TD
    ROOT["HỆ THỐNG THỊ GIÁC MÁY TÍNH GIÁM SÁT VĂN PHÒNG THÔNG MINH"]

    ROOT --> M1["1. Quản lý Hồ sơ & Sinh trắc học (Biometrics)"]
    ROOT --> M2["2. Điểm danh & Chấm công (Attendance)"]
    ROOT --> M3["3. Giám sát Chỗ ngồi & Hiện diện (Occupancy)"]
    ROOT --> M4["4. Kiểm soát An ninh Ngoài giờ (Security)"]
    ROOT --> M5["5. Quản trị Hệ thống, Vùng ảo & Báo cáo (Admin & Reporting)"]

    %% Nhánh 1: Biometrics
    M1 --> M1_1["1.1. Quản lý Hồ sơ Nhân sự (CRUD)"]
    M1 --> M1_2["1.2. Thu nhận Ảnh mẫu Khuôn mặt"]
    M1 --> M1_3["1.3. Kiểm định Chất lượng Ảnh (Laplace & Bbox)"]
    M1 --> M1_4["1.4. Trích xuất Vector 512 chiều (ArcFace L2)"]
    M1 --> M1_5["1.5. Kiểm tra Trùng lặp Sinh trắc (Cosine > 0.85)"]
    M1 --> M1_6["1.6. Lưu trữ Ảnh mẫu R2 & Đồng bộ Chỉ mục"]

    %% Nhánh 2: Attendance
    M2 --> M2_1["2.1. Kiểm tra Thực thể sống (Anti-Spoofing)"]
    M2 --> M2_2["2.2. Định danh Khuôn mặt 1:N (Threshold 0.70)"]
    M2 --> M2_3["2.3. Lọc trùng lặp Cửa sổ Thời gian (Debounce 5p)"]
    M2 --> M2_4["2.4. Chấm công Vào ca & Tính phút Đi muộn"]
    M2 --> M2_5["2.5. Chấm công Ra ca & Tính phút Về sớm"]
    M2 --> M2_6["2.6. Tự động Chốt vắng mặt Cuối ngày (23:59)"]

    %% Nhánh 3: Occupancy
    M3 --> M3_1["3.1. Phát hiện Người & Tọa độ Đáy (YOLOv8-Nano)"]
    M3 --> M3_2["3.2. Kiểm tra Đa giác Bàn (Point-in-Polygon)"]
    M3 --> M3_3["3.3. Máy trạng thái Chỗ ngồi 4 mức (4-State FSM)"]
    M3 --> M3_4["3.4. Lọc nhiễu Cử động nhỏ (15 frames / 3s)"]
    M3 --> M3_5["3.5. Tạm ngắt Giờ nghỉ trưa (Mute 12:00-13:30)"]
    M3 --> M3_6["3.6. Phát hiện Ngồi sai vị trí (Cross-Seating)"]

    %% Nhánh 4: Security
    M4 --> M4_1["4.1. Kích hoạt Chế độ Trực đêm (Night Guard Mode)"]
    M4 --> M4_2["4.2. Phân cấp Cảnh báo theo Cây quyết định (Mức 1-2-3)"]
    M4 --> M4_3["4.3. Báo động Trung tâm SOC & Phóng to Camera"]
    M4 --> M4_4["4.4. Đóng gói Bằng chứng Số (Snapshot + Clip 10s)"]
    M4 --> M4_5["4.5. Gửi Cảnh báo Khẩn cấp qua Telegram Bot"]
    M4 --> M4_6["4.6. Đóng Biên bản Xử lý Sự cố (Acknowledge / False Alarm)"]

    %% Nhánh 5: Admin & Reporting
    M5 --> M5_1["5.1. Thiết lập Đa giác Vùng ảo (Virtual Zone Editor)"]
    M5 --> M5_2["5.2. Cấu hình Ca làm việc & Tham số Ngưỡng"]
    M5 --> M5_3["5.3. Quản lý Tài khoản & Phân quyền RBAC"]
    M5 --> M5_4["5.4. Xuất Báo cáo Bảng công Excel (.xlsx)"]
    M5 --> M5_5["5.5. Thống kê Mật độ Hiện diện & Nhật ký An ninh"]
```

---

## 3. CHI TIẾT PHÂN RÃ TỪNG PHÂN HỆ (MỨC 1 $\rightarrow$ MỨC 3)

### 3.1. Phân hệ 1: Quản lý Hồ sơ & Đăng ký Sinh trắc học (`Biometrics Module`)

```mermaid
flowchart LR
    B0["1. Quản lý Hồ sơ & Sinh trắc học"]
    B0 --> B1["1.1. Quản trị Hồ sơ Hành chính"]
    B1 --> B1_1["1.1.1. Thêm mới / Cập nhật thông tin NV"]
    B1 --> B1_2["1.1.2. Gán phòng ban, ca mặc định & mã bàn (seat_code)"]
    B1 --> B1_3["1.1.3. Tra cứu & Xóa mềm (Soft Delete) nhân sự"]

    B0 --> B2["1.2. Thu thập & Kiểm định Ảnh mặt"]
    B2 --> B2_1["1.2.1. Chụp ảnh trực tiếp từ Webcam / Tải file ảnh"]
    B2 --> B2_2["1.2.2. Kiểm tra duy nhất 1 khuôn mặt & Bbox >= 112x112"]
    B2 --> B2_3["1.2.3. Đánh giá độ sắc nét Laplace (Var > 100)"]

    B0 --> B3["1.3. Trích xuất & Đánh chỉ mục Sinh trắc"]
    B3 --> B3_1["1.3.1. Căn chỉnh 5 điểm mốc (Face Alignment)"]
    B3 --> B3_2["1.3.2. Sinh vector đặc trưng 512 chiều chuẩn hóa L2"]
    B3 --> B3_3["1.3.3. Kiểm tra trùng lặp Cosine Similarity > 0.85"]
    B3 --> B3_4["1.3.4. Lưu ảnh gốc lên Cloudflare R2 & Lưu vector vào DB"]
```

### 3.2. Phân hệ 2: Điểm danh, Chấm công & Quản lý Chuyên cần (`Attendance Module`)

```mermaid
flowchart LR
    A0["2. Điểm danh & Chấm công"]
    A0 --> A1["2.1. Nhận diện Khuôn mặt tại Cửa"]
    A1 --> A1_1["2.1.1. Kiểm tra chống giả mạo (Anti-Spoofing Liveness)"]
    A1 --> A1_2["2.1.2. So khớp 1:N Vector Cosine (Ngưỡng 0.70)"]
    A1 --> A1_3["2.1.3. Phân loại Nhân viên hợp lệ / Khách lạ (UNKNOWN)"]

    A0 --> A2["2.2. Xử lý Logic Chấm công"]
    A2 --> A2_1["2.2.1. Khử trùng lặp theo cửa sổ 5 phút (Debounce 300s)"]
    A2 --> A2_2["2.2.2. Ghi nhận Check-in & Đánh giá ON_TIME / LATE"]
    A2 --> A2_3["2.2.3. Ghi nhận Check-out cuối ngày & Đánh giá EARLY_LEAVE"]

    A0 --> A3["2.3. Quản lý Nghỉ phép & Chốt công"]
    A3 --> A3_1["2.3.1. Đăng ký & Phê duyệt đơn nghỉ phép / Giải trình"]
    A3 --> A3_2["2.3.2. Cronjob 23:59 tự động đánh dấu ABSENT"]
```

### 3.3. Phân hệ 3: Giám sát Trạng thái Chỗ ngồi & Hiện diện (`Occupancy Module`)

```mermaid
flowchart LR
    O0["3. Giám sát Chỗ ngồi & Hiện diện"]
    O0 --> O1["3.1. Phân tích Tương quan Không gian"]
    O1 --> O1_1["3.1.1. Phát hiện cơ thể người (YOLOv8-Nano)"]
    O1 --> O1_2["3.1.2. Trích xuất điểm tâm đáy (Bottom-Center Point)"]
    O1 --> O1_3["3.1.3. Kiểm tra điểm nằm trong đa giác bàn (Ray Casting)"]

    O0 --> O2["3.2. Quản lý Máy trạng thái Bàn (FSM)"]
    O2 --> O2_1["3.2.1. Chuyển đổi 4 trạng thái: EMPTY / PRESENT / TEMP_AWAY / PROLONGED_AWAY"]
    O2 --> O2_2["3.2.2. Cộng dồn thời gian làm việc thực tế tại bàn"]
    O2 --> O2_3["3.2.3. Phát cảnh báo khi vắng mặt liên tục >= 15 phút"]

    O0 --> O3["3.3. Xử lý Tình huống Biên (Edge Cases)"]
    O3 --> O3_1["3.3.1. Bộ lọc chống nhiễu cử động nhỏ (15 frames / 3 giây)"]
    O3 --> O3_2["3.3.2. Tạm ngắt cảnh báo giờ nghỉ trưa (12:00 - 13:30)"]
    O3 --> O3_3["3.3.3. Đối soát khuôn mặt phát hiện ngồi sai bàn (WRONG_SEAT)"]
```

### 3.4. Phân hệ 4: Kiểm soát An ninh Ngoài giờ & Phát hiện Người lạ (`Security Module`)

```mermaid
flowchart LR
    S0["4. Kiểm soát An ninh Ngoài giờ"]
    S0 --> S1["4.1. Giám sát & Phân loại Rủi ro"]
    S1 --> S1_1["4.1.1. Tự động bật Night Guard Mode (19:00 - 06:30, T7, CN, Lễ)"]
    S1 --> S1_2["4.1.2. Đối chiếu danh sách đăng ký OT (Mức 1: APPROVED_OVERTIME)"]
    S1 --> S1_3["4.1.3. Cảnh báo nhân viên ở lại không phép (Mức 2: UNAUTHORIZED_PRESENCE)"]
    S1 --> S1_4["4.1.4. Kích hoạt báo động khẩn cấp người lạ (Mức 3: SECURITY_BREACH)"]

    S0 --> S2["4.2. Phản ứng Sự cố Tức thời (Incident Response)"]
    S2 --> S2_1["4.2.1. Báo động đỏ trên SOC Video Wall & Phóng to Camera"]
    S2 --> S2_2["4.2.2. Chụp Snapshot & Cắt video 10s (-5s/+5s từ Ring Buffer)"]
    S2 --> S2_3["4.2.3. Tải bằng chứng lên Cloudflare R2 & Bắn tin nhắn Telegram Bot"]

    S0 --> S3["4.3. Quản lý Biên bản Sự cố (Ticketing)"]
    S3 --> S3_1["4.3.1. Xác nhận sự cố & Ghi biên bản hiện trường (Acknowledge)"]
    S3 --> S3_2["4.3.2. Đánh dấu báo động giả (False Alarm) & Lưu mẫu huấn luyện lại"]
```

### 3.5. Phân hệ 5: Quản trị Hệ thống, Vùng ảo & Báo cáo (`Admin, Zone & Reporting Module`)

```mermaid
flowchart LR
    R0["5. Quản trị, Vùng ảo & Báo cáo"]
    R0 --> R1["5.1. Bộ biên tập Vùng ảo (Virtual Zone Editor)"]
    R1 --> R1_1["5.1.1. Trích xuất khung hình hiệu chuẩn (Calibration Frame)"]
    R1 --> R1_2["5.1.2. Vẽ đa giác 2D trên Canvas & Gán nhãn Bàn / Vùng cấm"]
    R1 --> R1_3["5.1.3. Chuẩn hóa tọa độ đỉnh về miền [0.0, 1.0]"]

    R0 --> R2["5.2. Quản trị Hệ thống & Phân quyền"]
    R2 --> R2_1["5.2.1. Quản lý tài khoản & Phân quyền theo vai trò (RBAC)"]
    R2 --> R2_2["5.2.2. Cấu hình luồng Camera (Webcam / RTSP / Replay Video)"]
    R2 --> R2_3["5.2.3. Thiết lập tham số ca làm việc & Ngưỡng hệ thống"]

    R0 --> R3["5.3. Kết xuất Báo cáo & Thống kê"]
    R3 --> R3_1["5.3.1. Xuất bảng chấm công tổng hợp định dạng Excel (.xlsx)"]
    R3 --> R3_2["5.3.2. Báo cáo tỷ lệ lấp đầy chỗ ngồi theo khung giờ"]
    R3 --> R3_3["5.3.3. Thống kê lịch sử sự cố an ninh & Tỷ lệ báo động giả"]
```

---

## 4. BẢNG ÁNH XẠ CHỨC NĂNG SANG CẤU TRÚC MÃ NGUỒN (TRACEABILITY MATRIX)

Bảng dưới đây thể hiện sự ánh xạ trực tiếp từ các nhánh trên **Sơ đồ phân rã chức năng** sang các **Module trong Backend C# .NET**, **Pipeline trong Python AI Service** và **Page trong React Frontend**:

| Nhánh Chức năng (FDD) | Module Backend C# .NET (`backend/src/Modules/`) | Tầng Xử lý AI Python (`ai_service/`) | Giao diện React (`frontend/src/pages/`) |
| :--- | :--- | :--- | :--- |
| **1. Quản lý Hồ sơ & Sinh trắc học** | `SmartOffice.Modules.Biometrics` | `core/quality.py`<br>`core/face_engine.py` | `EmployeesPage.tsx` |
| **2. Điểm danh & Chấm công** | `SmartOffice.Modules.Attendance` | `core/anti_spoofing.py`<br>`pipelines/gate_camera.py` | `AttendancePage.tsx` |
| **3. Giám sát Chỗ ngồi & Hiện diện** | `SmartOffice.Modules.Occupancy` | `core/person_detector.py`<br>`core/geometry.py`<br>`pipelines/desk_camera.py` | `SeatMapPage.tsx` |
| **4. Kiểm soát An ninh Ngoài giờ** | `SmartOffice.Modules.Security` | `core/ring_buffer.py`<br>`pipelines/night_guard.py` | `SecurityPage.tsx` |
| **5. Quản trị, Vùng ảo & Báo cáo** | `SmartOffice.Modules.Reporting`<br>`SmartOffice.Infrastructure` | API Calibration Frame | `ZoneEditorPage.tsx`<br>`DashboardPage.tsx` |

