# ĐẶC TẢ YÊU CẦU HỆ THỐNG & TIÊU CHUẨN ĐỒ ÁN (SYSTEM SPECIFICATION & REQUIREMENTS)

> **Đề tài Đồ án Tốt nghiệp**: Hệ thống Thị giác Máy tính Giám sát Văn phòng Thông minh (Hỗ trợ Chấm công, Giám sát Hiện diện và An ninh Văn phòng)  
> **Kiến trúc triển khai**: C# .NET (Modular Monolith) + React TypeScript + Python AI Service (CUDA) + Docker Compose + Cloudflare R2/SSL  
> **Tài liệu gốc**: `DA_SV_HMNC.pdf` & Chuẩn đầu ra học phần (CLO1, CLO2)  
> **Cập nhật**: Tháng 10/2026

---

## MỤC LỤC
1. [Mục tiêu & Chuẩn đầu ra Dự án (CLO1 & CLO2)](#1-mục-tiêu--chuẩn-đầu-ra-dự-án-clo1--clo2)
2. [Các Tác nhân Hệ thống (System Actors)](#2-các-tác-nhân-hệ-thống-system-actors)
3. [Đặc tả Yêu cầu Chức năng (Functional Requirements - FR)](#3-đặc-tả-yêu-cầu-chức-năng-functional-requirements---fr)
   - [3.1. Phân hệ Quản lý Hồ sơ & Đăng ký Sinh trắc học (`Biometrics Module`)](#31-phân-hệ-quản-lý-hồ-sơ--đăng-ký-sinh-trắc-học-biometrics-module)
   - [3.2. Phân hệ Điểm danh, Chấm công & Quản lý Chuyên cần (`Attendance Module`)](#32-phân-hệ-điểm-danh-chấm-công--quản-lý-chuyên-cần-attendance-module)
   - [3.3. Phân hệ Giám sát Trạng thái Chỗ ngồi & Hiện diện (`Occupancy Module`)](#33-phân-hệ-giám-sát-trạng-thái-chỗ-ngồi--hiện-diện-occupancy-module)
   - [3.4. Phân hệ Kiểm soát An ninh Ngoài giờ & Phát hiện Người lạ (`Security Module`)](#34-phân-hệ-kiểm-soát-an-ninh-ngoài-giờ--phát-hiện-người-lạ-security-module)
   - [3.5. Phân hệ Quản trị Hệ thống, Vùng ảo & Báo cáo (`Admin, Zone & Reporting Module`)](#35-phân-hệ-quản-trị-hệ-thống-vùng-ảo--báo-cáo-admin-zone--reporting-module)
4. [Ma trận Phân quyền Truy cập Chức năng (RBAC Matrix)](#4-ma-trận-phân-quyền-truy-cập-chức-năng-rbac-matrix)
5. [Đặc tả Yêu cầu Phi chức năng (Non-Functional Requirements - NFR)](#5-đặc-tả-yêu-cầu-phi-chức-năng-non-functional-requirements---nfr)
6. [Checklist Hạ tầng Cloud, DevOps & Hồ sơ Thiết kế](#6-checklist-hạ-tầng-cloud-devops--hồ-sơ-thiết-kế)
7. [Bản đồ Công nghệ & Cấu trúc Dự án (Tech Stack)](#7-bản-đồ-công-nghệ--cấu-trúc-dự-án-tech-stack)

---

## 1. MỤC TIÊU & CHUẨN ĐẦU RA DỰ ÁN (CLO1 & CLO2)

### 1.1. Chuẩn đầu ra Kỹ thuật & Triển khai (CLO1)
* **Kiến trúc Backend**: Xây dựng hoàn chỉnh hệ thống Backend bằng **C# .NET** áp dụng kiến trúc **Modular Monolith**, tách biệt rõ các miền nghiệp vụ (`Biometrics`, `Attendance`, `Occupancy`, `Security`, `Reporting`).
* **Dịch vụ AI độc lập**: Tách biệt **`ai_service` (Python)** chuyên trách xử lý luồng video, nhận diện khuôn mặt và phát hiện người trên GPU NVIDIA GTX 1650.
* **Ảo hóa & Đóng gói**: Tích hợp đầy đủ **Docker & Docker Compose** để vận hành toàn bộ các container (`backend`, `ai_service`, `frontend`, `postgres`, `nginx`).
* **Lưu trữ Đối tượng (Object Storage)**: Tích hợp lưu trữ media (ảnh mẫu khuôn mặt, ảnh snapshot vi phạm, video bằng chứng 10s) thông qua giao thức S3 với **Cloudflare R2** (ưu tiên gói miễn phí 10GB) hoặc **MinIO**.
* **Triển khai Thực tế (Production VPS & Domain)**:
  * Triển khai hệ thống trên máy chủ **VPS Online (Ubuntu / Amazon EC2)** có giao diện Web React hoạt động qua tên miền riêng (**Domain `.id.vn`** miễn phí 2 năm).
  * Quản lý DNS qua **Cloudflare DNS**.
  * Bảo mật đường truyền **SSL/TLS Full (Strict)** của Cloudflare:
    $$\text{Client / Browser} \xrightarrow{\text{HTTPS / TLS (Cloudflare CA)}} \text{Cloudflare Edge} \xrightarrow{\text{TLS (Origin CA Certificate)}} \text{VPS Nginx}$$
* **CI/CD & Container Registry**: Tự động hóa quy trình kiểm thử, build Docker image (lưu trên **GitHub Container Registry - GHCR** hoặc Docker Hub) và tự động deploy lên VPS thông qua **GitHub Actions**.

### 1.2. Chuẩn đầu ra Làm việc nhóm & Báo cáo Kỹ thuật (CLO2)
* Phối hợp nhóm hiệu quả qua Git workflow; viết báo cáo thuyết minh kỹ thuật chuẩn mực.
* Thực hiện kiểm thử chéo ứng dụng với các nhóm khác và đóng góp khuyến nghị / báo cáo lỗi.
* Hoàn thiện 4 hồ sơ thiết kế cốt lõi:
  1. **Yêu cầu chức năng & phi chức năng** (Tài liệu này).
  2. **Sơ đồ phân rã chức năng** (*Functional Decomposition Diagram - FDD*).
  3. **Thiết kế kiến trúc hệ thống** (*System Architecture*).
  4. **Thiết kế cơ sở dữ liệu** (*ERD & Schema*).

---

## 2. CÁC TÁC NHÂN HỆ THỐNG (SYSTEM ACTORS)

| Tác nhân | Vai trò (Role) | Trách nhiệm chính trong hệ thống |
| :--- | :--- | :--- |
| **Quản trị viên Hệ thống** | `System Admin` | Thiết lập hạ tầng camera, phân quyền RBAC, vẽ đa giác vùng ảo bàn làm việc / khu vực cấm trên giao diện Web và cấu hình tham số hệ thống. |
| **Chuyên viên Nhân sự** | `HR Officer` | Khởi tạo hồ sơ nhân viên mới, đăng ký mẫu sinh trắc học khuôn mặt, đối soát dữ liệu chấm công, phê duyệt nghỉ phép/giải trình và kết xuất bảng công Excel (`.xlsx`). |
| **Trưởng bộ phận** | `Department Lead` | Theo dõi sơ đồ mặt bằng chỗ ngồi (*Live Seat Map*) và nhật ký chấm công của riêng phòng ban mình phụ trách; tiếp nhận cảnh báo nhân viên vắng mặt tại bàn quá hạn. |
| **Nhân viên An ninh / Trực ban** | `Security Guard` | Giám sát trực tiếp màn hình điều hành an ninh (*SOC Video Wall*), tiếp nhận cảnh báo xâm nhập ngoài giờ qua Web/Telegram và đóng biên bản xử lý sự cố (*Acknowledge / False Alarm*). |
| **Nhân viên Doanh nghiệp** | `Employee` | Đối tượng được chấm công không chạm khi đi qua cửa sảnh và được ghi nhận trạng thái hiện diện tại vị trí bàn làm việc. |

---

## 3. ĐẶC TẢ YÊU CẦU CHỨC NĂNG (FUNCTIONAL REQUIREMENTS - FR)
*(Mô tả chi tiết hệ thống cung cấp những chức năng gì, điều kiện kích hoạt và công thức nghiệp vụ)*

### 3.1. Phân hệ Quản lý Hồ sơ & Đăng ký Sinh trắc học (`Biometrics Module`)

| Mã YC | Tên chức năng | Đặc tả chi tiết nghiệp vụ & Công thức toán học | Tác nhân |
| :--- | :--- | :--- | :--- |
| **FR-BIO-01** | **Khởi tạo & Quản lý hồ sơ hành chính** | Cho phép thêm mới, chỉnh sửa, khóa/xóa mềm và tra cứu hồ sơ nhân viên gồm: Mã nhân viên (`employee_code`), họ tên, phòng ban, ca làm việc mặc định, và mã vị trí bàn làm việc đăng ký (`seat_code`). | HR Officer, Admin |
| **FR-BIO-02** | **Thu nhận mẫu ảnh khuôn mặt** | Hỗ trợ chụp trực tiếp từ camera tại quầy đăng ký hoặc tải lên bộ $3 - 5$ ảnh chân dung chất lượng cao ở các góc độ khác nhau. | HR Officer |
| **FR-BIO-03** | **Kiểm định chất lượng khuôn mặt (*Quality Assessment*)** | Hệ thống tự động đánh giá chất lượng từng ảnh trước khi trích xuất:<br>1. **Số lượng khuôn mặt**: Từ chối nếu khung hình có $0$ hoặc $> 1$ khuôn mặt.<br>2. **Độ phân giải vùng mặt**: Kích thước bounding box khuôn mặt phải đạt tối thiểu $112 \times 112\text{ pixels}$.<br>3. **Độ sắc nét (Chống mờ nhòe)**: Tính phương sai của toán tử vi phân Laplace:<br>$$\text{Score}_{\text{blur}} = \text{Var}(\nabla^2 I) > 100$$<br>Nếu $\text{Score}_{\text{blur}} \le 100$, hệ thống yêu cầu chụp lại do ảnh bị mờ nhòe chuyển động. | AI Service |
| **FR-BIO-04** | **Căn chỉnh & Trích xuất vector đặc trưng 512D** | Thực hiện căn chỉnh khuôn mặt (*Face Alignment*) dựa trên 5 điểm mốc giải phẫu (hai mắt, chóp mũi, hai khóe miệng) và đưa qua mô hình nhận diện (ArcFace) để tạo vector chuẩn hóa:<br>$$\vec{v} \in \mathbb{R}^{512} \quad \text{với} \quad \|\vec{v}\|_2 = 1$$ | AI Service |
| **FR-BIO-05** | **Kiểm tra trùng lặp sinh trắc (*Duplicate Check*)** | So sánh độ tương đồng Cosine giữa vector mới $\vec{v}_{\text{new}}$ với toàn bộ vector $\vec{v}_i$ đã có trong hệ thống:<br>$$\text{Similarity}(\vec{v}_{\text{new}}, \vec{v}_i) = \vec{v}_{\text{new}} \cdot \vec{v}_i$$<br>Nếu tồn tại nhân viên $i$ có $\text{Similarity} > 0.85$, hệ thống lập tức cảnh báo nguy cơ tạo trùng hồ sơ hoặc gian lận danh tính. | AI Service, Backend .NET |
| **FR-BIO-06** | **Lưu trữ Object Storage & Đồng bộ chỉ mục** | Lưu trữ tệp ảnh mẫu gốc lên **Cloudflare R2 / MinIO**, nạp vector 512 chiều vào chỉ mục tìm kiếm nhanh và lưu thông tin nhân sự vào CSDL PostgreSQL. | Backend .NET |

---

### 3.2. Phân hệ Điểm danh, Chấm công & Quản lý Chuyên cần (`Attendance Module`)

| Mã YC | Tên chức năng | Đặc tả chi tiết nghiệp vụ & Công thức toán học | Tác nhân |
| :--- | :--- | :--- | :--- |
| **FR-ATT-01** | **Phát hiện & Lọc giả mạo (*Anti-Spoofing*)** | Kiểm tra thực thể sống (*Liveness Detection*) đối với khuôn mặt tại camera cửa ra vào nhằm ngăn chặn việc dùng ảnh in màu, phát lại video trên điện thoại hoặc mặt nạ silicon:<br>- Nếu phát hiện giả mạo: Hủy phiên xử lý, lưu snapshot lên R2 và phát cảnh báo `SPOOFING_ATTEMPT`.<br>- Nếu xác thực là thực thể sống: Chuyển tiếp sang bước trích xuất vector. | AI Service |
| **FR-ATT-02** | **Định danh khuôn mặt 1:N (*Vector Matching*)** | Trích xuất vector truy vấn $\vec{v}_{\text{query}}$ và tìm phần tử có độ tương đồng lớn nhất trong tập đã đăng ký:<br>$$S_{\max} = \max_k (\vec{v}_{\text{query}} \cdot \vec{v}_k) \quad \text{với ngưỡng } \theta_{\text{match}} = 0.70$$<br>- Nếu $S_{\max} \ge 0.70$: Xác định thành công mã nhân viên tương ứng.<br>- Nếu $S_{\max} < 0.70$: Gắn nhãn đối tượng là khách vãng lai hoặc chưa đăng ký (`UNKNOWN`). | AI Service, Employee |
| **FR-ATT-03** | **Khử trùng lặp theo cửa sổ thời gian (*Debounce Logic*)** | Để tránh một nhân viên đứng trò chuyện tại cửa quét bị ghi nhận hàng chục lần chấm công liên tục, hệ thống áp dụng bộ lọc đệm:<br>$$\Delta t = T_{\text{current}} - T_{\text{last\_recorded}}(\text{Employee\_ID})$$<br>Nếu $\Delta t < 300\text{ giây}$ ($5\text{ phút}$): Bỏ qua sự kiện, không tạo bản ghi mới. Ngược lại, chấp nhận lượt chấm công hợp lệ. | Backend .NET |
| **FR-ATT-04** | **Chấm công vào ca & Phân loại chuyên cần (*Check-in Flow*)** | Truy xuất ca làm việc quy định gồm giờ bắt đầu $T_{\text{start}}$ và thời gian ân hạn $T_{\text{grace}}$ (mặc định 15 phút):<br>- Nếu $T_{\text{in}} \le T_{\text{start}} + T_{\text{grace}}$: Gán trạng thái `ON_TIME` (Đúng giờ).<br>- Nếu $T_{\text{in}} > T_{\text{start}} + T_{\text{grace}}$: Gán trạng thái `LATE` (Đi muộn) và tính số phút đi muộn:<br>$$M_{\text{late}} = \left\lceil \frac{T_{\text{in}} - T_{\text{start}}}{60} \right\rceil \quad (\text{phút})$$ | Backend .NET |
| **FR-ATT-05** | **Chấm công cuối ngày & Xác định về sớm (*Check-out Flow*)** | Lượt quét hợp lệ cuối cùng trong khung giờ chiều/tối của nhân viên được ghi nhận làm mốc giờ ra về ($T_{\text{out}}$). Nếu $T_{\text{out}} < T_{\text{end}}$ (với $T_{\text{end}}$ là giờ kết thúc ca): Gắn cờ `EARLY_LEAVE` và tính số phút về sớm:<br>$$M_{\text{early}} = \left\lceil \frac{T_{\text{end}} - T_{\text{out}}}{60} \right\rceil \quad (\text{phút})$$ | Backend .NET |
| **FR-ATT-06** | **Tiến trình tự động chốt vắng mặt (*Daily Absent Job*)** | Vào lúc `23:59` hàng ngày, tiến trình ngầm kiểm tra toàn bộ danh sách nhân viên: Những cá nhân không có bất kỳ lượt check-in nào trong ngày và không có trạng thái nghỉ phép được duyệt trước sẽ tự động nhận trạng thái `ABSENT` (Vắng mặt không lý do). | Backend .NET |

---

### 3.3. Phân hệ Giám sát Trạng thái Chỗ ngồi & Hiện diện (`Occupancy Module`)

Mỗi vị trí bàn làm việc được biểu diễn qua một đa giác 2D gồm $N$ đỉnh:
$$\mathcal{P}_{\text{seat}} = \{(x_1, y_1), (x_2, y_2), \dots, (x_N, y_N)\}$$

| Mã YC | Tên chức năng | Đặc tả chi tiết nghiệp vụ & Mô hình trạng thái | Tác nhân |
| :--- | :--- | :--- | :--- |
| **FR-OCC-01** | **Kiểm tra tương quan hình học người - bàn** | Sử dụng mô hình phát hiện người (YOLOv8-Nano) lấy tọa độ điểm đáy bounding box cơ thể người và kiểm tra sự nằm trong đa giác $\mathcal{P}_{\text{seat}}$ bằng giải thuật *Point-in-Polygon (Ray Casting)*. | AI Service |
| **FR-OCC-02** | **Máy trạng thái hữu hạn chỗ ngồi (*4-State FSM*)** | Chuyển đổi giữa 4 trạng thái cốt lõi và đồng bộ thời gian thực lên Sơ đồ văn phòng (*Live Seat Map*):<br>- **`EMPTY`** (*Xám nhạt*): Nhân viên nghỉ phép hoặc bàn chưa phân bổ $\rightarrow$ Tắt toàn bộ bộ đếm thời gian vắng.<br>- **`PRESENT`** (*Xanh lá cây*): Tọa độ đáy bounding box người nằm trong đa giác $\mathcal{P}_{\text{seat}}$ $\rightarrow$ Đặt lại bộ đếm vắng về 0; cộng dồn thời gian làm việc tích cực $\Delta t_{\text{active}}$.<br>- **`TEMP_AWAY`** (*Vàng cam*): Không phát hiện người trong đa giác bàn với thời gian vắng liên tục $t < T_{\text{threshold}}$ $\rightarrow$ Kích hoạt đồng hồ bấm giờ vắng mặt tạm thời (đi họp ngắn, vệ sinh).<br>- **`PROLONGED_AWAY`** (*Đỏ nhấp nháy*): Thời gian vắng mặt liên tục vượt ngưỡng $t \ge T_{\text{threshold}}$ ($15\text{ phút}$) $\rightarrow$ Tạo thông báo cảnh báo gửi đến Trưởng bộ phận phụ trách và ghi log sự cố. | Backend .NET, Dept Lead |
| **FR-OCC-03** | **Loại trừ nhiễu cử động nhỏ (*Anti-Flicker*)** | Để tránh việc nhân viên hơi ngả người ra sau hoặc cúi xuống lấy tài liệu bị tính là rời bàn, thuật toán yêu cầu trạng thái vắng mặt phải duy trì liên tục tối thiểu **15 khung hình liên tiếp (3 giây)** trước khi chuyển sang `TEMP_AWAY`. | AI Service |
| **FR-OCC-04** | **Cơ chế Mute theo lịch nghỉ trưa** | Trong khung giờ từ `12:00` đến `13:30`, hệ thống tự động tạm ngắt logic chuyển đổi trạng thái sang `PROLONGED_AWAY` nhằm tôn trọng thời gian nghỉ ngơi của nhân sự. | Backend .NET |
| **FR-OCC-05** | **Phát hiện ngồi sai vị trí (*Cross-Seating Detection*)** | Khi một vị trí bàn có người ngồi, định kỳ hệ thống đối soát khuôn mặt. Nếu đối tượng được xác định là nhân viên B nhưng bàn làm việc thuộc sở hữu đã đăng ký của nhân viên A, trạng thái bàn chuyển thành `WRONG_SEAT` kèm cảnh báo nhắc nhở nội bộ. | AI Service, Backend .NET |

---

### 3.4. Phân hệ Kiểm soát An ninh Ngoài giờ & Phát hiện Người lạ (`Security Module`)

| Mã YC | Tên chức năng | Đặc tả chi tiết nghiệp vụ & Luồng phản ứng sự cố | Tác nhân |
| :--- | :--- | :--- | :--- |
| **FR-SEC-01** | **Kích hoạt chế độ trực đêm tự động (*Night Guard Mode*)** | Tự động kích hoạt chế độ an ninh trực đêm từ `19:00` đến `06:30` sáng hôm sau, cũng như toàn bộ các ngày Thứ Bảy, Chủ Nhật và ngày nghỉ lễ quốc gia. | Backend .NET, AI Service |
| **FR-SEC-02** | **Cây quyết định phân cấp cảnh báo ngoài giờ** | Khi phát hiện người xuất hiện trong bất kỳ khung hình camera nội bộ nào trong giờ trực đêm:<br>1. **Nhận diện khuôn mặt thành công (Nhân viên nội bộ)**: Truy vấn bảng đăng ký làm thêm giờ (`ot_registrations`):<br>   - *Có duyệt làm OT*: Chấp thuận hiện diện, ghi nhật ký `APPROVED_OVERTIME`. Không phát cảnh báo.<br>   - *Không có đăng ký OT*: Kích hoạt **Cảnh báo Mức 2 (`UNAUTHORIZED_PRESENCE`)**, đẩy nhắc nhở lên bảng điều hành an ninh.<br>2. **Không nhận diện được khuôn mặt hoặc Người lạ (`UNKNOWN`)**:<br>   - Ngay lập tức kích hoạt **Cảnh báo Mức 3 Khẩn cấp (`SECURITY_BREACH`)**. | Backend .NET, Security Guard |
| **FR-SEC-03** | **Báo động tại Trung tâm Giám sát (*SOC Video Wall*)** | Khi Cảnh báo Mức 3 kích hoạt: Màn hình giám sát lập tức chuyển sang giao diện cảnh báo đỏ; phát tín hiệu chuông âm thanh cảnh báo ngắn; tự động trích xuất và phóng to luồng camera đang ghi nhận đối tượng vi phạm ra trung tâm màn hình. | Frontend React, Security Guard |
| **FR-SEC-04** | **Đóng gói bằng chứng kỹ thuật số (*Digital Evidence Capture*)** | Tự động chụp 01 ảnh rõ nét nhất và lưu đoạn video trích xuất có độ dài **10 giây** ($5\text{ giây trước}$ lấy từ Ring Buffer RAM và $5\text{ giây sau}$ thời điểm phát hiện xâm nhập) vào kho lưu trữ bảo mật **Cloudflare R2**. | AI Service, Backend .NET |
| **FR-SEC-05** | **Thông báo kênh phụ trợ tức thời (*Out-of-band Dispatch*)** | Gửi thông báo khẩn cấp tức thời kèm ảnh chụp snapshot và link video bằng chứng đến nhóm trực vận hành thông qua **Webhook / Telegram Bot API**. | Backend .NET |
| **FR-SEC-06** | **Đóng biên bản xử lý sự cố (*Ticket Closure*)** | Nhân viên an ninh sau khi kiểm tra hiện trường bắt buộc truy cập hệ thống cập nhật kết quả:<br>- Nhấn **Xác nhận sự cố (`Acknowledge`)** và nhập nội dung biên bản xử lý (VD: *"Nhân viên đối tác vào dọn vệ sinh theo lịch đột xuất"*).<br>- Hoặc nhấn **Báo động sai (`False Alarm`)**: Hệ thống đóng sự cố và chuyển ảnh chụp vào thư mục phản hồi huấn luyện để cải thiện thuật toán. | Security Guard |

---

### 3.5. Phân hệ Quản trị Hệ thống, Vùng ảo & Báo cáo (`Admin, Zone & Reporting Module`)

| Mã YC | Tên chức năng | Đặc tả chi tiết nghiệp vụ | Tác nhân |
| :--- | :--- | :--- | :--- |
| **FR-ADM-01** | **Hiệu chuẩn & Thiết lập vùng ảo (*Virtual Zone Editor*)** | 1. Admin chọn camera tương ứng và nhấn trích xuất khung hình hiệu chuẩn (*Calibration Frame*).<br>2. Dùng công cụ đồ họa trực quan trên Web (HTML5 Canvas) chấm các điểm tọa độ liên tiếp vẽ đa giác khép kín quanh bàn làm việc.<br>3. Gán nhãn: Mã chỗ ngồi (`seat_code`), Mã nhân viên sở hữu, hoặc đánh dấu Khu vực Cấm (`RESTRICTED_ZONE`) nếu là cửa phòng máy chủ.<br>4. Chuẩn hóa tọa độ các đỉnh về miền giá trị thập phân $[0.0, 1.0]$ để đảm bảo tính chính xác độc lập với độ phân giải màn hình hiển thị. | System Admin |
| **FR-ADM-02** | **Quản lý cấu hình ca & Ngưỡng thời gian** | Cấu hình thời gian làm việc của các ca, thời gian ân hạn $T_{\text{grace}}$, ngưỡng thời gian vắng mặt $T_{\text{threshold}}$, khung giờ nghỉ trưa và khung giờ trực đêm. | System Admin, HR Officer |
| **FR-ADM-03** | **Kết xuất báo cáo & Tổng hợp thống kê** | - **Báo cáo Bảng công Tổng hợp (Phòng HR)**: Tự động kết xuất tệp `.xlsx` vào ngày cuối kỳ công (Mã NV, họ tên, tổng ngày công chuẩn, số lần đi muộn, số lần về sớm, tổng số phút đi muộn lũy kế và liên kết ảnh chụp bằng chứng).<br>- **Báo cáo Mật độ Hiện diện Văn phòng (Ban Giám đốc)**: Phân tích thống kê tỷ lệ lấp đầy chỗ ngồi theo từng khung giờ trong ngày.<br>- **Nhật ký Giám sát An ninh (Phòng IT / An ninh)**: Lưu vết lịch sử cảnh báo ngoài giờ, thời gian phản hồi của bảo vệ và tỷ lệ báo động giả trong tháng. | Admin, HR, Dept Lead, Security |

---

## 4. MA TRẬN PHÂN QUYỀN TRUY CẬP CHỨC NĂNG (RBAC MATRIX)

| Chức năng Nghiệp vụ | Admin | Nhân sự (HR) | Trưởng bộ phận | An ninh |
| :--- | :---: | :---: | :---: | :---: |
| Đăng ký hồ sơ và khuôn mặt nhân viên | Toàn quyền | Thực hiện | Không | Không |
| Xem nhật ký chấm công và xuất Excel | Toàn quyền | Toàn quyền | Chỉ xem team | Không |
| Xem sơ đồ chỗ ngồi thời gian thực | Toàn quyền | Toàn quyền | Quản lý team | Không |
| Nhận cảnh báo rời chỗ làm quá hạn | Xem | Không | Tiếp nhận | Không |
| Giám sát luồng video trực tiếp | Tất cả camera | Camera sảnh | Camera phòng | Tất cả camera |
| Cấu hình đa giác bàn làm việc | Toàn quyền | Không | Không | Không |
| Tiếp nhận và đóng cảnh báo đột nhập | Toàn quyền | Không | Không | Thực hiện |
| Quản lý cấu hình ca và ngưỡng thời gian | Toàn quyền | Cấu hình ca | Không | Không |

---

## 5. ĐẶC TẢ YÊU CẦU PHI CHỨC NĂNG (NON-FUNCTIONAL REQUIREMENTS - NFR)
*(Các tiêu chuẩn chất lượng hệ thống phải đáp ứng về Hiệu năng, Độ chính xác AI, Bảo mật, Tính dễ sử dụng và Kiến trúc)*

### 5.1. Yêu cầu về Hiệu năng & Thời gian thực (Performance & Real-time Efficiency)
* **NFR-PERF-01 (Tốc độ xử lý khung hình - FPS)**:
  * Luồng camera giám sát chỗ ngồi và an ninh (sử dụng YOLOv8-Nano trên GPU NVIDIA GTX 1650) đạt tốc độ xử lý ổn định **15 – 25 FPS**.
  * Thời gian phát hiện và trích xuất vector khuôn mặt 512 chiều tại camera sảnh đạt $\le 200\text{ ms}$/khung hình.
* **NFR-PERF-02 (Độ trễ phản hồi - End-to-End Latency)**:
  * Độ trễ từ lúc nhân viên bước vào vùng quét đến khi ghi nhận chấm công đạt $\le 0.5\text{ giây}$.
  * Độ trễ đồng bộ trạng thái bàn làm việc mới hoặc phát cảnh báo đỏ lên giao diện React qua **SignalR WebSocket** đạt $\le 1.0\text{ giây}$.
  * Độ trễ đẩy thông báo kèm ảnh chụp sang **Telegram Bot** đạt $\le 3.0\text{ giây}$.
* **NFR-PERF-03 (Quản lý bộ nhớ đệm - Memory Footprint)**:
  * Cơ chế *Circular Ring Buffer* lưu trữ khung hình phục vụ cắt video 10 giây ($5\text{s trước} + 5\text{s sau}$) phải giới hạn kích thước cố định trong RAM (`maxlen = 150 frames`), tự động ghi đè khung hình cũ, đảm bảo **không rò rỉ bộ nhớ (Memory Leak)** khi vận hành 24/7.

### 5.2. Yêu cầu về Độ chính xác Thị giác Máy tính (AI Accuracy & Robustness)
* **NFR-ACC-01 (Độ tin cậy nhận diện sinh trắc)**:
  * Tỷ lệ nhận diện đúng (*True Acceptance Rate - TAR*) đạt $\ge 95\%$ trong điều kiện ánh sáng văn phòng tiêu chuẩn ($300 - 500\text{ lux}$).
  * Tỷ lệ chấp nhận sai người lạ thành nhân viên (*False Acceptance Rate - FAR*) giữ ở mức $< 1\%$ ở ngưỡng $\theta_{\text{match}} = 0.70$ kết hợp kiểm tra thực thể sống (*Anti-Spoofing*) và lọc mờ Laplace ($\text{Score}_{\text{blur}} > 100$).
* **NFR-ACC-02 (Tính bất biến với độ phân giải)**:
  * Tọa độ đa giác vùng ảo chuẩn hóa về đoạn $[0.0, 1.0]$ giúp hệ thống giữ nguyên độ chính xác hình học bất kể thay đổi độ phân giải luồng video (720p, 1080p) hoặc kích thước màn hình hiển thị.

### 5.3. Yêu cầu về Bảo mật & Quyền riêng tư (Security & Privacy)
* **NFR-SEC-01 (An toàn dữ liệu sinh trắc học)**:
  * Dữ liệu nhận diện khuôn mặt được chuyển hóa một chiều thành vector số thực 512 chiều ($\mathbb{R}^{512}$), không thể tái tạo ngược từ vector về hình ảnh gốc.
* **NFR-SEC-02 (Bảo mật đường truyền SSL/TLS với Cloudflare)**:
  * Toàn bộ kết nối tới hệ thống qua tên miền `.id.vn` bắt buộc mã hóa qua **HTTPS/TLS 1.3** từ trình duyệt tới Cloudflare Edge và từ Cloudflare Edge tới Nginx VPS bằng **Cloudflare Origin CA Certificate**.
* **NFR-SEC-03 (Bảo mật lưu trữ đám mây Cloudflare R2 / MinIO)**:
  * Ảnh mẫu sinh trắc, ảnh snapshot và video 10s lưu trên **Cloudflare R2** được đặt ở chế độ riêng tư (*Private Bucket*), chỉ cấp quyền truy cập tạm thời qua **Pre-signed URL**.
* **NFR-SEC-04 (Xác thực JWT & Cô lập dữ liệu RBAC)**:
  * API Backend C# .NET bảo vệ bằng **JWT (JSON Web Token)**, mật khẩu băm bằng **BCrypt**.
  * Dữ liệu được cô lập theo phòng ban: Trưởng bộ phận chỉ có thể truy vấn dữ liệu nhân sự thuộc phòng ban của mình.
* **NFR-SEC-05 (Tôn trọng quyền riêng tư người lao động)**:
  * Hệ thống chỉ đánh giá trạng thái hiện diện vật lý tại bàn làm việc thông qua camera không gian chung và tự động tạm dừng cảnh báo vắng mặt trong giờ nghỉ trưa (`12:00 - 13:30`); không giám sát màn hình cá nhân hay thao tác chuột/bàn phím.

### 5.4. Yêu cầu về Tính dễ sử dụng (Usability & User Experience)
* **NFR-USA-01 (Trải nghiệm chấm công không chạm - Zero-Touch UX)**:
  * Nhân viên di chuyển tự nhiên qua cửa mà không cần dừng lại quẹt thẻ hay bấm vân tay.
* **NFR-USA-02 (Thiết lập vùng ảo không cần can thiệp mã nguồn - No-Code Calibration)**:
  * Khi thay đổi bố cục bàn ghế văn phòng, Admin có thể vẽ và cập nhật lại vùng đa giác trực tiếp trên giao diện Web dưới 2 phút mà không cần sửa code hay khởi động lại hệ thống.
* **NFR-USA-03 (Trực quan hóa theo mã màu chuẩn - Color-Coded Situational Awareness)**:
  * Sơ đồ chỗ ngồi (*Live Seat Map*) và màn hình an ninh (*SOC Video Wall*) sử dụng hệ màu trực quan (*Xám / Xanh lá / Vàng cam / Đỏ nhấp nháy*) kèm âm thanh cảnh báo, giúp người vận hành nắm bắt tình hình ngay lập tức.

### 5.5. Yêu cầu về Kiến trúc, Khả năng bảo trì & Triển khai (Maintainability & DevOps)
* **NFR-ARC-01 (Tuân thủ kiến trúc Modular Monolith trên C# .NET)**:
  * Các module nghiệp vụ (`Biometrics`, `Attendance`, `Occupancy`, `Security`, `Reporting`) được phân tách rõ ràng trong Solution `SmartOffice.slnx`, độc lập tầng Domain/Application, dễ dàng kiểm thử đơn vị (`xUnit`) và mở rộng.
* **NFR-ARC-02 (Đóng gói Docker Compose & Tự động hóa CI/CD)**:
  * Toàn bộ hệ thống khởi chạy đồng nhất bằng **Docker Compose** và tự động hóa build/test/deploy lên VPS thông qua **GitHub Actions**.
* **NFR-ARC-03 (Chuyển đổi linh hoạt nguồn phát Video phục vụ Demo)**:
  * Hỗ trợ cấu hình linh hoạt giữa Webcam máy tính, Camera điện thoại qua WiFi (RTSP/HTTP), Camera IP và **Chế độ phát lại Video kịch bản (*Simulation/Replay Mode*)** để đảm bảo buổi bảo vệ đồ án hoạt động ổn định 100%.

---

## 6. CHECKLIST HẠ TẦNG CLOUD, DEVOPS & HỒ SƠ THIẾT KẾ

### 6.1. Hồ sơ thiết kế kỹ thuật (CLO2)
- [x] **1. Yêu cầu chức năng & phi chức năng (FR & NFR)**: [`docs/01_YEU_CAU_HE_THONG.md`](./docs/01_YEU_CAU_HE_THONG.md)
- [x] **2. Sơ đồ phân rã chức năng (FDD / WBS)**: [`docs/02_SO_DO_PHAN_RA_CHUC_NANG.md`](./docs/02_SO_DO_PHAN_RA_CHUC_NANG.md)
- [x] **3. Thiết kế kiến trúc hệ thống (System Architecture)**: [`docs/03_THIET_KE_HE_THONG.md`](./docs/03_THIET_KE_HE_THONG.md)
- [x] **4. Thiết kế cơ sở dữ liệu (Database Design & ERD)**: [`docs/04_THIET_KE_CO_SO_DU_LIEU.md`](./docs/04_THIET_KE_CO_SO_DU_LIEU.md)

### 6.2. Hạ tầng triển khai (CLO1)
- [x] Khởi tạo khung dự án Backend C# .NET Modular Monolith (`backend/SmartOffice.slnx`).
- [x] Khởi tạo khung dự án Frontend React TypeScript (`frontend/`).
- [x] Khởi tạo khung dịch vụ AI Python (`ai_service/`).
- [x] Thiết lập cấu hình `docker-compose.yml`, `Dockerfile`, Nginx SSL và GitHub Actions (`deploy/` & `.github/`).
- [ ] Đăng ký tên miền `.id.vn` (miễn phí 2 năm) và trỏ về Cloudflare DNS.
- [ ] Tạo bucket lưu trữ trên **Cloudflare R2** (10GB free) và cấu hình Access Key.
- [ ] Cài đặt chứng chỉ **Cloudflare Origin CA** và triển khai lên máy chủ **VPS / Amazon EC2**.

---

## 7. BẢN ĐỒ CÔNG NGHỆ & CẤU TRÚC DỰ ÁN (TECH STACK)

* **Backend Core**: C# .NET 10 / 9 (`ASP.NET Core WebAPI`, `Entity Framework Core`, `SignalR WebSockets`, `xUnit`).
* **Frontend Web**: React 19 + TypeScript (`Vite`, `HTML5 Canvas` cho Virtual Zone Editor, `SignalR Client`).
* **AI & Computer Vision Service**: Python 3.12 (`FastAPI`, `OpenCV`, `PyTorch CUDA`, `InsightFace ArcFace 512D`, `Ultralytics YOLOv8-Nano`, `Shapely`).
* **Database & Storage**: PostgreSQL 16 + Cloudflare R2 / MinIO (S3 API).
* **Hạ tầng & DevOps**: Docker Compose, Nginx Reverse Proxy, Cloudflare DNS/SSL, GitHub Actions CI/CD, Telegram Bot API.

### 3.4. Phân hệ Kiểm soát An ninh Ngoài giờ & Phát hiện Người lạ (`Security Module`)

| Mã YC | Tên chức năng | Đặc tả chi tiết nghiệp vụ & Luồng phản ứng sự cố | Tác nhân |
| :--- | :--- | :--- | :--- |
| **FR-SEC-01** | **Kích hoạt chế độ trực đêm tự động (*Night Guard Mode*)** | Tự động kích hoạt chế độ an ninh trực đêm từ `19:00` đến `06:30` sáng hôm sau, cũng như toàn bộ các ngày Thứ Bảy, Chủ Nhật và ngày nghỉ lễ quốc gia. | Backend .NET, AI Service |
| **FR-SEC-02** | **Cây quyết định phân cấp cảnh báo ngoài giờ** | Khi phát hiện người xuất hiện trong bất kỳ khung hình camera nội bộ nào trong giờ trực đêm:<br>1. **Nhận diện khuôn mặt thành công (Nhân viên nội bộ)**: Truy vấn bảng đăng ký làm thêm giờ (`ot_registrations`):<br>   - *Có duyệt làm OT*: Chấp thuận hiện diện, ghi nhật ký `APPROVED_OVERTIME`. Không phát cảnh báo.<br>   - *Không có đăng ký OT*: Kích hoạt **Cảnh báo Mức 2 (`UNAUTHORIZED_PRESENCE`)**, đẩy nhắc nhở lên bảng điều hành an ninh.<br>2. **Không nhận diện được khuôn mặt hoặc Người lạ (`UNKNOWN`)**:<br>   - Ngay lập tức kích hoạt **Cảnh báo Mức 3 Khẩn cấp (`SECURITY_BREACH`)**. | Backend .NET, Security Guard |
| **FR-SEC-03** | **Báo động tại Trung tâm Giám sát (*SOC Video Wall*)** | Khi Cảnh báo Mức 3 kích hoạt: Màn hình giám sát lập tức chuyển sang giao diện cảnh báo đỏ; phát tín hiệu chuông âm thanh cảnh báo ngắn; tự động trích xuất và phóng to luồng camera đang ghi nhận đối tượng vi phạm ra trung tâm màn hình. | Frontend React, Security Guard |
| **FR-SEC-04** | **Đóng gói bằng chứng kỹ thuật số (*Digital Evidence Capture*)** | Tự động chụp 01 ảnh rõ nét nhất và lưu đoạn video trích xuất có độ dài **10 giây** ($5\text{ giây trước}$ lấy từ Ring Buffer RAM và $5\text{ giây sau}$ thời điểm phát hiện xâm nhập) vào kho lưu trữ bảo mật **Cloudflare R2**. | AI Service, Backend .NET |
| **FR-SEC-05** | **Thông báo kênh phụ trợ tức thời (*Out-of-band Dispatch*)** | Gửi thông báo khẩn cấp tức thời kèm ảnh chụp snapshot và link video bằng chứng đến nhóm trực vận hành thông qua **Webhook / Telegram Bot API**. | Backend .NET |
| **FR-SEC-06** | **Đóng biên bản xử lý sự cố (*Ticket Closure*)** | Nhân viên an ninh sau khi kiểm tra hiện trường bắt buộc truy cập hệ thống cập nhật kết quả:<br>- Nhấn **Xác nhận sự cố (`Acknowledge`)** và nhập nội dung biên bản xử lý (VD: *"Nhân viên đối tác vào dọn vệ sinh theo lịch đột xuất"*).<br>- Hoặc nhấn **Báo động sai (`False Alarm`)**: Hệ thống đóng sự cố và chuyển ảnh chụp vào thư mục phản hồi huấn luyện để cải thiện thuật toán. | Security Guard |

---

### 3.5. Phân hệ Quản trị Hệ thống, Vùng ảo & Báo cáo (`Admin, Zone & Reporting Module`)

| Mã YC | Tên chức năng | Đặc tả chi tiết nghiệp vụ | Tác nhân |
| :--- | :--- | :--- | :--- |
| **FR-ADM-01** | **Hiệu chuẩn & Thiết lập vùng ảo (*Virtual Zone Editor*)** | 1. Admin chọn camera tương ứng và nhấn trích xuất khung hình hiệu chuẩn (*Calibration Frame*).<br>2. Dùng công cụ đồ họa trực quan trên Web (HTML5 Canvas) chấm các điểm tọa độ liên tiếp vẽ đa giác khép kín quanh bàn làm việc.<br>3. Gán nhãn: Mã chỗ ngồi (`seat_code`), Mã nhân viên sở hữu, hoặc đánh dấu Khu vực Cấm (`RESTRICTED_ZONE`) nếu là cửa phòng máy chủ.<br>4. Chuẩn hóa tọa độ các đỉnh về miền giá trị thập phân $[0.0, 1.0]$ để đảm bảo tính chính xác độc lập với độ phân giải màn hình hiển thị. | System Admin |
| **FR-ADM-02** | **Quản lý cấu hình ca & Ngưỡng thời gian** | Cấu hình thời gian làm việc của các ca, thời gian ân hạn $T_{\text{grace}}$, ngưỡng thời gian vắng mặt $T_{\text{threshold}}$, khung giờ nghỉ trưa và khung giờ trực đêm. | System Admin, HR Officer |
| **FR-ADM-03** | **Kết xuất báo cáo & Tổng hợp thống kê** | - **Báo cáo Bảng công Tổng hợp (Phòng HR)**: Tự động kết xuất tệp `.xlsx` vào ngày cuối kỳ công (Mã NV, họ tên, tổng ngày công chuẩn, số lần đi muộn, số lần về sớm, tổng số phút đi muộn lũy kế và liên kết ảnh chụp bằng chứng).<br>- **Báo cáo Mật độ Hiện diện Văn phòng (Ban Giám đốc)**: Phân tích thống kê tỷ lệ lấp đầy chỗ ngồi theo từng khung giờ trong ngày.<br>- **Nhật ký Giám sát An ninh (Phòng IT / An ninh)**: Lưu vết lịch sử cảnh báo ngoài giờ, thời gian phản hồi của bảo vệ và tỷ lệ báo động giả trong tháng. | Admin, HR, Dept Lead, Security |

---

## 4. MA TRẬN PHÂN QUYỀN TRUY CẬP CHỨC NĂNG (RBAC MATRIX)

| Chức năng Nghiệp vụ | Admin | Nhân sự (HR) | Trưởng bộ phận | An ninh |
| :--- | :---: | :---: | :---: | :---: |
| Đăng ký hồ sơ và khuôn mặt nhân viên | Toàn quyền | Thực hiện | Không | Không |
| Xem nhật ký chấm công và xuất Excel | Toàn quyền | Toàn quyền | Chỉ xem team | Không |
| Xem sơ đồ chỗ ngồi thời gian thực | Toàn quyền | Toàn quyền | Quản lý team | Không |
| Nhận cảnh báo rời chỗ làm quá hạn | Xem | Không | Tiếp nhận | Không |
| Giám sát luồng video trực tiếp | Tất cả camera | Camera sảnh | Camera phòng | Tất cả camera |
| Cấu hình đa giác bàn làm việc | Toàn quyền | Không | Không | Không |
| Tiếp nhận và đóng cảnh báo đột nhập | Toàn quyền | Không | Không | Thực hiện |
| Quản lý cấu hình ca và ngưỡng thời gian | Toàn quyền | Cấu hình ca | Không | Không |

---

## 5. ĐẶC TẢ YÊU CẦU PHI CHỨC NĂNG (NON-FUNCTIONAL REQUIREMENTS - NFR)
*(Các tiêu chuẩn chất lượng hệ thống phải đáp ứng về Hiệu năng, Độ chính xác AI, Bảo mật, Tính dễ sử dụng và Kiến trúc)*

### 5.1. Yêu cầu về Hiệu năng & Thời gian thực (Performance & Real-time Efficiency)
* **NFR-PERF-01 (Tốc độ xử lý khung hình - FPS)**:
  * Luồng camera giám sát chỗ ngồi và an ninh (sử dụng YOLOv8-Nano trên GPU NVIDIA GTX 1650) đạt tốc độ xử lý ổn định **15 – 25 FPS**.
  * Thời gian phát hiện và trích xuất vector khuôn mặt 512 chiều tại camera sảnh đạt $\le 200\text{ ms}$/khung hình.
* **NFR-PERF-02 (Độ trễ phản hồi - End-to-End Latency)**:
  * Độ trễ từ lúc nhân viên bước vào vùng quét đến khi ghi nhận chấm công đạt $\le 0.5\text{ giây}$.
  * Độ trễ đồng bộ trạng thái bàn làm việc mới hoặc phát cảnh báo đỏ lên giao diện React qua **SignalR WebSocket** đạt $\le 1.0\text{ giây}$.
  * Độ trễ đẩy thông báo kèm ảnh chụp sang **Telegram Bot** đạt $\le 3.0\text{ giây}$.
* **NFR-PERF-03 (Quản lý bộ nhớ đệm - Memory Footprint)**:
  * Cơ chế *Circular Ring Buffer* lưu trữ khung hình phục vụ cắt video 10 giây ($5\text{s trước} + 5\text{s sau}$) phải giới hạn kích thước cố định trong RAM (`maxlen = 150 frames`), tự động ghi đè khung hình cũ, đảm bảo **không rò rỉ bộ nhớ (Memory Leak)** khi vận hành 24/7.

### 5.2. Yêu cầu về Độ chính xác Thị giác Máy tính (AI Accuracy & Robustness)
* **NFR-ACC-01 (Độ tin cậy nhận diện sinh trắc)**:
  * Tỷ lệ nhận diện đúng (*True Acceptance Rate - TAR*) đạt $\ge 95\%$ trong điều kiện ánh sáng văn phòng tiêu chuẩn ($300 - 500\text{ lux}$).
  * Tỷ lệ chấp nhận sai người lạ thành nhân viên (*False Acceptance Rate - FAR*) giữ ở mức $< 1\%$ ở ngưỡng $\theta_{\text{match}} = 0.70$ kết hợp kiểm tra thực thể sống (*Anti-Spoofing*) và lọc mờ Laplace ($\text{Score}_{\text{blur}} > 100$).
* **NFR-ACC-02 (Tính bất biến với độ phân giải)**:
  * Tọa độ đa giác vùng ảo chuẩn hóa về đoạn $[0.0, 1.0]$ giúp hệ thống giữ nguyên độ chính xác hình học bất kể thay đổi độ phân giải luồng video (720p, 1080p) hoặc kích thước màn hình hiển thị.

### 5.3. Yêu cầu về Bảo mật & Quyền riêng tư (Security & Privacy)
* **NFR-SEC-01 (An toàn dữ liệu sinh trắc học)**:
  * Dữ liệu nhận diện khuôn mặt được chuyển hóa một chiều thành vector số thực 512 chiều ($\mathbb{R}^{512}$), không thể tái tạo ngược từ vector về hình ảnh gốc.
* **NFR-SEC-02 (Bảo mật đường truyền SSL/TLS với Cloudflare)**:
  * Toàn bộ kết nối tới hệ thống qua tên miền `.id.vn` bắt buộc mã hóa qua **HTTPS/TLS 1.3** từ trình duyệt tới Cloudflare Edge và từ Cloudflare Edge tới Nginx VPS bằng **Cloudflare Origin CA Certificate**.
* **NFR-SEC-03 (Bảo mật lưu trữ đám mây Cloudflare R2 / MinIO)**:
  * Ảnh mẫu sinh trắc, ảnh snapshot và video 10s lưu trên **Cloudflare R2** được đặt ở chế độ riêng tư (*Private Bucket*), chỉ cấp quyền truy cập tạm thời qua **Pre-signed URL**.
* **NFR-SEC-04 (Xác thực JWT & Cô lập dữ liệu RBAC)**:
  * API Backend C# .NET bảo vệ bằng **JWT (JSON Web Token)**, mật khẩu băm bằng **BCrypt**.
  * Dữ liệu được cô lập theo phòng ban: Trưởng bộ phận chỉ có thể truy vấn dữ liệu nhân sự thuộc phòng ban của mình.
* **NFR-SEC-05 (Tôn trọng quyền riêng tư người lao động)**:
  * Hệ thống chỉ đánh giá trạng thái hiện diện vật lý tại bàn làm việc thông qua camera không gian chung và tự động tạm dừng cảnh báo vắng mặt trong giờ nghỉ trưa (`12:00 - 13:30`); không giám sát màn hình cá nhân hay thao tác chuột/bàn phím.

### 5.4. Yêu cầu về Tính dễ sử dụng (Usability & User Experience)
* **NFR-USA-01 (Trải nghiệm chấm công không chạm - Zero-Touch UX)**:
  * Nhân viên di chuyển tự nhiên qua cửa mà không cần dừng lại quẹt thẻ hay bấm vân tay.
* **NFR-USA-02 (Thiết lập vùng ảo không cần can thiệp mã nguồn - No-Code Calibration)**:
  * Khi thay đổi bố cục bàn ghế văn phòng, Admin có thể vẽ và cập nhật lại vùng đa giác trực tiếp trên giao diện Web dưới 2 phút mà không cần sửa code hay khởi động lại hệ thống.
* **NFR-USA-03 (Trực quan hóa theo mã màu chuẩn - Color-Coded Situational Awareness)**:
  * Sơ đồ chỗ ngồi (*Live Seat Map*) và màn hình an ninh (*SOC Video Wall*) sử dụng hệ màu trực quan (*Xám / Xanh lá / Vàng cam / Đỏ nhấp nháy*) kèm âm thanh cảnh báo, giúp người vận hành nắm bắt tình hình ngay lập tức.

### 5.5. Yêu cầu về Kiến trúc, Khả năng bảo trì & Triển khai (Maintainability & DevOps)
* **NFR-ARC-01 (Tuân thủ kiến trúc Modular Monolith trên C# .NET)**:
  * Các module nghiệp vụ (`Biometrics`, `Attendance`, `Occupancy`, `Security`, `Reporting`) được phân tách rõ ràng trong Solution `SmartOffice.slnx`, độc lập tầng Domain/Application, dễ dàng kiểm thử đơn vị (`xUnit`) và mở rộng.
* **NFR-ARC-02 (Đóng gói Docker Compose & Tự động hóa CI/CD)**:
  * Toàn bộ hệ thống khởi chạy đồng nhất bằng **Docker Compose** và tự động hóa build/test/deploy lên VPS thông qua **GitHub Actions**.
* **NFR-ARC-03 (Chuyển đổi linh hoạt nguồn phát Video phục vụ Demo)**:
  * Hỗ trợ cấu hình linh hoạt giữa Webcam máy tính, Camera điện thoại qua WiFi (RTSP/HTTP), Camera IP và **Chế độ phát lại Video kịch bản (*Simulation/Replay Mode*)** để đảm bảo buổi bảo vệ đồ án hoạt động ổn định 100%.

---

## 6. CHECKLIST HẠ TẦNG CLOUD, DEVOPS & HỒ SƠ THIẾT KẾ

### 6.1. Hồ sơ thiết kế kỹ thuật (CLO2)
- [x] **1. Yêu cầu chức năng & phi chức năng (FR & NFR)**: [`docs/01_YEU_CAU_HE_THONG.md`](./docs/01_YEU_CAU_HE_THONG.md)
- [x] **2. Sơ đồ phân rã chức năng (FDD / WBS)**: [`docs/02_SO_DO_PHAN_RA_CHUC_NANG.md`](./docs/02_SO_DO_PHAN_RA_CHUC_NANG.md)
- [x] **3. Thiết kế kiến trúc hệ thống (System Architecture)**: [`docs/03_THIET_KE_HE_THONG.md`](./docs/03_THIET_KE_HE_THONG.md)
- [x] **4. Thiết kế cơ sở dữ liệu (Database Design & ERD)**: [`docs/04_THIET_KE_CO_SO_DU_LIEU.md`](./docs/04_THIET_KE_CO_SO_DU_LIEU.md)

### 6.2. Hạ tầng triển khai (CLO1)
- [x] Khởi tạo khung dự án Backend C# .NET Modular Monolith (`backend/SmartOffice.slnx`).
- [x] Khởi tạo khung dự án Frontend React TypeScript (`frontend/`).
- [x] Khởi tạo khung dịch vụ AI Python (`ai_service/`).
- [x] Thiết lập cấu hình `docker-compose.yml`, `Dockerfile`, Nginx SSL và GitHub Actions (`deploy/` & `.github/`).
- [ ] Đăng ký tên miền `.id.vn` (miễn phí 2 năm) và trỏ về Cloudflare DNS.
- [ ] Tạo bucket lưu trữ trên **Cloudflare R2** (10GB free) và cấu hình Access Key.
- [ ] Cài đặt chứng chỉ **Cloudflare Origin CA** và triển khai lên máy chủ **VPS / Amazon EC2**.

---

## 7. BẢN ĐỒ CÔNG NGHỆ & CẤU TRÚC DỰ ÁN (TECH STACK)

* **Backend Core**: C# .NET 10 / 9 (`ASP.NET Core WebAPI`, `Entity Framework Core`, `SignalR WebSockets`, `xUnit`).
* **Frontend Web**: React 19 + TypeScript (`Vite`, `HTML5 Canvas` cho Virtual Zone Editor, `SignalR Client`).
* **AI & Computer Vision Service**: Python 3.12 (`FastAPI`, `OpenCV`, `PyTorch CUDA`, `InsightFace ArcFace 512D`, `Ultralytics YOLOv8-Nano`, `Shapely`).
* **Database & Storage**: PostgreSQL 16 + Cloudflare R2 / MinIO (S3 API).
* **Hạ tầng & DevOps**: Docker Compose, Nginx Reverse Proxy, Cloudflare DNS/SSL, GitHub Actions CI/CD, Telegram Bot API.

