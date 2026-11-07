# Smart Office AIoT · Frontend

Giao diện React + TypeScript cho hạng mục 1 và 2 trong bảng phân công. Có đăng nhập, menu theo quyền, quản lý tài khoản, dashboard ngày, báo cáo tháng và xuất CSV cho Excel.

## Phạm vi mã frontend

| Nhóm | Thành phần trong bản triển khai |
|---|---|
| Hạng mục 1 | Đăng nhập, khung ứng dụng, phân quyền route/menu, trạng thái dịch vụ, quản lý tài khoản |
| Hạng mục 2 | Dashboard KPI, biểu đồ chuyên cần, báo cáo tháng, bộ lọc và xuất CSV |
| Hỗ trợ toàn hệ thống | Token UI, icon, responsive, xử lý phiên, API client, tải dữ liệu, cấu hình môi trường và tài liệu |

Phạm vi frontend hiện tại chỉ gồm các nhóm trên. Các hạng mục 3–8 trong bảng phân công là phần nghiệp vụ ngoài bản triển khai này, gồm hồ sơ nhân viên/sinh trắc học, camera/vùng ảo, seat map/SignalR, cảnh báo và nhật ký hiện diện, quản lý ca/nghỉ phép, tăng ca và xử lý sự cố an ninh.

`GET /api/v1/biometrics/departments` chỉ cung cấp danh mục cho bộ lọc tài khoản/báo cáo và gán phòng ban khi tạo tài khoản. Đây là dữ liệu hỗ trợ hạng mục 1–2. Các KPI hiện diện/an ninh lấy từ API Reporting theo yêu cầu hạng mục 2.

## Chạy trên máy phát triển

Từ thư mục gốc dự án, khởi động backend với dữ liệu trong bộ nhớ.

```powershell
$env:Database__UseInMemory = 'true'
dotnet run --project backend/src/Host/SmartOffice.WebApi/SmartOffice.WebApi.csproj --urls http://localhost:5155
```

Dữ liệu ở chế độ này mất khi backend khởi động lại. Nếu sử dụng PostgreSQL, bỏ biến `Database__UseInMemory` và cấu hình database đã khởi tạo schema.

Trong PowerShell thứ hai, mở frontend.

```powershell
cd frontend
Copy-Item .env.example .env.local
npm install
npm run dev
```

Giữ cấu hình `.env.local` sẵn có nếu đã thiết lập trước đó. Mở `http://localhost:5173`. `VITE_BACKEND_API_URL` nhận origin backend hoặc URL kết thúc bằng `/api/v1`. `VITE_AI_SERVICE_URL` nhận origin AI, mặc định `http://localhost:8000`.

## Đăng nhập và quyền

Backend seed tài khoản `admin_smartoffice`, mật khẩu `Admin@123`, khi database chưa có tài khoản. Có thể dùng trang Tài khoản để tạo người vận hành khác.

| Vai trò API | Màn hình |
|---|---|
| `ADMIN` | Tổng quan, Báo cáo tháng, Tài khoản |
| `HR` | Tổng quan, Báo cáo tháng |
| `DEPT_LEAD` | Tổng quan và báo cáo phòng ban được gán |
| `SECURITY` | Chỉ số và bảng tổng hợp cảnh báo an ninh trên Tổng quan |

Trong bảng phân công, vai trò demo `MANAGER` được ánh xạ sang `DEPT_LEAD` theo API. Tài khoản Trưởng phòng phải có `departmentId`. Giao diện chặn trang khi thiếu phạm vi, lọc menu và route, giới hạn truy vấn/hiển thị báo cáo theo phòng ban, xử lý thời hạn phiên và phản hồi 401.

Backend hiện phát JWT nhưng chưa xác thực token và cưỡng chế phân quyền tại các controller Reporting. Các kiểm soát frontend cần đi cùng việc hoàn thiện xác thực/phân quyền phía máy chủ trước khi vận hành với dữ liệu thực.

## Tài khoản demo

Bốn nút chọn nhanh chỉ hiển thị trong chế độ phát triển. Các biến `VITE_DEMO_*_USERNAME` đặt tên tài khoản. Khi không cấu hình mật khẩu, nút chỉ điền tên và chuyển focus tới trường mật khẩu. Nếu có `VITE_DEMO_*_PASSWORD`, nút gọi đăng nhập API trực tiếp. Các tài khoản HR/Trưởng phòng/An ninh phải được tạo trước.

Mọi biến `VITE_` đều có thể được đọc từ frontend. Chỉ dùng mật khẩu của tài khoản demo cục bộ. Không đặt thông tin đăng nhập production vào các biến này. Production không có nút đăng nhập demo.

## Quy tắc dữ liệu và giao diện

- Token tập trung ở `src/index.css`. Sidebar navy, nền quản trị sáng, Noto Serif cho heading và Inter cho nội dung, có font hệ thống dự phòng. Biểu tượng Phosphor, trạng thái kèm nhãn.
- Các trang sau đăng nhập dùng ảnh văn phòng `src/assets/background.png`, bề mặt kính mờ với blur 18px, sidebar navy trong suốt và panel trắng bán trong suốt. Token được giới hạn trong `.workspace-shell`; trang login theo thiết kế riêng.
- Theo yêu cầu hiển thị mới nhất ngày 07/11/2026, container có padding 16px trên desktop, 14px trên điện thoại; gap giữa các vùng 12px, gutter desktop 20px, padding dọc ô bảng 8px. Chữ nội dung 14px, chữ phụ từ 12px.
- Dashboard bỏ greeting; ngày làm việc nằm bên phải tiêu đề và ngay trên nút Làm mới. Trên màn hình hẹp, nhóm ngày/nút có thể xếp xuống hàng.
- Control desktop cao 38px và topbar 50px. Sidebar mở rộng 228px, thu gọn 64px với icon, tooltip có thể mở bằng bàn phím và tên truy cập. Drawer màn hình hẹp luôn có nhãn. Trên thiết bị cảm ứng hoặc điện thoại, vùng tương tác đạt ít nhất 44px.
- KPI bố cục 2 × 2 trên màn hình đủ rộng, một cột trên điện thoại nhỏ. Đúng giờ bằng có mặt trừ đi muộn. Tổng nhân sự lấy từ các bản ghi tổng hợp ngày, nên chỉ bao phủ các phòng ban đã có bản ghi.
- Dashboard mặc định tải mỗi 60 giây, có lựa chọn thủ công/30 giây/60 giây/5 phút. Tạm bỏ qua chu kỳ khi tab bị ẩn. Hiển thị thời điểm lấy dữ liệu và thời điểm bản ghi nguồn mới nhất. Bản ghi nguồn cũ hơn 5 phút được gắn nhãn cần làm mới. Đây là ngưỡng giao diện, không phải cam kết độ trễ của backend.
- Thời gian dùng `Asia/Ho_Chi_Minh`. Đổi ngày theo giờ văn phòng sẽ tải dữ liệu của ngày mới.
- Health Backend và AI kiểm tra khi mở ứng dụng và khi bấm làm mới, có timeout và timestamp riêng. AI chưa chạy vẫn có thể sử dụng phần quản trị/báo cáo.
- API chưa có feed thông báo và hành động đánh dấu đã đọc. Chuông hiển thị trạng thái chưa kết nối nguồn cảnh báo và số chưa đọc bằng 0.
- Báo cáo tháng dùng tổng lượt đúng giờ + đi muộn + vắng mặt làm mẫu số. Tỷ lệ hiển thị một chữ số thập phân. Đây là lượt trong kỳ, không phải số nhân viên duy nhất.
- Biểu đồ, bảng và CSV dùng cùng kỳ/phòng ban. CSV lấy nội dung do backend xuất, thêm BOM khi cần và không thêm BOM trùng.
- Màn hình tách rõ đang tải, lỗi/thử lại, chưa có bản ghi, dữ liệu bằng 0 và dữ liệu cũ. Khi đổi bộ lọc hoặc phiên, phản hồi cũ bị hủy và không hiển thị dưới phạm vi mới.

## Kiểm tra

```powershell
npm run build
npm run lint
```

Chạy profile frontend của harness từ thư mục gốc để lưu kết quả lint/build trong `harness/runs`.

```powershell
.\scripts\harness.ps1 -Profile frontend
```

Tham chiếu thiết kế nằm trong `docs/UI_DESIGN_SYSTEM.md`, `docs/TEMPLATE_GIAO_DIEN_MAU.md` và `docs/CHECKLIST_HANG_MUC_1_2_FRONTEND.md` ở thư mục gốc.
