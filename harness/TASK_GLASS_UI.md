# Điều chỉnh hiển thị — ảnh nền, kính mờ và khoảng đệm

Yêu cầu ngày 07/11/2026 áp dụng cho các trang sau đăng nhập trong phạm vi hiện có của frontend.

## Tiêu chí hiển thị

- Tăng khoảng cách từ viền container tới nội dung, dùng padding 16px desktop và 14px điện thoại, gap 12px giữa các vùng dữ liệu.
- Bỏ greeting trên Dashboard. Đưa ngày làm việc sang phải tiêu đề, phía trên nút Làm mới; cho phép xếp hàng ở màn hình hẹp.
- Dùng ảnh nền văn phòng và glassmorphism cho shell, panel, topbar, sidebar và overlay sau đăng nhập.
- Trang đăng nhập giữ thiết kế riêng; theme kính chỉ được khai báo trong `.workspace-shell`.
- Chỉ kiểm tra hiển thị thực tế theo yêu cầu người dùng. Không chạy profile lint/build hay kiểm tra nghiệp vụ cho đợt sửa này.

## Kiểm tra trình duyệt

**PASS — hiển thị thực tế** trên desktop 1440px và điện thoại 375px:

- Tổng quan: không còn greeting; ngày làm việc ngang vùng tiêu đề, ngay trên nút Làm mới trên desktop. Màn hình hẹp xếp hàng phù hợp.
- Tổng quan, Báo cáo tháng và Tài khoản: ảnh nền văn phòng, panel kính sáng, sidebar/drawer kính navy và topbar kính hiển thị nhất quán.
- Padding panel/form 16px trên desktop, 14px trên điện thoại; bảng có khoảng lùi khỏi viền panel, không bị cộng padding hai lần.
- Modal tạo tài khoản dùng nền kính có độ phủ cao để chữ rõ; form vừa màn hình 375px. Chỉ mở và hủy modal, không tạo tài khoản.
- Không quan sát thấy cuộn ngang toàn trang ở các kích thước đã kiểm tra.
- Đăng nhập: đã xem trực tiếp trên desktop, giữ bố cục riêng, form nền trắng và không có lớp kính của workspace.

**PARTIAL — phạm vi bằng chứng:** backend hiện chưa có dữ liệu báo cáo ngày/tháng, nên quan sát báo cáo ở trạng thái rỗng; chưa xác minh lại biểu đồ có dữ liệu, menu xuất CSV và đăng nhập trên điện thoại trong đợt này. Không kết luận về nghiệp vụ, API hoặc phân quyền từ kiểm tra hiển thị.

Theo yêu cầu người dùng, không chạy lint, build hoặc profile kiểm thử tự động cho đợt sửa này. Đã trả trình duyệt về kích thước mặc định sau khi kiểm tra.

Ảnh desktop: `C:/Users/Admin/.codex/visualizations/2026/11/07/01a1b38f-0885-77b1-b254-fe0ead7b8703/smart-office-glass-dashboard.jpg`.

## Điều chỉnh tiếp — header và badge Dashboard

Yêu cầu: tăng badge của panel cập nhật, căn giữa hai khối header theo chiều dọc, đưa eyebrow lên nhãn trang trên topbar và bỏ dòng lặp phía trên tiêu đề.

**PASS — kiểm tra trực tiếp trên trình duyệt** tại 1440px và 375px:

- Badge từ chữ 12px, padding 2px/6px, cao 22px thành chữ 14px, padding 6px/12px, cao 33px.
- Ở desktop, hai khối con của header có cùng tọa độ tâm dọc 104,5px; bỏ padding-top 28px của khối ngày/nút và margin-bottom của h1.
- Header không còn eyebrow; nhãn trang topbar hiển thị chữ xanh, đậm, viết hoa. Màn hình hẹp giữ nhãn “TỔNG QUAN”, header xếp hàng tự nhiên.
- Không quan sát thấy cuộn ngang toàn trang tại hai kích thước kiểm tra.

Bản xem thử cũ và dịch vụ dữ liệu cục bộ đã dừng trước khi kiểm tra. Dùng Vite riêng tại 5174 và API giả lập loopback tại 5157 với phiên `preview_admin`, dữ liệu ngày rỗng. Đây là bằng chứng hiển thị, không xác minh lại nghiệp vụ hoặc tích hợp backend. Hai tiến trình kiểm tra riêng đã dừng; không đổi `.env` dự án. Trình duyệt đã trả về kích thước mặc định và ứng dụng chính tại 5173.

Không chạy lint/build theo lựa chọn kiểm tra hiển thị của người dùng. Ảnh desktop mới: `C:/Users/Admin/.codex/visualizations/2026/11/07/01a1b38f-0885-77b1-b254-fe0ead7b8703/dashboard-header-badge.jpg`.
