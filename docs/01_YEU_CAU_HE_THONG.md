# ĐẶC TẢ YÊU CẦU CHỨC NĂNG VÀ PHI CHỨC NĂNG (FR & NFR)

> **Đề tài**: Hệ thống Thị giác Máy tính Giám sát Văn phòng Thông minh (Hỗ trợ Chấm công, Giám sát Hiện diện và An ninh Văn phòng)  
> **Kiến trúc mục tiêu**: C# .NET Modular Monolith + React TypeScript + Python AI Service + Docker Compose + Cloudflare R2/SSL  
> **Tiêu chuẩn áp dụng**: IEEE 830 / ISO/IEC 25010 (Đáp ứng chuẩn đầu ra CLO1 & CLO2)

---

## PHẦN I: YÊU CẦU CHỨC NĂNG (FUNCTIONAL REQUIREMENTS - FR)
*(Mô tả chi tiết hệ thống cần cung cấp những chức năng gì cho các tác nhân)*

### 1. Phân hệ Quản lý Hồ sơ & Đăng ký Sinh trắc học (`Biometrics Module`)
| Mã YC | Tên chức năng | Mô tả chi tiết nghiệp vụ & Công thức xử lý | Tác nhân |
| :--- | :--- | :--- | :--- |
| **FR-BIO-01** | Quản lý hồ sơ hành chính | Cho phép khởi tạo, cập nhật, xóa mềm và tra cứu hồ sơ nhân viên bao gồm: Mã nhân viên (`employee_code`), họ tên, phòng ban, ca làm việc mặc định, và mã vị trí bàn làm việc (`seat_code`). | HR Officer, Admin |
| **FR-BIO-02** | Thu nhận mẫu khuôn mặt đa góc độ | Hỗ trợ chụp ảnh trực tiếp từ camera tại quầy đăng ký hoặc tải lên bộ $3 - 5$ ảnh chân dung ở các góc mặt khác nhau (thẳng, nghiêng trái/phải nhẹ). | HR Officer |
| **FR-BIO-03** | Kiểm định chất lượng khuôn mặt tự động (*Quality Assessment*) | Hệ thống tự động kiểm tra 3 điều kiện trước khi chấp nhận ảnh:<br>1. **Số lượng mặt**: Từ chối nếu khung hình có $0$ hoặc $> 1$ khuôn mặt.<br>2. **Độ phân giải**: Kích thước bounding box vùng mặt phải đạt tối thiểu $112 \times 112\text{ pixels}$.<br>3. **Độ sắc nét (Chống mờ)**: Tính phương sai của toán tử vi phân Laplace: $\text{Score}_{\text{blur}} = \text{Var}(\nabla^2 I) > 100$. Nếu $\le 100$, yêu cầu chụp lại. | AI Service |
| **FR-BIO-04** | Căn chỉnh & Trích xuất vector đặc trưng 512 chiều | Thực hiện căn chỉnh khuôn mặt (*Face Alignment*) dựa trên 5 điểm mốc giải phẫu (hai mắt, chóp mũi, hai khóe miệng) và đưa qua mô hình mạng nơ-ron sâu để trích xuất vector chuẩn hóa $\vec{v} \in \mathbb{R}^{512}$ với $\|\vec{v}\|_2 = 1$. | AI Service |
| **FR-BIO-05** | Kiểm tra trùng lặp sinh trắc học (*Duplicate Check*) | So sánh độ tương đồng Cosine giữa vector mới với toàn bộ các vector đã đăng ký trong hệ thống: $\text{Similarity}(\vec{v}_{\text{new}}, \vec{v}_i) = \vec{v}_{\text{new}} \cdot \vec{v}_i$. Nếu tồn tại nhân viên có $\text{Similarity} > 0.85$, lập tức cảnh báo nguy cơ trùng hồ sơ hoặc gian lận danh tính. | AI Service, Backend .NET |
| **FR-BIO-06** | Lưu trữ ảnh mẫu & Đồng bộ chỉ mục | Tải ảnh gốc đạt chuẩn lên kho lưu trữ đám mây **Cloudflare R2 / MinIO** và nạp vector 512D vào chỉ mục tìm kiếm nhanh cũng như CSDL PostgreSQL. | Backend .NET |

---

### 2. Phân hệ Điểm danh, Chấm công & Quản lý Chuyên cần (`Attendance Module`)
| Mã YC | Tên chức năng | Mô tả chi tiết nghiệp vụ & Công thức xử lý | Tác nhân |
| :--- | :--- | :--- | :--- |
| **FR-ATT-01** | Phát hiện & Chống giả mạo sinh trắc (*Anti-Spoofing*) | Kiểm tra thực thể sống (*Liveness Detection*) tại camera cửa ra vào nhằm ngăn chặn hành vi dùng ảnh in màu, phát video trên màn hình điện thoại hoặc mặt nạ. Nếu phát hiện giả mạo: hủy phiên, lưu snapshot lên R2 và phát cảnh báo `SPOOFING_ATTEMPT`. | AI Service |
| **FR-ATT-02** | Định danh khuôn mặt 1:N không chạm | Trích xuất vector truy vấn $\vec{v}_{\text{query}}$ và tìm kiếm độ tương đồng lớn nhất: $S_{\max} = \max_k(\vec{v}_{\text{query}} \cdot \vec{v}_k)$ với ngưỡng $\theta_{\text{match}} = 0.70$.<br>- Nếu $S_{\max} \ge 0.70$: Định danh thành công mã nhân viên.<br>- Nếu $S_{\max} < 0.70$: Gắn nhãn đối tượng là khách vãng lai (`UNKNOWN`). | AI Service, Employee |
| **FR-ATT-03** | Khử trùng lặp theo cửa sổ thời gian (*Debounce Logic*) | Áp dụng cơ chế lọc đệm $\Delta t = T_{\text{current}} - T_{\text{last\_recorded}}(\text{Employee\_ID})$. Nếu $\Delta t < 300\text{ giây}$ ($5\text{ phút}$), hệ thống bỏ qua sự kiện để tránh ghi nhận chấm công liên tục khi nhân viên đứng trò chuyện gần cửa. | Backend .NET |
| **FR-ATT-04** | Chấm công vào ca & Đánh giá đúng giờ (*Check-in*) | Đối chiếu thời점 ghi nhận $T_{\text{in}}$ với giờ bắt đầu ca $T_{\text{start}}$ và thời gian ân hạn $T_{\text{grace}}$ (mặc định 15 phút):<br>- Nếu $T_{\text{in}} \le T_{\text{start}} + T_{\text{grace}}$: Gán trạng thái `ON_TIME` (Đúng giờ).<br>- Nếu $T_{\text{in}} > T_{\text{start}} + T_{\text{grace}}$: Gán trạng thái `LATE` (Đi muộn) và tính số phút muộn: $M_{\text{late}} = \lceil (T_{\text{in}} - T_{\text{start}}) / 60 \rceil$. | Backend .NET |
| **FR-ATT-05** | Chấm công cuối ngày & Xác định về sớm (*Check-out*) | Lượt quét hợp lệ cuối cùng trong khung giờ chiều/tối được ghi nhận làm giờ ra về $T_{\text{out}}$. Nếu $T_{\text{out}} < T_{\text{end}}$ (giờ kết thúc ca), hệ thống gắn cờ `EARLY_LEAVE` và tính số phút về sớm: $M_{\text{early}} = \lceil (T_{\text{end}} - T_{\text{out}}) / 60 \rceil$. | Backend .NET |
| **FR-ATT-06** | Tự động chốt vắng mặt cuối ngày | Tiến trình ngầm (*Background Job*) chạy vào lúc `23:59` hàng ngày kiểm tra danh sách nhân sự: Những cá nhân không có lượt check-in nào và không có đơn nghỉ phép được duyệt trước sẽ tự động nhận trạng thái `ABSENT` (Vắng mặt không lý do). | Backend .NET |

---

### 3. Phân hệ Giám sát Trạng thái Chỗ ngồi & Hiện diện Văn phòng (`Occupancy Module`)
| Mã YC | Tên chức năng | Mô tả chi tiết nghiệp vụ & Công thức xử lý | Tác nhân |
| :--- | :--- | :--- | :--- |
| **FR-OCC-01** | Kiểm tra tương quan hình học chỗ ngồi | Mỗi bàn làm việc được biểu diễn bởi đa giác 2D gồm $N$ đỉnh: $\mathcal{P}_{\text{seat}} = \{(x_1,y_1), (x_2,y_2), \dots, (x_N,y_N)\}$. Hệ thống dùng thuật toán *Point-in-Polygon (Ray Casting)* kiểm tra tọa độ đáy bounding box của người có nằm trong đa giác $\mathcal{P}_{\text{seat}}$ hay không. | AI Service |
| **FR-OCC-02** | Máy trạng thái hữu hạn chỗ ngồi (*4-State FSM*) | Quản lý chuyển đổi giữa 4 trạng thái cốt lõi và đẩy dữ liệu thời gian thực lên Sơ đồ mặt bằng (*Live Seat Map*):<br>1. `EMPTY` (*Xám nhạt*): Nhân viên nghỉ phép hoặc bàn chưa phân bổ; tắt bộ đếm.<br>2. `PRESENT` (*Xanh lá cây*): Có người trong đa giác bàn; đặt lại bộ đếm vắng về 0, cộng dồn thời gian làm việc tích cực $\Delta t_{\text{active}}$.<br>3. `TEMP_AWAY` (*Vàng cam*): Không có người tại bàn với thời gian vắng liên tục $t < T_{\text{threshold}}$ (đi họp ngắn, vệ sinh).<br>4. `PROLONGED_AWAY` (*Đỏ nhấp nháy*): Vắng mặt liên tục vượt ngưỡng $t \ge T_{\text{threshold}}$ (15 phút); gửi cảnh báo đến Trưởng bộ phận và ghi log sự cố. | Backend .NET, Dept Lead |
| **FR-OCC-03** | Loại trừ nhiễu cử động nhỏ (*Anti-Flicker*) | Yêu cầu trạng thái không phát hiện người phải duy trì liên tục tối thiểu **15 khung hình liên tiếp (3 giây)** trước khi chuyển từ `PRESENT` sang `TEMP_AWAY`, tránh báo sai khi nhân viên cúi nhặt đồ hoặc ngả lưng. | AI Service |
| **FR-OCC-04** | Tạm ngắt theo lịch trình nghỉ trưa (*Lunchtime Mute*) | Trong khung giờ từ `12:00` đến `13:30`, hệ thống tự động tạm ngắt logic chuyển trạng thái sang `PROLONGED_AWAY` nhằm tôn trọng thời gian nghỉ ngơi của nhân sự. | Backend .NET |
| **FR-OCC-05** | Phát hiện ngồi sai vị trí quy định (*Cross-Seating*) | Định kỳ đối soát khuôn mặt tại bàn. Nếu xác định là nhân viên B nhưng bàn làm việc đăng ký thuộc sở hữu của nhân viên A, chuyển trạng thái bàn thành `WRONG_SEAT` kèm cảnh báo nhắc nhở nội bộ. | AI Service, Backend .NET |

---

### 4. Phân hệ Kiểm soát An ninh Ngoài giờ & Phát hiện Người lạ (`Security Module`)
| Mã YC | Tên chức năng | Mô tả chi tiết nghiệp vụ & Công thức xử lý | Tác nhân |
| :--- | :--- | :--- | :--- |
| **FR-SEC-01** | Chế độ an ninh trực đêm tự động (*Night Guard Mode*) | Tự động kích hoạt chế độ giám sát an ninh từ `19:00` tối đến `06:30` sáng hôm sau, và toàn bộ các ngày Thứ Bảy, Chủ Nhật, ngày nghỉ lễ quốc gia. | Backend .NET, AI Service |
| **FR-SEC-02** | Cây quyết định phân cấp cảnh báo ngoài giờ | Khi phát hiện người trong khung giờ trực đêm:<br>- **Nhánh 1 (Nhận diện thành công - Nhân viên nội bộ)**: Truy vấn bảng đăng ký làm thêm giờ (`ot_registrations`). Nếu có duyệt OT $\rightarrow$ Ghi nhật ký `APPROVED_OVERTIME` (không báo động). Nếu không đăng ký OT $\rightarrow$ Kích hoạt **Cảnh báo Mức 2 (`UNAUTHORIZED_PRESENCE`)** lên bảng điều hành.<br>- **Nhánh 2 (Không nhận diện được hoặc Người lạ - `UNKNOWN`)**: Lập tức kích hoạt **Cảnh báo Mức 3 Khẩn cấp (`SECURITY_BREACH`)**. | Backend .NET, Security Guard |
| **FR-SEC-03** | Báo động tại Trung tâm Giám sát (*SOC Video Wall*) | Khi Cảnh báo Mức 3 kích hoạt: Giao diện giám sát chuyển sang cảnh báo đỏ, phát chuông âm thanh cảnh báo ngắn, tự động phóng to luồng camera đang có xâm nhập ra trung tâm màn hình. | Frontend React, Security Guard |
| **FR-SEC-04** | Đóng gói bằng chứng số (*Digital Evidence Capture*) | Tự động chụp 01 ảnh snapshot rõ nét nhất và trích xuất đoạn video dài **10 giây** ($5\text{ giây trước}$ lấy từ bộ đệm vòng RAM và $5\text{ giây sau}$ thời điểm phát hiện xâm nhập) đẩy lên kho lưu trữ bảo mật **Cloudflare R2**. | AI Service, Backend .NET |
| **FR-SEC-05** | Thông báo kênh phụ trợ tức thời (*Out-of-band Dispatch*) | Gửi thông báo khẩn cấp tức thời kèm ảnh chụp snapshot và đường dẫn xem video bằng chứng đến nhóm trực vận hành qua **Telegram Bot API / Webhook**. | Backend .NET |
| **FR-SEC-06** | Đóng biên bản xử lý sự cố (*Ticket Closure*) | Sau khi kiểm tra hiện trường, nhân viên an ninh bắt buộc cập nhật kết quả:<br>- Nhấn **Xác nhận sự cố (`Acknowledge`)** và nhập nội dung biên bản xử lý.<br>- Hoặc nhấn **Báo động sai (`False Alarm`)** để đóng sự cố và chuyển ảnh vào thư mục phản hồi huấn luyện cải thiện mô hình. | Security Guard |

---

### 5. Phân hệ Quản trị Hệ thống, Thiết lập Vùng ảo & Báo cáo (`Admin, Zone & Reporting Module`)
| Mã YC | Tên chức năng | Mô tả chi tiết nghiệp vụ & Công thức xử lý | Tác nhân |
| :--- | :--- | :--- | :--- |
| **FR-ADM-01** | Thiết lập vùng ảo trực quan (*Virtual Zone Editor*) | Quản trị viên trích xuất khung hình chuẩn (*Calibration Frame*), dùng công cụ đồ họa trên Web (HTML5 Canvas) chấm các đỉnh tạo đa giác khép kín quanh bàn làm việc hoặc khu vực cấm (`RESTRICTED_ZONE`), gán nhãn `seat_code`. Hệ thống chuẩn hóa tọa độ các đỉnh về miền $[0.0, 1.0]$ để độc lập với độ phân giải màn hình. | System Admin |
| **FR-ADM-02** | Quản lý cấu hình ca và tham số | Cho phép cấu hình linh hoạt thời gian bắt đầu/kết thúc ca, thời gian ân hạn $T_{\text{grace}}$, ngưỡng vắng mặt $T_{\text{threshold}}$, ngưỡng nhận diện $\theta_{\text{match}}$. | System Admin, HR Officer |
| **FR-ADM-03** | Phân quyền truy cập theo vai trò (*RBAC Matrix*) | Phân quyền chặt chẽ cho 4 vai trò: `Admin` (toàn quyền), `HR` (quản lý hồ sơ, xuất bảng công, xem toàn bộ sơ đồ), `Trưởng bộ phận` (chỉ xem nhật ký công, sơ đồ bàn và nhận cảnh báo rời chỗ của team mình), `An ninh` (xem tất cả camera, tiếp nhận và đóng cảnh báo đột nhập). | Toàn bộ Tác nhân |
| **FR-ADM-04** | Kết xuất báo cáo & Tổng hợp thống kê | 1. **Báo cáo Bảng công Tổng hợp (HR)**: Xuất file `.xlsx` gồm Mã NV, họ tên, tổng ngày công, số lần đi muộn/về sớm, tổng phút muộn lũy kế và link ảnh bằng chứng.<br>2. **Báo cáo Mật độ Hiện diện (Ban Giám đốc)**: Thống kê tỷ lệ lấp đầy chỗ ngồi theo từng khung giờ.<br>3. **Nhật ký Giám sát An ninh (IT/An ninh)**: Thống kê lịch sử cảnh báo ngoài giờ, thời gian phản hồi của bảo vệ và tỷ lệ báo động giả trong tháng. | HR, Admin, Dept Lead, Security |

---

## PHẦN II: YÊU CẦU PHI CHỨC NĂNG (NON-FUNCTIONAL REQUIREMENTS - NFR)
*(Các tiêu chuẩn chất lượng hệ thống phải đáp ứng về hiệu năng, bảo mật, tính dễ sử dụng, độ tin cậy và khả năng triển khai)*

### 1. Yêu cầu về Hiệu năng & Xử lý Thời gian thực (Performance & Real-time Efficiency)
* **NFR-PERF-01 (Tốc độ xử lý luồng Video - Throughput/FPS)**:
  * Luồng camera giám sát chỗ ngồi và an ninh (chạy YOLOv8-Nano trên GPU NVIDIA GTX 1650) phải đạt tốc độ xử lý ổn định từ **15 – 25 FPS**.
  * Luồng camera điểm danh cửa ra vào phải phát hiện và trích xuất đặc trưng khuôn mặt trong thời gian $\le 200\text{ ms}$/khung hình.
* **NFR-PERF-02 (Độ trễ phản hồi sự kiện - End-to-End Latency)**:
  * Thời gian từ khi nhân viên bước vào vùng quét hợp lệ đến khi ghi nhận bản ghi chấm công trên giao diện đạt $\le 0.5\text{ giây}$.
  * Thời gian đẩy trạng thái chỗ ngồi mới hoặc cảnh báo đột nhập từ Backend C# .NET lên trình duyệt React thông qua **SignalR WebSocket** đạt $\le 1.0\text{ giây}$.
  * Thời gian gửi tin nhắn kèm ảnh chụp sang **Telegram Bot** khi có xâm nhập ngoài giờ đạt $\le 3.0\text{ giây}$.
* **NFR-PERF-03 (Tối ưu hóa bộ nhớ đệm - Memory Management)**:
  * Bộ đệm vòng (*Circular Ring Buffer*) lưu trữ khung hình phục vụ trích xuất video 10 giây ($5\text{s trước} + 5\text{s sau}$) phải giữ dung lượng cố định trong RAM (tối đa $150\text{ frames}$ cho mỗi luồng camera ở $15\text{ FPS}$), tự động ghi đè khung hình cũ, đảm bảo **không gây tràn bộ nhớ (Memory Leak)** khi vận hành liên tục nhiều ngày.

### 2. Yêu cầu về Độ chính xác Thị giác Máy tính (AI Accuracy & Reliability)
* **NFR-ACC-01 (Độ chính xác sinh trắc học)**:
  * Tỷ lệ nhận diện đúng (*True Acceptance Rate - TAR*) đạt $\ge 95\%$ trong điều kiện ánh sáng văn phòng tiêu chuẩn ($300 - 500\text{ lux}$).
  * Tỷ lệ chấp nhận sai người lạ thành nhân viên (*False Acceptance Rate - FAR*) giữ ở mức $< 1\%$ nhờ kết hợp ngưỡng Cosine $\theta_{\text{match}} = 0.70$ và bộ lọc chất lượng ảnh Laplace $\text{Score}_{\text{blur}} > 100$.
* **NFR-ACC-02 (Tính bất biến theo độ phân giải - Resolution Invariance)**:
  * Mọi đa giác vùng ảo bàn làm việc phải được lưu dưới dạng tọa độ tỷ lệ chuẩn hóa $[0.0, 1.0]$. Khi thay đổi độ phân giải luồng camera (ví dụ từ $1280\times720$ sang $1920\times1080$) hoặc co giãn màn hình trình duyệt, vị trí vùng đa giác không bị lệch.

### 3. Yêu cầu về Bảo mật & Quyền riêng tư (Security & Data Privacy)
* **NFR-SEC-01 (Bảo vệ dữ liệu sinh trắc học)**:
  * Dữ liệu khuôn mặt phục vụ định danh phải được mã hóa một chiều thành vector số thực 512 chiều ($\mathbb{R}^{512}$). Không thể tái tạo ngược từ vector về hình ảnh khuôn mặt gốc.
* **NFR-SEC-02 (Bảo mật đường truyền SSL/TLS với Cloudflare)**:
  * Hệ thống triển khai trên tên miền `.id.vn` bắt buộc sử dụng giao thức **HTTPS** toàn trình theo mô hình **Cloudflare Full (Strict) SSL**:
    $$\text{Client/Browser} \xrightarrow{\text{HTTPS (Cloudflare Edge CA)}} \text{Cloudflare Edge} \xrightarrow{\text{TLS (Origin CA Certificate)}} \text{Nginx VPS}$$
* **NFR-SEC-03 (Bảo mật lưu trữ đám mây Cloudflare R2 / S3)**:
  * Các tệp tin nhạy cảm (ảnh mẫu nhân viên, ảnh snapshot vi phạm, video bằng chứng 10s) lưu trên **Cloudflare R2 / MinIO** không được mở công khai (Public Bucket) mà chỉ được cấp quyền xem tạm thời qua cơ chế **Pre-signed URL** hoặc qua lớp xác thực của Backend.
* **NFR-SEC-04 (Xác thực JWT & Phân quyền RBAC nghiêm ngặt)**:
  * Toàn bộ API của Backend C# .NET yêu cầu xác thực bằng **JWT (JSON Web Token)**; mật khẩu người dùng quản trị được băm bằng thuật toán **BCrypt**.
  * Phân tách phạm vi dữ liệu (*Data Isolation*): Tài khoản Trưởng bộ phận chỉ truy xuất được dữ liệu chấm công và sơ đồ chỗ ngồi của đúng phòng ban mình phụ trách.
* **NFR-SEC-05 (Tôn trọng quyền riêng tư tại nơi làm việc)**:
  * Hệ thống chỉ đánh giá trạng thái hiện diện vật lý tại bàn làm việc thông qua bounding box cơ thể, không cài phần mềm gián điệp lên máy tính cá nhân và tự động tắt theo dõi vắng mặt trong khung giờ nghỉ trưa (`12:00 - 13:30`).

### 4. Yêu cầu về Tính dễ sử dụng & Trải nghiệm người dùng (Usability & UX)
* **NFR-USA-01 (Trải nghiệm chấm công không điểm chạm - Frictionless UX)**:
  * Nhân viên di chuyển tự nhiên qua cửa sảnh mà không cần dừng lại quẹt thẻ hay đặt vân tay, xóa bỏ tình trạng ùn tắc giờ cao điểm.
* **NFR-USA-02 (Cấu hình vùng ảo trực quan không cần lập trình - No-Code Zone Setup)**:
  * Giao diện *Virtual Zone Editor* trên React cho phép Admin kéo thả, chấm điểm vẽ đa giác bàn làm việc trực tiếp trên ảnh chụp camera với thao tác hoàn tất dưới 2 phút cho mỗi bàn mà không cần chỉnh sửa mã nguồn.
* **NFR-USA-03 (Khả năng quan sát tức thời - Visual Situational Awareness)**:
  * Sơ đồ chỗ ngồi (*Live Seat Map*) và màn hình trực ban an ninh (*SOC Video Wall*) sử dụng quy ước mã màu chuẩn (Xám / Xanh lá / Vàng cam / Đỏ nhấp nháy) kết hợp cảnh báo âm thanh giúp người vận hành nắm bắt trạng thái toàn văn phòng chỉ trong một ánh nhìn.

### 5. Yêu cầu về Kiến trúc, Khả năng bảo trì & Triển khai (Architecture, Maintainability & DevOps - CLO1)
* **NFR-ARC-01 (Tuân thủ kiến trúc Modular Monolith)**:
  * Backend C# .NET được đóng gói trong một tiến trình triển khai duy nhất nhưng tách biệt hoàn toàn thành 5 module độc lập (`Biometrics`, `Attendance`, `Occupancy`, `Security`, `Reporting`). Các module không truy cập chéo bảng dữ liệu nội bộ của nhau mà giao tiếp qua tầng Application/Contract rõ ràng.
* **NFR-ARC-02 (Ảo hóa Docker Compose & Tương thích Đa môi trường)**:
  * Toàn bộ các thành phần (`backend`, `ai_service`, `frontend`, `postgres`, `nginx`) được định nghĩa trong `docker-compose.yml`, đảm bảo khởi chạy đồng nhất trên cả máy cá nhân và máy chủ **VPS Linux (Ubuntu / Amazon EC2)** chỉ bằng một câu lệnh.
* **NFR-ARC-03 (Tự động hóa CI/CD)**:
  * Tích hợp pipeline **GitHub Actions** tự động kiểm tra biên dịch (`.NET Build`, `React Build`), chạy bộ kiểm thử đơn vị (`xUnit` / `PyTest`) và tự động cập nhật container lên VPS khi có bản phát hành mới trên nhánh `main`.
* **NFR-ARC-04 (Hỗ trợ đa nguồn Camera phục vụ Demo & Thực tế)**:
  * Tầng `ai_service` hỗ trợ thay đổi nguồn thu hình ảnh qua biến môi trường mà không cần sửa code: Webcam USB nội bộ, Camera điện thoại qua WiFi (RTSP/HTTP stream), Camera IP văn phòng, hoặc tệp Video kịch bản dựng sẵn (*Simulation/Replay Mode*).

