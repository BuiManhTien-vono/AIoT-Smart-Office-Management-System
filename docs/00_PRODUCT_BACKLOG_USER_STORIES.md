# PRODUCT BACKLOG & DANH SÁCH USER STORIES (AGILE / SCRUM)
**Học phần:** Đồ án Phát triển Ứng dụng phía Máy chủ Nâng cao (`608819`)  
**Đề tài:** Hệ thống Thị giác Máy tính Giám sát Văn phòng Thông minh  
**Kiến trúc:** Backend C# .NET Modular Monolith + PostgreSQL (Multi-Schema) + MinIO/S3  

---

## 1. Phân chia Epic theo Ranh giới Module (Bounded Contexts)

Hệ thống được chia thành **5 Epics** tương ứng với **5 Modules độc lập** trong kiến trúc Modular Monolith:

| Mã Epic | Tên Epic | Module Backend (.NET) | Schema CSDL riêng | DbContext độc lập |
| :--- | :--- | :--- | :--- | :--- |
| **EPIC-01** | Quản lý Hồ sơ & Sinh trắc học Khuôn mặt | `SmartOffice.Modules.Biometrics` | `biometrics` | `BiometricsDbContext` |
| **EPIC-02** | Điểm danh & Chấm công Tự động | `SmartOffice.Modules.Attendance` | `attendance` | `AttendanceDbContext` |
| **EPIC-03** | Giám sát Hiện diện & Trạng thái Chỗ ngồi | `SmartOffice.Modules.Occupancy` | `occupancy` | `OccupancyDbContext` |
| **EPIC-04** | Kiểm soát An ninh Ngoài giờ & Sự cố | `SmartOffice.Modules.Security` | `security` | `SecurityDbContext` |
| **EPIC-05** | Quản trị Hệ thống, Tài khoản & Báo cáo | `SmartOffice.Modules.Reporting` | `reporting` | `ReportingDbContext` |

---

## 2. Bảng Product Backlog & Danh sách User Stories Chi tiết

Cấu trúc chuẩn User Story: **"Là một `<Vai trò>`, tôi muốn `<Chức năng>`, để `<Lợi ích nghiệp vụ>`"**.

### EPIC-01: Quản lý Hồ sơ & Sinh trắc học Khuôn mặt (`Biometrics Module`)

| Mã US | User Story | Tiêu chí Chấp nhận (Acceptance Criteria) | Ưu tiên | Điểm (SP) | Sprint |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **US-BIO-01** | **Là một** Chuyên viên Nhân sự (HR), **tôi muốn** thêm mới, cập nhật và khóa hồ sơ nhân viên, **để** quản lý danh sách nhân sự đang làm việc theo từng phòng ban. | - Tạo mới nhân viên với mã NV duy nhất (`employee_code`).<br>- Hỗ trợ xóa mềm (`is_active = false`) khi nghỉ việc.<br>- Phát sự kiện `EmployeeRegisteredIntegrationEvent` sang các module khác. | High | 3 | Sprint 1 |
| **US-BIO-02** | **Là một** Chuyên viên Nhân sự (HR), **tôi muốn** tải lên 3–5 ảnh khuôn mặt mẫu cho mỗi nhân viên, **để** hệ thống lưu trữ trên MinIO/S3 và trích xuất dữ liệu nhận diện. | - Ảnh mẫu được upload qua Stream lên bucket MinIO/S3.<br>- Sinh được đường dẫn bảo mật (`Presigned URL`) có thời hạn để xem lại ảnh.<br>- Lưu vector đặc trưng 512 chiều vào bảng `biometrics.biometric_vectors`. | High | 5 | Sprint 1 |
| **US-BIO-03** | **Là một** Chuyên viên Nhân sự (HR), **tôi muốn** hệ thống tự động cảnh báo nếu khuôn mặt mới đăng ký trùng với nhân viên đã có, **để** tránh tạo trùng lặp hồ sơ nhân sự. | - So khớp vector khuôn mặt mới với các vector hiện có.<br>- Nếu độ tương đồng > 85%, trả về lỗi nghiệp vụ `DuplicateBiometricException` kèm mã nhân viên bị trùng. | Medium | 3 | Sprint 1 |

---

### EPIC-02: Điểm danh & Chấm công Tự động (`Attendance Module`)

| Mã US | User Story | Tiêu chí Chấp nhận (Acceptance Criteria) | Ưu tiên | Điểm (SP) | Sprint |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **US-ATT-01** | **Là một** Quản trị viên / HR, **tôi muốn** cấu hình thông tin ca làm việc (giờ vào, giờ tan ca, số phút cho phép trễ), **để** hệ thống có cơ sở tự động tính toán đi muộn/về sớm. | - CRUD bảng `attendance.shifts`.<br>- Cho phép thiết lập thời gian ân hạn (`grace_minutes`, mặc định 15 phút) và giờ nghỉ trưa. | High | 2 | Sprint 1 |
| **US-ATT-02** | **Là một** Nhân viên văn phòng, **tôi muốn** được tự động ghi nhận chấm công khi bước qua cửa sảnh, **để** không phải xếp hàng quẹt thẻ hay bấm vân tay. | - Nhận sự kiện nhận diện từ camera cửa.<br>- Lọc trùng lặp trong cửa sổ 5 phút (`Debounce 300s`).<br>- Tự động phân loại `ON_TIME` hoặc `LATE` và tính số phút đi muộn. | High | 5 | Sprint 1 |
| **US-ATT-03** | **Là một** Chuyên viên Nhân sự (HR), **tôi muốn** đăng ký đơn nghỉ phép đã duyệt cho nhân viên, **để** hệ thống không tính vắng mặt không phép vào cuối ngày. | - Lưu đơn nghỉ phép vào `attendance.leave_requests`.<br>- Tiến trình chốt công cuối ngày tự động đối chiếu đơn nghỉ phép trước khi gán trạng thái `ABSENT`. | Medium | 3 | Sprint 2 |

---

### EPIC-03: Giám sát Hiện diện & Trạng thái Chỗ ngồi (`Occupancy Module`)

| Mã US | User Story | Tiêu chí Chấp nhận (Acceptance Criteria) | Ưu tiên | Điểm (SP) | Sprint |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **US-OCC-01** | **Là một** Quản trị viên, **tôi muốn** quản lý danh sách camera và vẽ tọa độ đa giác vị trí từng bàn làm việc, **để** hệ thống biết vùng không gian của từng chỗ ngồi. | - Lưu thông tin camera (`occupancy.cameras`) và tọa độ đa giác chuẩn hóa (`JSONB`) vào bảng `occupancy.seats`.<br>- Gán bàn làm việc cho nhân viên cụ thể. | High | 5 | Sprint 2 |
| **US-OCC-02** | **Là một** Trưởng bộ phận, **tôi muốn** xem sơ đồ chỗ ngồi của phòng mình đổi màu trực tiếp theo trạng thái hiện diện, **để** nắm bắt tình hình làm việc thực tế mà không xâm phạm đời tư. | - Chuyển đổi giữa 4 trạng thái: `EMPTY`, `PRESENT`, `TEMP_AWAY` (< 15 phút), `PROLONGED_AWAY` (>= 15 phút).<br>- Tự động tạm dừng cảnh báo vắng mặt trong giờ nghỉ trưa (12:00 – 13:30). | High | 5 | Sprint 2 |
| **US-OCC-03** | **Là một** Trưởng bộ phận, **tôi muốn** nhận cảnh báo khi nhân viên rời vị trí làm việc quá 15 phút liên tục, **để** kịp thời nhắc nhở và điều phối công việc. | - Ghi nhận lịch sử chuyển trạng thái vào `occupancy.seat_occupancy_logs`.<br>- Phát sự kiện `ProlongedAbsenceDetectedEvent` qua In-memory Event Bus và đẩy thông báo qua SignalR. | Medium | 3 | Sprint 2 |

---

### EPIC-04: Kiểm soát An ninh Ngoài giờ & Sự cố (`Security Module`)

| Mã US | User Story | Tiêu chí Chấp nhận (Acceptance Criteria) | Ưu tiên | Điểm (SP) | Sprint |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **US-SEC-01** | **Là một** Chuyên viên Nhân sự / Trưởng BP, **tôi muốn** đăng ký danh sách nhân viên làm thêm ngoài giờ (OT), **để** hệ thống an ninh nhận biết người được phép ở lại văn phòng ban đêm. | - Lưu lịch đăng ký tăng ca vào `security.ot_registrations`.<br>- Hỗ trợ tra cứu nhanh nhân viên có lịch OT hợp lệ theo ngày và khung giờ. | High | 3 | Sprint 2 |
| **US-SEC-02** | **Là một** Nhân viên An ninh, **tôi muốn** nhận báo động tức thời kèm ảnh chụp và video 10 giây khi có người lạ đột nhập ngoài giờ, **để** kịp thời kiểm tra hiện trường. | - Phân loại 3 mức cảnh báo (Mức 1: Có OT, Mức 2: Nhân viên không đăng ký OT, Mức 3: Người lạ đột nhập).<br>- Lưu ảnh snapshot và video 10s lên MinIO/S3, sinh `Presigned URL` và lưu vào `security.security_incidents`. | High | 5 | Sprint 3 |
| **US-SEC-03** | **Là một** Nhân viên An ninh, **tôi muốn** xác nhận xử lý sự cố hoặc đánh dấu báo động nhầm kèm ghi chú biên bản, **để** đóng hồ sơ sự cố an ninh. | - Cập nhật trạng thái ticket (`ACKNOWLEDGED` hoặc `FALSE_ALARM`), lưu nội dung xử lý (`resolution_note`) và thời gian đóng sự cố. | Medium | 2 | Sprint 3 |

---

### EPIC-05: Quản trị Hệ thống, Tài khoản & Báo cáo (`Reporting Module`)

| Mã US | User Story | Tiêu chí Chấp nhận (Acceptance Criteria) | Ưu tiên | Điểm (SP) | Sprint |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **US-REP-01** | **Là một** Quản trị viên, **tôi muốn** quản lý tài khoản đăng nhập và phân quyền theo 4 vai trò (`ADMIN`, `HR`, `DEPT_LEAD`, `SECURITY`), **để** bảo mật dữ liệu theo từng bộ phận. | - Xác thực bằng JWT Token, mật khẩu băm BCrypt.<br>- Cô lập dữ liệu theo phòng ban đối với vai trò `DEPT_LEAD`. | High | 3 | Sprint 1 |
| **US-REP-02** | **Là một** Chuyên viên Nhân sự (HR), **tôi muốn** tổng hợp và xuất báo cáo chấm công, tỷ lệ hiện diện chỗ ngồi theo tháng, **để** phục vụ tính lương và đánh giá chuyên cần. | - Lắng nghe các Integration Events từ module `Attendance`, `Occupancy`, `Security` để cập nhật bảng tổng hợp `reporting.daily_department_summaries` và xuất báo cáo. | Medium | 5 | Sprint 3 |

---

## 3. Kế hoạch Phân bổ Sprint (Sprint Planning)

- **Sprint 1 (Buổi 3 – Buổi 5):** Hoàn thiện Base Architecture, Module `Biometrics` (Hồ sơ & Khuôn mặt), Module `Attendance` (Ca làm việc & Chấm công), Xác thực phân quyền cơ bản.
- **Sprint 2 (Buổi 6 – Buổi 7):** Triển khai In-memory Event Bus (`MediatR`) giao tiếp liên module, Tích hợp MinIO/S3 (`AWSSDK.S3` + `Presigned URL`), Module `Occupancy` (Giám sát chỗ ngồi).
- **Sprint 3 (Buổi 8 – Buổi 10):** Hoàn thiện Module `Security` (An ninh ngoài giờ), Module `Reporting`, đóng gói Docker Compose 1 lệnh và cấu hình `Jenkinsfile` CI/CD Pipeline.
