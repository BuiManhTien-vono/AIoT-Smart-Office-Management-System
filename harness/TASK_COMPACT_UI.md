# Task — Cập nhật giao diện gọn theo yêu cầu ngày 07/11/2026

## Yêu cầu và phạm vi

Áp dụng bản sửa mới của `docs/UI_DESIGN_SYSTEM.md`, `docs/TEMPLATE_GIAO_DIEN_MAU.md`, `docs/TEMPLATE_DOI_CHIEU_LUA_CHON_UI.md`, `docs/BANG_PHAN_CONG_THIET_KE_WEB_FRONTEND.md` và `docs/CHECKLIST_HANG_MUC_1_2_FRONTEND.md` cho frontend hạng mục 1–2 và UI dùng chung.

- Khoảng cách thường 4–6px, padding panel 6–8px, gutter desktop 8–12px, padding dọc ô bảng 4–5px.
- Chữ lớn giảm 3–6px, nội dung chính ít nhất 14px, chữ phụ ít nhất 12px.
- Control desktop 36–40px, topbar desktop 48–52px. Vùng tương tác cảm ứng ít nhất 44px.
- Sidebar mở có nhãn; thu gọn chỉ có icon với tooltip và tên truy cập. Drawer mobile vẫn có nhãn.
- Giữ các hành vi đăng nhập, phân quyền, báo cáo, CSV và trạng thái dữ liệu đã có.

## Baseline và cách làm

- Git đã có thay đổi ở tài liệu, frontend, AGENTS.md và harness. Chỉ chỉnh các file giao diện liên quan cùng ghi nhận nghiệm thu nhiệm vụ này.
- Baseline CSS dùng panel 24px, gutter 36px, topbar tối thiểu 92px. Sidebar thu gọn còn rộng 216px và vẫn hiện nhãn. Những giá trị này khác yêu cầu mới.
- Baseline harness frontend PASS cho lint/build. Report `harness/runs/20261107T091754703Z-frontend-43000.json`.
- Đã quan sát trang đăng nhập trước khi sửa qua trình duyệt cục bộ.
- Sửa token kích thước trước, tiếp theo shell/sidebar, rồi stylesheet đăng nhập, tài khoản và báo cáo. Kiểm tra bằng profile frontend và thao tác UI trên trình duyệt.
- Giữ serif tiêu đề theo template cụ thể của hạng mục 1–2; yêu cầu mới về mật độ không thay đổi lựa chọn font đã ghi nhận.

## Tiêu chí nghiệm thu

- [x] Kích thước desktop đo trên UI đáp ứng các ngưỡng trên.
- [x] Thu gọn/mở rộng sidebar, tooltip khi focus/hover và điều hướng hoạt động.
- [x] Bố cục 375px, 768px, 1024px, 1440px không tràn ngang toàn trang; bảng cuộn trong khung.
- [x] Biểu mẫu và trạng thái loading/error/empty vẫn đọc được và dùng được bằng bàn phím.
- [x] Profile frontend đạt sau thay đổi.

## Kết quả thực hiện

| Kiểm tra | Trạng thái | Bằng chứng / giới hạn |
|---|---|---|
| `scripts/harness.ps1 -Profile frontend` | PASS | Lint không có cảnh báo; TypeScript/Vite build thành công. Report cuối `harness/runs/20261107T093941122Z-frontend-29768.json`. |
| Đo desktop trên trình duyệt | PASS | Topbar 50px tại 1024/1280/1440px; nút 38px; panel padding 8px; ô bảng padding dọc 5px; body 14px; heading trang 30px tại 1440px. |
| Sidebar thu gọn | PASS | Desktop từ 228px xuống 64px; nhãn ẩn, link giữ tên truy cập. Tooltip hiện khi hover và Tab, Escape ẩn tooltip. Điều hướng Tài khoản/Báo cáo hoạt động. |
| Responsive | PASS | Đã quan sát 375/768/1024/1280/1440px. `scrollWidth` của trang không vượt `clientWidth`. Bảng tài khoản 750px nằm trong khung cuộn khoảng 743px tại 768px. |
| Drawer và cảm ứng | PASS | Tại 375px, nhãn drawer vẫn hiện sau khi desktop đã thu gọn. Hàng menu và nút/input đạt 44px, input 16px. Escape đóng drawer. Đây là viewport trình duyệt, chưa phải kiểm tra thiết bị vật lý. |
| Modal tài khoản | PASS | Modal một cột ở 375px; chọn Trưởng phòng, gửi form trống tạo bốn lỗi tại trường và đưa focus tới summary. Modal cuộn khi cần. Hủy trả focus về nút Tạo tài khoản. Không gửi yêu cầu tạo tài khoản tới backend thật. |
| Báo cáo với dữ liệu | PASS | Dùng phản hồi tổng hợp giả lập của ba phòng ban, hai ngày. Biểu đồ/bảng cạnh nhau ở 1440px, xếp dọc ở màn hình nhỏ. Mốc 100/50/0% khớp vị trí cột 200px. |
| Trạng thái báo cáo | PASS | Đã thấy trạng thái tải. Kỳ 09/2025 giả lập rỗng, kỳ 08/2025 giả lập lỗi 503 có nút thử lại. Chuyển lại 11/2026 hiển thị số liệu và cho mở menu xuất. |
| Menu xuất CSV | PASS | Mở được bằng nút, hiện kỳ/phạm vi, không tràn ở 375px; Escape đóng. Kiểm tra này xác nhận UI, không tải lại hoặc kiểm chứng nội dung CSV trong nhiệm vụ sửa mật độ. |
| Đăng nhập | PASS | Split-screen desktop, xếp dọc mobile. Thử mật khẩu sai trên fixture tạo thông báo đỏ, focus vào lỗi, nút cao 44px tại 375px. Dấu cách tại câu thương hiệu khi ẩn xuống dòng mobile đã sửa và xác nhận. |

## Nguồn dữ liệu và giới hạn bằng chứng

- Đã đăng nhập và xem trang tài khoản/tổng quan qua backend đang chạy ở cổng 5155. Dữ liệu tổng hợp ngày hiện rỗng. Lần thử mở thêm backend mẫu bị trùng cổng; không dừng tiến trình sẵn có.
- Để kiểm tra biểu đồ và trạng thái có dữ liệu/rỗng/lỗi, dùng máy chủ phản hồi tổng hợp tạm thời tại 5157 và Vite xem trước riêng tại 5174, với tài khoản `preview_admin` và tên hiển thị “Dữ liệu giả lập”. Không có database hoặc gọi dịch vụ bên ngoài trong fixture. Không sửa `.env.local` của dự án.
- Ảnh báo cáo trong phần bàn giao dùng dữ liệu giả lập. Preview kiểm tra và máy chủ fixture được dừng khi hoàn tất; viewport được trả về mặc định và tab bàn giao quay về ứng dụng 5173.
- Các kiểm tra UI là thao tác trình duyệt của nhiệm vụ, không nằm trong profile tự động frontend. Profile hiện chỉ lint/build. Không diễn đạt report harness này thành bộ kiểm tra end-to-end tự động hoặc nghiệm thu phân quyền backend.
- Các tiêu chí ngoài phần sửa giao diện trong checklist tổng vẫn giữ trạng thái riêng; chỉ đánh dấu các tiêu chí đã có bằng chứng trong đợt này.

## Thay đổi bổ sung phát hiện khi quan sát

- Badge tài khoản bị quy tắc `.badge` chung ghi đè màu. Tăng specificity của hai trạng thái tài khoản để dùng đúng màu ngữ nghĩa.
- Thông báo lỗi đăng nhập/form dùng biến thể lỗi chung; badge cảnh báo dữ liệu cũ có màu cảnh báo rõ.
- Căn lại lưới/trục biểu đồ theo cùng chiều cao cột, tránh lệch mốc tỷ lệ khi thu gọn vùng vẽ.
