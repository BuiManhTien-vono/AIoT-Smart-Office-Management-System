# Thực hành 01 — lập baseline và tùy chỉnh một kiểm tra

Ngày: 07/11/2026, múi giờ làm việc Asia/Saigon. Báo cáo máy dùng UTC.

## Mục tiêu và tiêu chí

Tạo quy trình thực hành cho repository hiện tại; chạy kiểm tra sẵn có để biết điểm xuất phát. Không sửa tính năng ứng dụng hoặc thay đổi frontend đang làm của chủ dự án.

- Có hướng dẫn ngắn cho agent, bản đồ ngữ cảnh, template nhiệm vụ và tập kiểm tra có thể sửa.
- Mỗi phần có trạng thái cùng giới hạn bằng chứng.
- Phát hiện môi trường không phù hợp trước khi chạy AI.
- Thực hiện một tùy chỉnh dựa trên kết quả thực tế, giải thích lý do.

## Kết quả quan sát

| Kiểm tra | Kết quả | Giới hạn |
|---|---|---|
| Runtime | .NET SDK 10.0.102/10.0.403, Node 24.14.0 | Có runtime chưa đảm bảo mọi dependency hợp lệ |
| Frontend lint | PASS | Không kiểm tra luồng người dùng |
| Frontend TypeScript + Vite build | PASS | Chưa kiểm tra UI qua trình duyệt hay API thật |
| Backend build | PASS, 0 warning, 0 error với một MSBuild worker | Chưa khởi động WebAPI/DB |
| Backend tests | PASS, 7/7, 0 skipped khi testhost kết nối được | Dùng dữ liệu test/InMemory, chưa xác minh PostgreSQL/SignalR thật |
| AI profile | BLOCKED: Python mặc định 3.9.13 < mốc 3.12 | Chưa chạy test logic hay inference; chưa có `.venv` ở đường dẫn chuẩn đã kiểm tra |
| Script/config | Cú pháp PowerShell và JSON hợp lệ, report local được Git bỏ qua | Đã chạy trên PowerShell 7; chưa xác minh Windows PowerShell 5.1 |

Frontend được kiểm tra trên trạng thái làm việc có sẵn của người dùng. Kết quả không có nghĩa các thay đổi đó đã được review đầy đủ.

## Cách harness đã được cải tiến từ phản hồi

1. Lệnh build backend mặc định trả thất bại nhưng không có lỗi biên dịch. Chạy với `-m:1 /nodeReuse:false` đạt. Đưa tùy chọn này vào profile backend, không sửa code nghiệp vụ. Chưa kết luận nguyên nhân gốc của lần build mặc định.
2. VSTest không kết nối được testhost trong môi trường hạn chế truy cập tiến trình sau 90 giây. Chạy lại cùng bộ test với quyền truy cập local phù hợp đạt 7/7. Bổ sung nhận diện lỗi kết nối cụ thể này thành BLOCKED, không gán thành lỗi test nghiệp vụ.
3. Lệnh mở Windows PowerShell 5.1 bị chặn bởi AuthorizationManager trong môi trường này. Chạy script trực tiếp bằng PowerShell 7 hiện có hoạt động. Hướng dẫn dùng lời gọi trực tiếp và ghi rõ môi trường đã xác minh.
4. Profile AI chỉ chọn test logic, giữ nguyên mốc Python thay vì hạ điều kiện để cho kiểm tra qua. Bạn có thể cung cấp interpreter 3.12 của môi trường đã chuẩn bị bằng `-PythonExecutable`.

Đây là vòng phản hồi của harness: **chạy → quan sát → phân loại → sửa công cụ/quy tắc đúng chỗ → xác minh lại**.

## Phần bạn có thể cùng làm tiếp

Chọn một nhiệm vụ nhỏ rồi điền năm dòng ở phần “Bạn điền” trong `TASK_TEMPLATE.md`. Gợi ý ưu tiên: một ca payload occupancy Python → .NET bằng dữ liệu giả; bạn chọn ví dụ đúng/sai, agent đối chiếu hai phía và bổ sung kiểm tra cho hành vi đã thống nhất. Lựa chọn khác là trạng thái loading/error của một trang frontend đang làm.

Chưa triển khai tự động CI, test contract liên dịch vụ, kiểm thử trình duyệt, benchmark mô hình hay triển khai máy chủ trong bài này. Những việc đó nằm trong lộ trình tăng dần ở `README.md`.
