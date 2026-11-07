# Template giao diện mẫu — Smart Office AIoT

> Mục đích: làm mẫu tham chiếu khi thiết kế các trang frontend theo phương án visual của người khởi tạo. Đây là template đề xuất để nhóm đánh giá, chưa phải quyết định đồng thuận cuối cùng.
>
> Bảng phương án và phần lựa chọn để so sánh nằm riêng tại `docs/TEMPLATE_DOI_CHIEU_LUA_CHON_UI.md`.

## Phương án tham chiếu

| Tiêu chí | Lựa chọn mẫu |
|---|---|
| Tông màu thương hiệu và nền | Navy + xanh dương, nền sáng |
| Typography | Serif cho tiêu đề, sans-serif cho nội dung |
| Mật độ | Gọn; giảm khoảng trống và kích thước component đang quá lớn để ưu tiên vùng dữ liệu hữu ích |
| Hình khối component | Bo vừa, thống nhất giữa input, button, card và dialog |
| Bề mặt | Phân lớp nhẹ bằng viền và bóng mờ |
| Icon | Một bộ icon SVG đồng nhất; mục điều hướng đang chọn có nền nhấn |
| Chuyển động | Tinh tế, ngắn, có phản hồi; tôn trọng `prefers-reduced-motion` |

## Token giao diện đề xuất

Các giá trị này minh họa cách hiện thực hóa lựa chọn. Nhóm có thể chốt hoặc điều chỉnh giá trị cụ thể trong `docs/UI_DESIGN_SYSTEM.md` sau khi rà soát.

| Token | Giá trị mẫu | Cách dùng |
|---|---|---|
| `--brand-navy` | `#122844` | Sidebar, tiêu đề phụ và yếu tố nhận diện |
| `--brand-blue` | `#2563EB` | Nút chính, liên kết và lựa chọn đang hoạt động |
| `--brand-blue-hover` | `#1D4ED8` | Hover của hành động chính |
| `--page-background` | `#F5F7FB` | Nền trang |
| `--surface` | `#FFFFFF` | Card, bảng, panel và dialog |
| `--text-primary` | `#1B2C43` | Nội dung chính |
| `--text-secondary` | `#5B6B80` | Chú thích, mô tả và timestamp |
| `--border` | `#DCE4EE` | Viền và đường phân tách |
| `--radius-control` | `8px` | Input, button và điều khiển nhỏ |
| `--radius-panel` | `12px` | Card, panel và dialog |
| `--shadow-panel` | `0 3px 10px rgba(16, 35, 59, 0.06)` | Phân lớp surface nhẹ |

Màu trạng thái nghiệp vụ giữ theo tài liệu phân công: xanh `#10B981`, hổ phách `#F59E0B`, đỏ `#EF4444`, tím `#8B5CF6`, xám `#64748B`. Luôn đi kèm nhãn hoặc biểu tượng, không dùng màu làm tín hiệu duy nhất.

## Typography và khoảng cách

- Tiêu đề dùng serif có hỗ trợ tiếng Việt. Có thể đánh giá Be Vietnam Pro Serif hoặc Noto Serif, sau đó chọn font đã được xác nhận trong repo và môi trường triển khai.
- Nội dung, nhãn, bảng và điều khiển dùng sans-serif như Inter hoặc Be Vietnam Pro.
- Mã nhân viên, ID sự kiện và timestamp có thể dùng monospace khi cần canh cột.
- Dùng thang chữ phân cấp cho tiêu đề trang, tiêu đề vùng, nội dung, nhãn và chú thích. Chữ số KPI dùng tabular figures.
- Giảm 50% spacing/padding chung so với chuẩn vừa ghi: dùng thang bội số 2 px, khoảng cách thường 4–6 px, padding card/panel 6–8 px, gutter desktop 8–12 px và padding dọc hàng bảng/list 4–5 px.
- Giảm cỡ chữ tiêu đề, nhãn và thành phần đang quá lớn khoảng 3–6 px so với mockup cũ; nội dung chính khoảng 14 px trở lên, chữ phụ tối thiểu 12 px.
- Button/input cao khoảng 36–40 px và topbar khoảng 48–52 px trên desktop. Trên thiết bị cảm ứng, giữ vùng đích chạm tối thiểu 44 px hoặc khoảng cách chạm tương đương.
- Không giảm cỡ chữ, chiều cao control/topbar hoặc vùng đích chạm theo tỷ lệ 50%; giữ mức giảm chữ 3–6 px đã chọn và ngưỡng đọc/thao tác đã nêu.
- Bo góc vừa, tham chiếu 8 px cho control và 12 px cho panel. Giữ bóng nhẹ, tránh hiệu ứng nặng trên bảng.

## Mẫu bố cục trang quản trị

1. **Sidebar:** logo Smart Office, các mục điều hướng theo vai trò, trạng thái mục đang chọn bằng nền xanh/navy sáng hơn và nhãn chữ khi mở. Khi thu gọn, chỉ hiển thị icon kèm tooltip/tên truy cập. Dùng icon SVG từ một thư viện duy nhất.
2. **Topbar:** tình trạng Backend/AI, thời gian cập nhật, tài khoản và thao tác toàn cục trong chiều cao gọn khoảng 48–52 px. Trạng thái phải có chữ kèm dấu hiệu màu.
3. **Tiêu đề trang:** nhãn ngữ cảnh nhỏ, heading serif, mô tả ngắn và tối đa một hành động chính.
4. **Nội dung:** KPI, biểu đồ hoặc bảng theo thứ tự ưu tiên tác vụ. Dùng card surface trắng, viền mảnh và bóng thấp.
5. **Phản hồi:** loading, error, empty, success, stale/offline hiển thị gần nội dung liên quan.

## Lựa chọn mẫu cho Hạng mục 1

Các mục dưới đây ghi lại phương án hiện tại của người khởi tạo. Phương án thay thế để đổi sau được lưu trong `docs/TEMPLATE_DOI_CHIEU_LUA_CHON_UI.md`.

| Khu vực | Phương án mẫu |
|---|---|
| Trang đăng nhập | Ảnh văn phòng phủ navy ở panel nhận diện; các nút demo xếp theo một hàng |
| Sidebar | Thu gọn/mở rộng được; khi thu gọn chỉ có icon, khi mở có nhãn; lọc theo vai trò, mục đang chọn có nền nhấn |
| Topbar | Cao khoảng 48–52 px; hai pill có chữ và chấm màu cho Backend/AI; giữ đồng hồ hệ thống |
| Chuông thông báo | Ưu tiên cảnh báo nghiệp vụ, có mức độ và ngữ cảnh xử lý |
| Danh sách tài khoản | Tìm kiếm chính, bộ lọc vai trò/phòng ban là thao tác phụ |
| Modal tạo tài khoản | Form một cột; trường phòng ban phụ thuộc vai trò đã chọn |

## Mẫu thành phần

### KPI

- Có nhãn, giá trị, đơn vị hoặc kỳ dữ liệu, chú thích ngắn và thời điểm cập nhật khi dữ liệu live.
- Số liệu dùng cỡ chữ nổi bật, tabular figures. Icon có thể đặt trong ô nền xanh nhạt.
- Trạng thái chỉ dùng màu theo ý nghĩa nghiệp vụ đã quy định.

### Bảng và biểu đồ

- Bảng dùng header rõ, định dạng số/ngày thống nhất và empty/error state riêng.
- Biểu đồ cột/chồng dùng màu trạng thái cố định, legend có nhãn và có cách xem giá trị cụ thể.
- Trên màn hẹp, bảng cuộn có chủ đích hoặc chuyển sang danh sách; không làm cuộn ngang toàn trang.

### Điều khiển và trạng thái

- Button chính nền xanh dương; button phụ nền bề mặt trắng và viền trung tính. Control cao khoảng 36–40 px trên desktop; vùng chạm vẫn đạt tối thiểu 44 px trên thiết bị cảm ứng.
- Focus ring rõ; thao tác đang gửi có trạng thái loading và chống gửi lặp.
- Form có nhãn nhìn thấy được, lỗi dưới trường tương ứng và thông báo thành công sau khi hoàn tất.
- Chuyển động tập trung vào hover/focus, mở dialog và phản hồi trạng thái; không nhấp nháy liên tục.

## Responsive và accessibility

- Desktop ưu tiên sidebar mở và lưới nhiều cột; có thể thu gọn sidebar thành icon-only. Tablet có thể thu gọn sidebar. Điện thoại chuyển menu sang drawer và KPI thành hai cột hoặc một cột tùy chiều rộng.
- Cỡ chữ, điều khiển và khoảng cách phải giữ khả năng đọc/chạm ở màn hẹp.
- Đạt tương phản WCAG AA cho chữ; giữ focus bàn phím, tên truy cập cho icon button và phương án đọc biểu đồ không phụ thuộc màu.
- Hỗ trợ zoom, thao tác bàn phím và `prefers-reduced-motion`.

## Mẫu minh họa

Mẫu dashboard minh họa theo lựa chọn hiện tại được trình bày riêng trong cuộc hội thoại. Số liệu trên mockup là giả lập, chỉ nhằm thể hiện bố cục, màu sắc, typography, surface và trạng thái điều hướng.

## Checklist áp dụng cho từng trang

- [ ] Dùng tông navy/xanh dương với nền sáng theo template.
- [ ] Heading dùng serif và nội dung dùng sans-serif đã chốt.
- [ ] Giảm 50% spacing/padding chung: khoảng cách 4–6 px, padding panel 6–8 px, gutter desktop 8–12 px, padding dọc bảng/list 4–5 px; giữ mức giảm chữ 3–6 px và vùng đích chạm tối thiểu.
- [ ] Dùng bo vừa và phân lớp nhẹ, tránh bóng/blur nặng.
- [ ] Dùng cùng bộ icon; mục điều hướng hiện tại có nền nhấn; sidebar mở có nhãn, thu gọn chỉ có icon kèm tooltip/tên truy cập.
- [ ] Chuyển động tinh tế, tôn trọng reduced motion.
- [ ] Giữ nguyên bảng màu trạng thái nghiệp vụ và bổ sung nhãn chữ.
- [ ] Có loading, error, empty, success và stale/offline khi phù hợp.
- [ ] Rà soát responsive, tương phản, keyboard focus và tên truy cập.
