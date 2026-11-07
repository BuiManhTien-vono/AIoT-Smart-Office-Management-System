# Bảng lựa chọn UI/UX — Smart Office AIoT

> Mục đích: ghi lại lựa chọn đã chọn trong bảng tương tác, so sánh với hướng dẫn hiện hành và thống nhất áp dụng cho các module frontend.
>
> Trạng thái: phương án của người khởi tạo đã được ghi nhận làm mẫu minh họa. Đây chưa phải quyết định đồng thuận của toàn nhóm. Các giá trị trong cột “Quy định hiện tại” được tổng hợp từ `docs/UI_DESIGN_SYSTEM.md`.

## Thông tin thống nhất

| Trường | Giá trị |
|---|---|
| Người đề xuất lựa chọn | Người khởi tạo tài liệu |
| Thành viên tham gia rà soát | `[Điền tên các thành viên]` |
| Ngày rà soát | `[YYYY-MM-DD]` |
| Phiên bản hướng dẫn được đối chiếu | `docs/UI_DESIGN_SYSTEM.md` — `[Phiên bản/ngày]` |
| Trạng thái thống nhất | `Chờ thành viên rà soát` |

## Lựa chọn giao diện và đối chiếu tài liệu

| Nhóm lựa chọn | Phương án đã chọn | Quy định hiện tại trong UI_DESIGN_SYSTEM.md | Mức độ khớp | Quyết định cần ghi nhận |
|---|---|---|---|---|
| Tông màu thương hiệu và nền | 🟦 **ĐÃ CHỌN — Navy + xanh dương, nền sáng** | Nền sáng cho quản trị, nhân sự, chấm công và báo cáo; bề mặt tối riêng cho SOC, camera và giám sát trực tiếp. Màu hành động chính xanh dương. | Khớp về hướng; mã navy và token chính xác cần được nhóm chốt | Giữ nền lai; đề xuất navy cho điều hướng, xanh dương cho hành động |
| Typography | 🟦 **ĐÃ CHỌN — Serif cho tiêu đề + sans cho nội dung** | Hướng dẫn hiện tại đề xuất sans-serif hỗ trợ tiếng Việt như Inter hoặc Be Vietnam Pro; monospace giới hạn cho ID/timestamp. | Một phần; serif cho heading là điểm mới | Chọn serif hỗ trợ tiếng Việt cho tiêu đề, giữ sans cho nội dung và monospace cho mã/giờ |
| Mật độ và khoảng cách | 🟦 **ĐÃ CHỌN — Gọn, giảm 50% spacing/padding** | Dùng thang bội số 2 px; khoảng cách 4–6 px; padding panel 6–8 px; gutter desktop 8–12 px; padding dọc bảng/list 4–5 px. Cỡ chữ giữ mức giảm 3–6 px đã chọn (không giảm 50%); chiều cao control/topbar và vùng chạm giữ chuẩn dễ dùng. | Cập nhật theo yêu cầu giảm một nửa spacing/padding | Tăng vùng dữ liệu hữu ích; giữ khả năng đọc và thao tác |
| Hình khối component | 🟦 **ĐÃ CHỌN — Bo vừa** | Bo góc nhất quán khoảng 8–12 px, đổ bóng nhẹ. | Khớp | Dùng cùng thang bo cho control, card và dialog |
| Cách xử lý bề mặt | 🟦 **ĐÃ CHỌN — Phân lớp nhẹ** | Nền sáng/tối theo ngữ cảnh; tránh glass/blur phía sau bảng hoặc đoạn chữ dài. | Khớp | Dùng viền và bóng nhẹ để tách bề mặt, không dùng blur trên nội dung dữ liệu |
| Ngôn ngữ icon | 🟦 **ĐÃ CHỌN — Active có nền** | Chọn một bộ SVG nhất quán, tài liệu gợi ý Phosphor hoặc Lucide; không dùng emoji làm icon hệ thống. | Một phần; quy tắc active chưa được nêu | Chốt một bộ icon; mục menu đang chọn có nền xanh, giữ nhãn rõ ràng |
| Mức chuyển động | 🟦 **ĐÃ CHỌN — Tinh tế** | Chuyển động có mục đích, không khóa thao tác, không nhấp nháy; hỗ trợ `prefers-reduced-motion`. | Khớp về nguyên tắc; thời lượng/easing chưa chốt | Chỉ dùng chuyển động ngắn cho phản hồi và đổi trạng thái |
| Breakpoint và hành vi responsive | 🟦 **Chốt breakpoint sau khi kiểm tra các trang** | Tài liệu hiện định hướng desktop từ 1280 px, tablet 768–1279 px, điện thoại từ 375 px. | Khớp có điều kiện; sẽ xác nhận sau khi thử layout thực tế | Giữ các mốc hiện tại / Bảng cuộn trong khung / Chuyển bảng thành thẻ trên mobile |
| Dark mode | 🟦 **Giữ mô hình lai theo UI_DESIGN_SYSTEM.md** | Nền sáng cho nghiệp vụ quản trị; nền tối riêng cho SOC/camera/giám sát. | Khớp | Chỉ SOC/camera / Theme chuyển sáng-tối toàn hệ thống |

## Hạng mục 1 — lựa chọn theo trang

Các phương án đã chọn được đánh dấu 🟦. Danh sách phương án còn lại được giữ ngay cùng dòng để tiện rà lại hoặc đổi lựa chọn. Đây là lựa chọn của người khởi tạo, chưa đại diện cho đồng thuận toàn nhóm.

| Khu vực | Quyết định giao diện | Lựa chọn hiện tại | Các phương án có thể đổi sang |
|---|---|---|---|
| Đăng nhập | Panel nhận diện thương hiệu | 🟦 **Ảnh văn phòng phủ navy** | Navy + xanh dương dạng gradient / Panel sáng editorial |
| Đăng nhập | Cách trình bày 4 tài khoản demo | 🟦 **Nút chọn vai trò theo hàng** | Bốn thẻ 2 × 2 / Danh sách nút dọc |
| Khung ứng dụng | Kiểu sidebar | 🟦 **Sidebar thu gọn được; thu gọn chỉ hiển thị icon, mở rộng hiển thị nhãn** | Sidebar rộng luôn mở / Menu nhóm theo nghiệp vụ |
| Khung ứng dụng | Trạng thái Backend/AI và đồng hồ | 🟦 **Hai pill có chữ và chấm màu** | Trạng thái chữ gọn / Trạng thái tổng hợp, mở để xem dịch vụ |
| Khung ứng dụng | Nội dung chuông thông báo | 🟦 **Cảnh báo nghiệp vụ ưu tiên** | Chỉ tình trạng kết nối dịch vụ / Feed hợp nhất dịch vụ và cảnh báo |
| Tài khoản | Bố cục bộ lọc và danh sách | 🟦 **Tìm kiếm chính, bộ lọc phụ** | Bộ lọc trên một hàng / Bảng rộng có toolbar cố định |
| Tài khoản | Bố cục modal tạo mới | 🟦 **Form một cột, trường phòng ban theo vai trò** | Form một cột cơ bản / Thông tin cá nhân và quyền theo hai nhóm |

## Hạng mục 2 — lựa chọn theo trang

Các phương án bạn chọn được đánh dấu 🟦. Danh sách phương án còn lại được giữ ngay cùng dòng để tiện rà lại hoặc đổi lựa chọn. Đây là lựa chọn của người khởi tạo, chưa đại diện cho đồng thuận toàn nhóm.

| Khu vực | Quyết định giao diện | Lựa chọn hiện tại | Các phương án có thể chọn |
|---|---|---|---|
| Dashboard | Bố cục 4 KPI | 🟦 **Lưới 2 × 2** | Bốn thẻ một hàng / Dải KPI gọn |
| Dashboard | Mức thông tin trong KPI | 🟦 **Giá trị và xu hướng nhỏ** *(chỉ hiển thị khi API có dữ liệu so sánh)* | Giá trị + mô tả / Giá trị + icon + nhãn trạng thái |
| Dashboard | Độ mới dữ liệu và làm mới | 🟦 **Timestamp và chọn chu kỳ cập nhật** | Timestamp rõ + nút làm mới / Badge cập nhật + timestamp |
| Báo cáo tháng | Nhãn và đọc số liệu biểu đồ cột chồng | 🟦 **Legend và bảng giá trị** | Legend + tooltip / Nhãn trực tiếp trong cột |
| Báo cáo tháng | Bố cục biểu đồ và bảng | 🟦 **Biểu đồ và bảng cạnh nhau** | Biểu đồ trên, bảng dưới / Bảng trước, biểu đồ sau |
| Báo cáo tháng | Vị trí bộ lọc kỳ/phòng ban | 🟦 **Toolbar riêng trên nội dung** | Cùng hàng tiêu đề / Panel lọc luôn hiển thị |
| Xuất CSV | Cách trình bày thao tác xuất | 🟦 **Menu xuất kèm tóm tắt phạm vi** | Nút tải trực tiếp / Nút kèm kỳ đang xuất |

## Quy ước đã cố định trong tài liệu phân công

Các lựa chọn bên dưới phải được giữ nguyên khi hoàn thiện hệ thống, trừ khi nhóm cập nhật chính thức tài liệu phân công:

| Ý nghĩa | Mã màu | Trạng thái/nhãn đi kèm |
|---|---|---|
| Có mặt, đúng giờ, an toàn | `#10B981` | `PRESENT`, `ON_TIME`, `LEVEL_1_OT` |
| Tạm vắng, đi muộn, cảnh báo nhẹ | `#F59E0B` | `TEMP_AWAY`, `LATE`, `LEVEL_2_UNAUTH` |
| Vắng quá hạn, vắng không phép, đột nhập khẩn cấp | `#EF4444` | `PROLONGED_AWAY`, `ABSENT`, `LEVEL_3_BREACH` |
| Giả mạo sinh trắc, ngồi sai bàn, về sớm | `#8B5CF6` | `SPOOFING_ATTEMPT`, `WRONG_SEAT`, `EARLY_LEAVE` |
| Bàn trống, nghỉ trưa | `#64748B` | `EMPTY`, `LUNCH_MUTE` |

Không dùng màu làm tín hiệu duy nhất. Trạng thái cần có nhãn chữ hoặc biểu tượng phù hợp; cặp màu chữ/nền phải đạt mục tiêu tương phản trong tài liệu thiết kế.

## Các quyết định bổ sung cần thống nhất

| Chủ đề | Lựa chọn hiện tại | Các phương án khác để đổi | Người xác nhận | Ghi chú |
|---|---|---|---|---|
| Font chính và font dự phòng | 🟦 **Chốt sau khi kiểm tra font trong repo** | Noto Serif + Inter / Be Vietnam Pro pair | Người rà soát | Chọn cặp hỗ trợ tiếng Việt và ghi font dự phòng sau khi kiểm tra. |
| Token CSS và nơi khai báo | 🟦 **Navy `#122844` + xanh `#2563EB`** | Navy `#10243E` + xanh / Giữ xanh, chốt navy sau | Người rà soát | Xác nhận token với nhóm và đặt trong stylesheet chung. |
| Bộ icon | 🟦 **Phosphor** | Lucide / Bộ icon hiện có trong repo | Người rà soát | Dùng SVG nhất quán; active menu có nền; không dùng emoji. |
| Timing chuyển động | 🟦 **200 ms, ease-in-out** | 150 ms ease-out / Chỉ focus và press | Người rà soát | Giữ mức tinh tế, tôn trọng `prefers-reduced-motion`. |
| Hành vi nút demo | 🟦 **Đăng nhập demo trực tiếp trong môi trường phát triển** | Điền username, nhập mật khẩu / Điền credentials demo đã cấu hình | Người rà soát | Chỉ bật cho tài khoản demo ở dev; không hiển thị trong production. |
| Health check | 🟦 **Chỉ kiểm tra khi tải trang và khi người dùng làm mới** | 30 giây, stale sau 90 giây / 60 giây, stale sau 3 phút | Người rà soát | Thể hiện rõ trạng thái và thời điểm kiểm tra gần nhất. |
| Badge thông báo | 🟦 **Đếm chưa đọc, sắp theo mức độ rồi thời gian** | Đếm cảnh báo đang mở / Badge tổng hợp, nhóm theo loại | Người rà soát | Ưu tiên cảnh báo nghiệp vụ đã chọn cho chuông. |
| Xu hướng KPI | 🟦 **Ẩn xu hướng nếu thiếu dữ liệu lịch sử** | So với hôm qua, chênh lệch số / Sparkline 7 ngày | Người rà soát | Chỉ hiện trend khi API có dữ liệu so sánh đáng tin cậy. |
| Công thức biểu đồ cột chồng | 🟦 **Chốt theo contract API và mô tả công thức** | 100% mỗi phòng ban / Số lượt tuyệt đối | Người rà soát | Xác định mẫu số và cách làm tròn trước khi thể hiện tỷ lệ. |
| Menu xuất CSV | 🟦 **Tải trực tiếp, báo thành công hoặc lỗi** | CSV kèm kỳ/phòng ban / CSV và xem trước số dòng nếu API hỗ trợ | Người rà soát | Giữ CSV UTF‑8 BOM; thông báo gần thao tác xuất. |
| Trạng thái component | 🟦 **Chọn theo thời gian tải và mức độ quan trọng** | Skeleton/inline/empty có hành động / Spinner/panel state | Người rà soát | Dùng nhất quán theo thời gian tải và mức độ quan trọng. |
| Quy tắc bảng hẹp | 🟦 **Chốt breakpoint sau khi kiểm tra các trang** | Giữ mốc hiện tại, cuộn trong khung / Chuyển bảng thành thẻ | Người rà soát | Cân nhắc theo mật độ cột và loại trang. |

## Kết luận rà soát

- **Phương án được chọn:** Navy + xanh dương, nền sáng; serif tiêu đề + sans nội dung; bố cục gọn với spacing/padding giảm 50% (khoảng cách 4–6 px, padding panel 6–8 px, gutter 8–12 px); cỡ chữ lớn giảm 3–6 px nhưng không giảm theo tỷ lệ 50%, chiều cao control/topbar và vùng chạm vẫn theo chuẩn dễ dùng; bo vừa; phân lớp nhẹ; icon active có nền; chuyển động tinh tế. Hạng mục 1 dùng ảnh văn phòng phủ navy, nút demo theo hàng, sidebar thu gọn chỉ còn icon và mở rộng có nhãn, hai pill trạng thái dịch vụ, chuông ưu tiên cảnh báo nghiệp vụ, tìm kiếm chính với bộ lọc phụ và form tạo tài khoản một cột có trường phòng ban theo vai trò. Hạng mục 2 dùng KPI lưới 2 × 2 có xu hướng khi có lịch sử, timestamp kèm chu kỳ, biểu đồ cột chồng kèm bảng giá trị, bố cục cạnh nhau, toolbar lọc riêng và menu xuất có tóm tắt phạm vi. Các điểm bổ sung dùng Phosphor, timing 200 ms ease-in-out, demo login trực tiếp chỉ trong dev, health check theo yêu cầu, badge đếm chưa đọc, dark mode lai.
- **Điểm khác với UI_DESIGN_SYSTEM.md:** Serif cho heading, active nền cho mục menu, ảnh nhận diện đăng nhập, kiểu nội dung chuông và chi tiết trình bày tài khoản cần bổ sung/đối chiếu sau khi nhóm rà soát.
- **Nội dung cần cập nhật vào UI_DESIGN_SYSTEM.md:** Chỉ cập nhật sau khi nhóm thống nhất, gồm cặp font serif/sans cụ thể, trạng thái active của menu, nội dung thông báo và quy tắc bố cục cho đăng nhập/tài khoản.
- **Ngoại lệ theo module (nếu có):** `[Ghi phạm vi, lý do và người phê duyệt]`
- **Ngày áp dụng:** `[YYYY-MM-DD]`

## Danh sách lựa chọn chung — để rà lại hoặc đổi phương án

Lựa chọn hiện tại được đánh dấu 🟦. Khi đổi, chuyển dấu đánh dấu sang phương án mới và cập nhật ngày/người xác nhận ở phần đầu tài liệu.

| Tiêu chí | Lựa chọn hiện tại | Các phương án khác |
|---|---|---|
| Tông màu thương hiệu và nền | 🟦 **Navy + xanh dương, nền sáng** | Teal + xanh biển, nền sáng / Navy tối |
| Typography | 🟦 **Serif cho tiêu đề + sans cho nội dung** | Sans trung tính / Sans hình học hiện đại |
| Mật độ và khoảng cách | 🟦 **Gọn, khoảng cách rút ngắn** | Cân bằng / Thoáng |
| Hình khối component | 🟦 **Bo vừa** | Bo gọn / Bo mềm lớn |
| Cách xử lý bề mặt | 🟦 **Phân lớp nhẹ** | Phẳng, viền mảnh / Glassmorphism có kiểm soát |
| Ngôn ngữ icon | 🟦 **Active có nền** | Nét mảnh đồng bộ / Nét vừa tương phản cao |
| Mức chuyển động | 🟦 **Tinh tế** | Tối thiểu / Chuyển cảnh rõ |
| Breakpoint và hành vi responsive | **Chưa chọn** | Theo breakpoint hướng dẫn hiện tại / Đề xuất breakpoint khác: `[ghi]` |
| Dark mode | **Chưa chọn riêng** | Chỉ SOC/camera / Toàn hệ thống / Không bổ sung ngoài giao diện tối SOC |

## Ý kiến của thành viên khác

### Ghi nhận triển khai hạng mục 1 và 2 — 07/11/2026

Áp dụng template theo yêu cầu triển khai hai hạng mục. Các giá trị chi tiết dưới đây do người triển khai chọn để giao diện hoạt động được, có thể điều chỉnh trong vòng rà soát của nhóm.

- Noto Serif cho tiêu đề, Inter cho nội dung, có font hệ thống dự phòng hỗ trợ tiếng Việt. Phosphor là bộ icon dùng chung.
- Dashboard mặc định cập nhật mỗi 60 giây. Các lựa chọn gồm thủ công, 30 giây, 60 giây và 5 phút. Health check giữ cách kiểm tra khi tải trang và khi bấm làm mới.
- Nhãn dữ liệu cũ áp dụng khi bản ghi nguồn mới nhất vượt 5 phút. Timestamp lấy dữ liệu được hiển thị riêng với timestamp nguồn.
- Desktop giữ KPI 2 × 2; dưới 420px chuyển một cột. Biểu đồ và bảng xếp cạnh nhau khi đủ rộng, xếp dọc dưới 1200px. Sidebar chuyển drawer dưới 1024px; các bảng có vùng cuộn riêng.
- Chuông có trạng thái rỗng minh bạch vì API chưa cung cấp feed cảnh báo và hành động đánh dấu đã đọc. Chưa triển khai sắp xếp cảnh báo hoặc đánh dấu đã đọc với dữ liệu thực.
- Mã vai trò Trưởng phòng dùng `DEPT_LEAD` theo API, dù nút demo trong bảng phân công ghi `MANAGER`.
- Kiểm tra trực quan trên trình duyệt còn chờ xác nhận. Công cụ điều khiển Chrome đã dừng do không xác định chắc chắn URL của cửa sổ.

Mỗi thành viên có thể ghi phương án muốn đổi, lý do và phạm vi tác động. Không ghi đè lựa chọn của người khởi tạo cho tới khi nhóm thống nhất.

| Thành viên | Tiêu chí muốn đổi | Phương án đề xuất | Lý do và điểm đánh đổi | Kết quả thống nhất |
|---|---|---|---|---|
| `[Tên]` | `[Tiêu chí]` | `[Phương án]` | `[Ghi ngắn gọn]` | `Chờ thảo luận / Chấp nhận / Không đổi` |

## Checklist rà soát của thành viên

- [ ] Đã xem các phương án và minh họa trong bảng lựa chọn.
- [ ] Đã ghi phương án đã chọn cho từng nhóm, không để trống mục bắt buộc.
- [ ] Đã so sánh từng phương án với `docs/UI_DESIGN_SYSTEM.md`.
- [ ] Đã thống nhất cách xử lý mọi điểm mâu thuẫn hoặc ngoại lệ.
- [ ] Đã kiểm tra màu trạng thái, tương phản, bàn phím và responsive.
- [ ] Đã cập nhật hướng dẫn thiết kế làm nguồn chuẩn trước khi mỗi module áp dụng riêng.
