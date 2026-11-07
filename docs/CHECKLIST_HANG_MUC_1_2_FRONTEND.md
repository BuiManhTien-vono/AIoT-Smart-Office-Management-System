# Checklist triển khai frontend — Hạng mục 1 và 2

> Phạm vi: hai hạng mục đầu trong `docs/BANG_PHAN_CONG_THIET_KE_WEB_FRONTEND.md`.
>
> Trạng thái mặc định của checklist là chưa xác nhận hoàn thành. Đánh dấu khi code, tích hợp API và rà soát giao diện tương ứng đã xong.
>
> Tham chiếu thiết kế: `docs/UI_DESIGN_SYSTEM.md`, `docs/TEMPLATE_GIAO_DIEN_MAU.md` và các lựa chọn trong `docs/TEMPLATE_DOI_CHIEU_LUA_CHON_UI.md`.

## 0. Chuẩn bị và quy ước dùng chung

### Tiến độ triển khai — 07/11/2026

- [x] Đã triển khai các thành phần và trang của hạng mục 1 và 2, nối API theo DTO hiện tại.
- [x] Build frontend và các kiểm tra giả lập công thức, phạm vi, phiên, route guard và CSV đã đạt.
- [x] Đã gọi thành công API đăng nhập, danh sách tài khoản/phòng ban, tổng hợp ngày, báo cáo tháng và tải CSV trên backend cục bộ dùng bộ nhớ.
- [x] Đợt sửa bố cục gọn đã kiểm tra trực quan trên trình duyệt ở 375px, 768px, 1024px, 1280px và 1440px. Đăng nhập/danh sách thực được xem qua API đọc; báo cáo có dữ liệu, rỗng và lỗi dùng máy chủ giả lập riêng. Bằng chứng và giới hạn ghi tại `harness/TASK_COMPACT_UI.md`.
- [x] Đợt cập nhật hiển thị mới thay mức padding gọn bằng 16px desktop/14px điện thoại, bỏ greeting và đưa ngày làm việc lên trên nút Làm mới. Các trang sau đăng nhập dùng ảnh nền/kính mờ chung. Đã kiểm tra trực tiếp Tổng quan, Báo cáo, Tài khoản và modal ở 1440px/375px; trang đăng nhập giữ thiết kế riêng. Bằng chứng và giới hạn ghi tại `harness/TASK_GLASS_UI.md`; không chạy lại build/lint theo yêu cầu người dùng.
- [ ] Chưa thử tạo tài khoản thực qua API. Kiểm duyệt tự động chặn bước thử vì thao tác cấp quyền truy cập mới.
- [ ] Chưa tích hợp feed thông báo/đánh dấu đã đọc do API chưa có contract tương ứng.
- [ ] Xác thực JWT và cưỡng chế quyền/phạm vi ở backend vẫn cần triển khai. Frontend đã lọc menu, chặn route và giới hạn truy vấn/hiển thị theo vai trò.

Các dòng checklist chi tiết bên dưới được giữ để nhóm nghiệm thu từng tiêu chí sau khi chạy giao diện. Chỉ đánh dấu tiêu chí đã kiểm chứng, không suy ra nghiệm thu từ việc có mã nguồn.

- [ ] Đối chiếu hợp đồng API, kiểu dữ liệu và quyền truy cập thực tế trước khi tích hợp từng trang.
- [ ] Tạo token dùng chung cho navy/xanh dương, nền, surface, chữ, viền, focus ring và màu trạng thái.
- [ ] Áp dụng lựa chọn đã ghi nhận: serif cho tiêu đề, sans cho nội dung, bố cục gọn với khoảng cách rút ngắn, bo vừa, phân lớp nhẹ, Phosphor, trạng thái active có nền.
- [x] Giảm cỡ chữ tiêu đề/nhãn/component đang quá lớn khoảng 3–6px so với mockup cũ; giữ nội dung chính khoảng 14px trở lên và chữ phụ tối thiểu 12px.
- [x] Dùng control cao 36–40px và topbar 48–52px; theo yêu cầu mới, padding card/panel 16px desktop/14px điện thoại, gap giữa vùng dữ liệu 12px, gutter 20px desktop/12px điện thoại và padding dọc hàng bảng 8px. Giữ mức giảm cỡ chữ 3–6px đã nêu; vùng đích chạm tối thiểu 44px trên thiết bị cảm ứng.
- [ ] Áp dụng màu trạng thái theo tài liệu phân công: xanh `#10B981`, hổ phách `#F59E0B`, đỏ `#EF4444`, tím `#8B5CF6`, xám `#64748B`.
- [ ] Dùng nhãn hoặc biểu tượng cùng màu trạng thái; không truyền đạt trạng thái chỉ bằng màu.
- [ ] Chuẩn hóa trạng thái loading, error, empty, success, disabled, focus và stale/offline.
- [ ] Đảm bảo các trang có thể dùng bằng bàn phím, focus rõ, nhãn truy cập phù hợp và tương phản đạt yêu cầu.
- [ ] Rà soát bố cục ở desktop, tablet và điện thoại; không gây cuộn ngang toàn trang.
- [ ] Giữ chuyển động tinh tế, khoảng 200 ms ease-in-out theo lựa chọn hiện tại và hỗ trợ `prefers-reduced-motion`.

## Hạng mục 1 — Khung ứng dụng, đăng nhập, phân quyền và tài khoản

### 1.1. Trang đăng nhập — `LoginPage`

- [ ] Dựng layout split-screen theo mẫu đã chọn.
- [ ] Dùng ảnh văn phòng phủ navy làm panel nhận diện, bảo đảm nội dung chữ đủ tương phản.
- [ ] Dùng serif cho tiêu đề, sans cho form và nội dung; có font dự phòng hỗ trợ tiếng Việt.
- [ ] Tạo form tên đăng nhập và mật khẩu có nhãn hiển thị, `autocomplete` phù hợp và focus bàn phím.
- [ ] Gọi `POST /api/v1/reporting/auth/login` với dữ liệu hợp lệ.
- [ ] Thể hiện loading và ngăn gửi lặp trong khi đăng nhập.
- [ ] Hiển thị lỗi xác thực/lỗi kết nối gần form và cho phép thử lại.
- [ ] Trình bày lựa chọn demo bốn vai trò theo hàng; nhãn và thứ tự vai trò nhất quán với API.
- [ ] Cho phép đăng nhập demo trực tiếp chỉ trên môi trường phát triển và tài khoản demo được cấu hình.
- [ ] Không cung cấp luồng đăng nhập demo trực tiếp trong production.
- [ ] Lưu phiên đăng nhập theo thời hạn token, xử lý hết hạn và chuyển về trang đăng nhập.
- [ ] Kiểm tra responsive, focus, phóng to chữ và thao tác bàn phím.

### 1.2. Khung ứng dụng — `MainLayout`, Sidebar, Topbar và `RouteGuard`

- [x] Dựng sidebar navy có thể thu gọn/mở rộng: khi mở hiển thị nhãn; khi thu gọn chỉ hiển thị icon, có tooltip và tên truy cập, dùng biểu tượng Phosphor.
- [x] Đánh dấu mục hiện tại bằng nền nhấn; nhãn hiện trong chế độ mở và tooltip/tên truy cập vẫn rõ trong chế độ thu gọn.
- [ ] Lọc mục điều hướng theo vai trò và chặn truy cập route không đủ quyền.
- [ ] Kiểm tra scope Trưởng phòng theo phòng ban được gán; thông báo khi tài khoản thiếu cấu hình cần thiết.
- [ ] Hiển thị tài khoản/vai trò hiện tại và thao tác đăng xuất.
- [ ] Hiển thị Backend và AI Service thành hai pill có nhãn cùng chấm trạng thái.
- [ ] Kiểm tra health khi tải trang và khi người dùng làm mới; không polling định kỳ theo lựa chọn hiện tại.
- [ ] Hiển thị thời điểm kiểm tra gần nhất để người dùng hiểu độ mới của trạng thái.
- [ ] Hiển thị đồng hồ hệ thống theo múi giờ văn phòng đã thống nhất.
- [ ] Chuông ưu tiên cảnh báo nghiệp vụ; badge đếm thông báo chưa đọc.
- [ ] Sắp xếp thông báo theo mức độ rồi thời gian; phân quyền nội dung thông báo.
- [ ] Xác nhận nguồn API và các hành động đọc/đánh dấu đã đọc trước khi triển khai feed.
- [ ] Có trạng thái khi không có thông báo, lỗi tải và mất kết nối.
- [ ] Kiểm tra sidebar, topbar, focus order và nội dung ở màn hình hẹp.

### 1.3. Trang quản lý tài khoản — `UserManagementPage`

- [ ] Tải danh sách bằng `GET /api/v1/reporting/users`.
- [ ] Hiển thị bảng người dùng với họ tên, username, vai trò, phòng ban và trạng thái.
- [ ] Đặt tìm kiếm làm thao tác chính; bộ lọc vai trò và phòng ban là thao tác phụ.
- [ ] Đồng bộ bộ lọc với dữ liệu trả về; không hiển thị bản ghi ngoài quyền được phép.
- [ ] Có loading, lỗi và thử lại, không có dữ liệu, không có kết quả lọc.
- [ ] Dựng modal tạo tài khoản với form một cột.
- [ ] Hiện trường phòng ban theo vai trò; bắt buộc chọn phòng ban khi tạo Trưởng phòng.
- [ ] Kiểm tra dữ liệu bắt buộc và hiển thị lỗi gần trường tương ứng.
- [ ] Gửi tài khoản mới qua `POST /api/v1/reporting/users`.
- [ ] Khóa thao tác gửi lặp, giữ nội dung khi lỗi và thông báo thành công.
- [ ] Sau khi tạo thành công, đóng modal và tải lại danh sách.
- [ ] Kiểm tra modal bằng bàn phím, thao tác hủy/đóng và focus.
- [ ] Xác nhận với nhóm/API nếu cần bổ sung phân trang, sửa tài khoản hoặc đổi trạng thái; các thao tác này chưa nằm trong yêu cầu hiện tại.

## Hạng mục 2 — Dashboard, biểu đồ chuyên cần và xuất CSV

### 2.1. Dashboard — `DashboardPage` và `KpiStatCards`

- [ ] Tải dữ liệu ngày từ `GET /api/v1/reporting/daily-summaries`.
- [ ] Hiển thị đúng bốn KPI: tổng nhân sự, đi làm đúng giờ, rời bàn quá hạn, cảnh báo an ninh ngoài giờ.
- [ ] Dùng lưới KPI 2 × 2 theo lựa chọn hiện tại.
- [ ] Mỗi KPI có nhãn, giá trị, ngữ cảnh/kỳ dữ liệu và cách tính rõ ràng.
- [ ] Chỉ hiển thị xu hướng nhỏ nếu API có lịch sử so sánh; ẩn phần xu hướng khi thiếu dữ liệu.
- [ ] Hiển thị timestamp cập nhật và điều khiển chọn chu kỳ cập nhật.
- [ ] Chốt các chu kỳ được phép và giá trị mặc định cùng nhóm/API trước khi triển khai control.
- [ ] Thể hiện rõ loading, error, empty, dữ liệu bằng 0 và trạng thái dữ liệu cũ.
- [ ] Áp dụng scope theo vai trò; Trưởng phòng chỉ xem phòng ban được gán.
- [ ] Kiểm tra số liệu, đơn vị, định dạng ngày và trạng thái trong lưới 2 × 2 ở các breakpoint.

### 2.2. Báo cáo tháng — `MonthlyReportPage`

- [ ] Tải báo cáo qua `GET /api/v1/reporting/monthly-report?year=...&month=...`.
- [ ] Có bộ chọn tháng/năm và phòng ban trong toolbar riêng phía trên nội dung.
- [ ] Giới hạn lựa chọn và dữ liệu theo vai trò; Trưởng phòng chỉ xem phòng ban được gán.
- [ ] Đồng bộ kỳ/phòng ban đã chọn giữa biểu đồ, bảng và CSV.
- [ ] Giữ biểu đồ cột chồng theo yêu cầu, với màu đúng giờ/đi muộn/vắng theo palette cố định.
- [ ] Thêm legend và bảng số liệu để đọc giá trị chính xác, không phụ thuộc hover.
- [ ] Đặt biểu đồ và bảng cạnh nhau trên desktop; chuyển thành xếp dọc trên màn nhỏ.
- [ ] Chốt công thức tỷ lệ, mẫu số và quy tắc làm tròn theo contract API trước khi ghi trục/nhãn.
- [ ] Cung cấp tiêu đề, kỳ dữ liệu, chú giải và phương án truy cập biểu đồ bằng bàn phím/trình đọc màn hình.
- [ ] Có trạng thái tải, lỗi, thử lại, kỳ không hợp lệ, dữ liệu rỗng và không có kết quả lọc.

### 2.3. Xuất CSV — trong toolbar báo cáo

- [ ] Tạo menu xuất có tóm tắt kỳ và phòng ban đang áp dụng.
- [ ] Khi người dùng xác nhận phạm vi, tải trực tiếp CSV qua `GET /api/v1/reporting/export-csv`.
- [ ] Bảo đảm UTF‑8 BOM để Excel đọc đúng tiếng Việt.
- [ ] Hiển thị trạng thái đang xuất và chặn thao tác lặp.
- [ ] Thông báo thành công hoặc lỗi gần thao tác xuất.
- [ ] Đặt tên tệp thể hiện kỳ báo cáo.
- [ ] Kiểm tra dữ liệu xuất dùng cùng kỳ, phòng ban và quyền như báo cáo trên màn hình.
- [ ] Xác nhận schema/cột, thứ tự, định dạng ngày và số với backend trước khi nghiệm thu.

## Rà soát bàn giao hai hạng mục

- [ ] Điều hướng và route guard khớp ma trận vai trò.
- [ ] Các lựa chọn giao diện đã chọn khớp `docs/TEMPLATE_DOI_CHIEU_LUA_CHON_UI.md`.
- [ ] Đã kiểm tra cặp màu thực tế cho tương phản, nhất là ảnh đăng nhập, bảng và badge trạng thái.
- [ ] Không dùng màu hoặc icon đơn lẻ để truyền tải thông tin quan trọng.
- [ ] Các thao tác bất đồng bộ có phản hồi, lỗi rõ và cách thử lại phù hợp.
- [ ] Kiểm tra giao diện ở desktop, tablet, điện thoại và với thao tác bàn phím.
- [ ] Đối chiếu endpoint, quyền, công thức số liệu và phạm vi export với backend.
- [ ] Ghi lại quyết định còn mở vào `docs/TEMPLATE_DOI_CHIEU_LUA_CHON_UI.md` trước khi hoàn tất.
