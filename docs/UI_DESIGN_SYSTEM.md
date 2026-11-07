# Hệ thống thiết kế giao diện — Smart Office AIoT

> Phiên bản 1 · Ngôn ngữ: tiếng Việt · Ưu tiên: desktop, hỗ trợ tablet và điện thoại

## 1. Định hướng

Smart Office là ứng dụng vận hành văn phòng, kết hợp công việc quản trị với giám sát dữ liệu thời gian thực. Giao diện dùng nền sáng cho quản trị, nhân sự, chấm công và báo cáo; dùng bề mặt tối riêng cho trung tâm an ninh (SOC), camera và bản đồ trực tiếp. Hai bề mặt chia sẻ cùng kiểu chữ, thành phần, khoảng cách, biểu tượng và quy ước trạng thái.

Nguyên tắc thiết kế:

- Đưa trạng thái, cảnh báo cần xử lý và hành động chính lên vị trí dễ thấy.
- Dữ liệu trực tiếp luôn kèm trạng thái kết nối và thời điểm cập nhật gần nhất.
- Mỗi màn hình có một hành động chính rõ ràng.
- Màu sắc đi cùng nhãn hoặc biểu tượng, không truyền tải ý nghĩa bằng màu đơn thuần.
- Menu và hành động theo quyền tài khoản. Backend vẫn phải kiểm tra quyền và phạm vi dữ liệu.
- Bảo vệ ảnh sinh trắc học và bằng chứng an ninh theo quyền truy cập.

## 2. Vai trò và nhu cầu

| Vai trò | Nhu cầu chính |
|---|---|
| Quản trị viên | Tài khoản, phân quyền, camera, vùng ảo, ca làm và cấu hình |
| Nhân sự | Hồ sơ nhân viên, đăng ký sinh trắc học, đối soát và xuất bảng công |
| Trưởng bộ phận | Dữ liệu chấm công, sơ đồ chỗ ngồi và cảnh báo trong phạm vi phòng ban |
| An ninh | Camera, hàng đợi sự cố, xác nhận/báo động sai và biên bản xử lý |
| Nhân viên | Thông tin cá nhân và dữ liệu chấm công cá nhân khi phân hệ được triển khai |

Tên vai trò hiện có trong API có thể khác tài liệu nghiệp vụ. Dùng ma trận quyền và hợp đồng API đã xác nhận làm chuẩn, không suy quyền từ tên hiển thị.

## 3. Điều hướng theo nghiệp vụ

Menu toàn ứng dụng dự kiến gồm:

1. **Tổng quan** — KPI, sự kiện mới, cảnh báo và tình trạng dịch vụ.
2. **Nhân sự** — danh sách, hồ sơ và đăng ký sinh trắc học.
3. **Chấm công** — nhật ký, đối soát, ca làm và giải trình/nghỉ phép nếu có.
4. **Hiện diện** — sơ đồ chỗ ngồi, trạng thái vị trí và sự kiện rời bàn.
5. **An ninh** — SOC, camera, sự cố và lịch sử xử lý.
6. **Báo cáo** — bảng công, mật độ hiện diện và báo cáo an ninh.
7. **Thiết lập** — tài khoản/quyền, phòng ban, camera, vùng ảo và tham số.

Ẩn mục không được cấp quyền, kiểm tra quyền khi truy cập URL trực tiếp và áp dụng giới hạn phạm vi ở API. Trưởng bộ phận chỉ xem phòng ban được gán. Ẩn menu không thay thế kiểm soát truy cập phía máy chủ.

## 4. Bố cục ứng dụng

- Desktop dùng sidebar có thể thu gọn, header trang và vùng nội dung linh hoạt.
- Header hiển thị tiêu đề, breadcrumb khi cần, trạng thái dữ liệu, tài khoản và hành động chính.
- Bảng rộng và bản đồ có thể dùng toàn chiều rộng. Biểu mẫu và nội dung đọc dài giữ bề rộng dễ theo dõi.
- SOC và bản đồ trực tiếp tận dụng màn hình rộng. Trên màn hình nhỏ, chuyển sang danh sách và chi tiết có điều khiển rõ.
- Dùng dialog cho tác vụ ngắn. Quy trình nhiều bước hoặc cấu hình phức tạp nên có trang riêng.

## 5. Bảng màu

Các giá trị dưới đây là token khởi điểm. Cần kiểm tra tương phản trên từng cặp chữ/nền/viền trong giao diện thực tế.

### Nền sáng — quản trị, nhân sự, chấm công, báo cáo

| Token | Giá trị | Cách dùng |
|---|---|---|
| `--color-primary` | `#2563EB` | Nút chính, liên kết, lựa chọn đang hoạt động |
| `--color-primary-hover` | `#1D4ED8` | Trạng thái hover của hành động chính |
| `--color-background` | `#F8FAFC` | Nền trang |
| `--color-surface` | `#FFFFFF` | Panel, card, bảng và dialog |
| `--color-foreground` | `#1E293B` | Chữ chính |
| `--color-muted-foreground` | `#475569` | Chữ phụ |
| `--color-border` | `#CBD5E1` | Viền và đường chia |
| `--color-focus` | `#2563EB` | Vòng focus bàn phím |

### Nền tối — SOC, camera và giám sát trực tiếp

| Token | Giá trị | Cách dùng |
|---|---|---|
| `--color-ops-background` | `#0F172A` | Nền khu vực giám sát |
| `--color-ops-surface` | `#1E293B` | Panel và thẻ |
| `--color-ops-foreground` | `#F8FAFC` | Chữ chính |
| `--color-ops-muted-foreground` | `#CBD5E1` | Chữ phụ |
| `--color-ops-border` | `#475569` | Viền và đường chia |
| `--color-ops-primary` | `#60A5FA` | Liên kết và lựa chọn đang hoạt động |

### Màu trạng thái chung

| Ý nghĩa | Nền nhạt | Chữ/biểu tượng |
|---|---|---|
| Bình thường, thành công | `#DCFCE7` | `#166534` |
| Cần chú ý | `#FEF3C7` | `#92400E` |
| Sự cố, nguy hiểm | `#FEE2E2` | `#991B1B` |
| Thông tin | `#DBEAFE` | `#1E40AF` |
| Không rõ, offline, chưa có dữ liệu | `#E2E8F0` | `#334155` |

Trên nền tối, chọn biến thể trạng thái có tương phản phù hợp. Mỗi trạng thái cần nhãn dễ hiểu như “Đúng giờ”, “Cần xác minh”, “Sự cố”, “Mất kết nối”. Không nhấp nháy liên tục.

### Màu phù hợp và màu cần tránh

**Phù hợp**

- Nền trung tính, chữ rõ và một màu hành động chính xanh dương.
- Xanh lá, vàng hổ phách, đỏ, xanh thông tin và xám theo đúng ý nghĩa trạng thái.
- Màu biểu đồ có nhãn trực tiếp, marker hoặc kiểu nét để phân biệt chuỗi.

**Tránh**

- Đỏ làm màu thương hiệu hoặc màu nút chính trên toàn ứng dụng, khiến cảnh báo mất nổi bật.
- Xanh lá dùng trang trí cho mọi nút hoặc bề mặt.
- Đỏ, vàng, xanh xuất hiện cạnh nhau không có nhãn và ngữ nghĩa rõ.
- Chữ xám nhạt trên nền sáng, chữ tối trên nền tối, chữ trên video thiếu nền tương phản.
- Neon, gradient bão hòa toàn màn hình, quá nhiều màu nhấn cùng cấp.
- Dùng màu làm dấu hiệu duy nhất cho trạng thái.

## 6. Chữ và hình thức

- Chọn sans-serif hỗ trợ tiếng Việt, ví dụ **Inter** hoặc **Be Vietnam Pro**.
- Dùng monospace có giới hạn cho mã nhân viên, ID sự kiện và timestamp cần canh hàng.
- Chữ nội dung khoảng 16px; chữ phụ không nhỏ hơn 12px.
- Dùng thang khoảng cách bội số 4px, ưu tiên nhịp 8px. Padding panel thường 20–24px, gutter desktop 24–32px.
- Bo góc nhất quán khoảng 8–12px, đổ bóng nhẹ.
- Tránh hiệu ứng glass/blur phía sau bảng hoặc đoạn chữ dài.
- Dùng một bộ icon SVG như Phosphor hoặc Lucide. Không dùng emoji làm icon hệ thống.

## 7. Quy tắc thành phần

### Bảng và danh sách

- Cột có tiêu đề rõ, số liệu căn nhất quán, bộ lọc và sắp xếp khi phù hợp.
- Bảng dài có tiêu đề cột cố định. Trên màn hình nhỏ dùng danh sách thẻ hoặc vùng cuộn có chủ đích.
- Badge trạng thái có chữ. Hành động theo hàng có tên truy cập rõ.
- Có trạng thái đang tải, lỗi và thử lại, chưa có dữ liệu, không tìm thấy kết quả.

### KPI và biểu đồ

- KPI nêu tên, giá trị, đơn vị, khoảng thời gian và chú thích công thức khi cần.
- Dùng đường cho xu hướng thời gian, cột cho so sánh nhóm, cột chồng cho cơ cấu thành phần.
- Biểu đồ live có giá trị hiện tại, thời điểm cập nhật và điều khiển tạm dừng/tiếp tục khi cần.
- Cung cấp bảng hoặc mô tả văn bản cho thông tin thiết yếu. Không yêu cầu hover để đọc dữ liệu.

### Cảnh báo, camera và seat map

- Sắp xếp sự cố theo mức nghiêm trọng, thời điểm và trạng thái xử lý.
- Cảnh báo mới nổi bật nhưng không nhấp nháy liên tục. Nút xử lý ghi rõ hành động.
- Camera hiển thị tên, khu vực, kết nối và thời điểm khung hình mới nhất.
- Sơ đồ chỗ ngồi có chú giải, bộ lọc và khả năng mở chi tiết vị trí bằng chuột hoặc bàn phím.
- Canvas vùng ảo có vẽ/sửa/xóa đỉnh, hoàn tác, lưu/hủy, trạng thái chưa lưu và phương án thay thế thao tác kéo thả.

### Form và dialog

- Mỗi trường có nhãn hiển thị, gợi ý gần trường và thông báo lỗi tại chỗ.
- Khi gửi biểu mẫu nhiều lỗi, đưa focus tới phần tóm tắt lỗi liên kết với trường.
- Nút lưu thể hiện trạng thái đang lưu và ngăn gửi trùng. Dialog có cách đóng/hủy rõ.

## 8. Dữ liệu trực tiếp và thời gian

Màn hình live phân biệt **đang cập nhật**, **dữ liệu chậm**, **mất kết nối**, **dữ liệu lịch sử** và **chưa có dữ liệu**. Hiển thị thời điểm nhận sự kiện mới nhất và múi giờ văn phòng đã cấu hình. Ví dụ `07/11/2026, 09:42:15`.

Không gắn nhãn “Trực tiếp” chỉ vì trang tự tải lại theo chu kỳ. Nếu chuyển động không phục vụ việc đọc dữ liệu, hạn chế hoặc tắt chuyển động. Tôn trọng tùy chọn giảm chuyển động của hệ điều hành.

## 9. Responsive và truy cập

- Ưu tiên desktop từ 1280px cho SOC, bảng rộng và chỉnh vùng ảo. Hỗ trợ tablet 768–1279px và điện thoại từ 375px.
- Màn hình nhỏ có menu drawer, bảng chuyển dạng phù hợp, không cuộn ngang toàn trang. Không khóa zoom.
- Tương phản chữ thường tối thiểu 4.5:1, chữ lớn tối thiểu 3:1. Kiểm tra riêng cả nền sáng và tối.
- Có focus ring, thứ tự Tab hợp lý, heading đúng cấp, label form và tên truy cập cho nút icon.
- Biểu đồ, canvas, bản đồ và thao tác kéo thả có phương án bàn phím/điều khiển thay thế.
- Chuyển động tôn trọng `prefers-reduced-motion` và không gây nhấp nháy.

## 10. Công cụ

| Nhu cầu | Khuyến nghị |
|---|---|
| Nền tảng | React + TypeScript + Vite đang có trong dự án |
| Token | CSS custom properties tập trung trong stylesheet nền |
| Thành phần | HTML semantic; chỉ bổ sung thư viện UI accessible sau khi đánh giá tích hợp |
| Icon | Chọn một bộ SVG nhất quán, Phosphor hoặc Lucide |
| Biểu đồ | Đánh giá Chart.js hoặc Recharts khi triển khai màn hình báo cáo |
| Vùng ảo | HTML Canvas hoặc SVG; SVG thuận tiện cho điểm/đường tương tác |
| Dữ liệu live | SignalR theo kiến trúc; xử lý reconnect, stale và offline |
| Hướng dẫn thiết kế | Skill `ui-ux-pro-max` để tra cứu style, màu, typography, chart và UX |

Skill UI Pro Max là tài liệu hướng dẫn, không phải thư viện runtime. Repo hiện chưa có thư viện biểu đồ/icon/component chuyên dụng trong `package.json`; không xem công cụ đề xuất là dependency đã cài.

## 11. Thứ tự thiết kế màn hình

| Ưu tiên | Màn hình | Nội dung chính |
|---:|---|---|
| 1 | Tổng quan vận hành | KPI, sự kiện mới, cảnh báo, trạng thái backend/AI/camera, timestamp |
| 2 | Trung tâm SOC | Video, hàng đợi sự cố, xử lý/biên bản, trạng thái kết nối |
| 3 | Sơ đồ chỗ ngồi | Mặt bằng, chú giải, bộ lọc, chi tiết vị trí, độ mới dữ liệu |
| 4 | Nhật ký chấm công | Bộ lọc ngày/phòng ban/trạng thái và đối soát |
| 5 | Danh sách/hồ sơ nhân viên | Tìm kiếm, hồ sơ, phòng ban, ca, trạng thái sinh trắc học |
| 6 | Đăng ký sinh trắc học | Các bước thu nhận, chất lượng ảnh, kết quả và cảnh báo trùng |
| 7 | Báo cáo | Bộ lọc kỳ, biểu đồ, bảng và xuất file |
| 8 | Thiết lập vùng ảo | Khung camera, công cụ vẽ, danh sách vùng, lưu/hủy |
| 9 | Thiết lập hệ thống | Tài khoản, quyền, phòng ban, ca, camera và tham số |

Đây là danh sách màn hình đích theo đặc tả, không có nghĩa tất cả đã được triển khai trong frontend hoặc API.

## 12. Checklist cho mỗi trang

- Dùng token và mẫu trạng thái chung.
- Có tiêu đề, mục tiêu trang và hành động chính.
- Có loading, error, empty, success và stale/offline khi phù hợp.
- Quyền và phạm vi dữ liệu khớp vai trò.
- Đơn vị, khoảng thời gian, timestamp và công thức số liệu rõ ràng.
- Đã kiểm tra tương phản, bàn phím, focus và nhãn form.
- Không vỡ ở desktop, tablet và điện thoại.
- Chuyển động có mục đích và hỗ trợ giảm chuyển động.

## 13. Tài liệu tham chiếu trong repo

- `PROJECT_REQUIREMENTS.md` — mục tiêu, vai trò, phân hệ và yêu cầu phi chức năng.
- `docs/01_YEU_CAU_HE_THONG.md` — nghiệp vụ, RBAC, SOC, seat map và vùng ảo.
- `docs/02_SO_DO_PHAN_RA_CHUC_NANG.md` — phân rã module.
- `docs/03_THIET_KE_HE_THONG.md` — kiến trúc React, Canvas và SignalR.
- `.agents/skills/ui-ux-pro-max/SKILL.md` — hướng dẫn thiết kế và tra cứu.
