# Smart Office: hướng dẫn làm việc với agent

- Trao đổi và giải thích quyết định bằng tiếng Việt. Chủ dự án muốn học qua thực hành: với việc có nhiều bước, nêu ngắn gọn mục đích, tiêu chí và bằng chứng trước khi triển khai; không yêu cầu xác nhận cho từng thao tác thông thường.
- Quy trình và nơi tùy chỉnh: `harness/README.md`. Chỉ đọc tài liệu liên quan đến nhiệm vụ; không nạp toàn bộ hồ sơ cho một sửa đổi nhỏ.
- Trước khi sửa, xem trạng thái Git. Giữ nguyên thay đổi có sẵn của người dùng, không hoàn tác hay sửa lan sang phần ngoài nhiệm vụ.
- Backend: .NET 10 Modular Monolith; 5 module Biometrics, Attendance, Occupancy, Security, Reporting có schema riêng. Dùng contract/event trong SharedKernel để trao đổi giữa module. Test kiến trúc ở `backend/tests/SmartOffice.UnitTests/ArchitectureIsolationTests.cs`.
- Frontend: React/TypeScript/Vite, oxlint. Với thay đổi giao diện, tham khảo `docs/UI_DESIGN_SYSTEM.md`; với tích hợp API, đối chiếu DTO/controller backend và `frontend/src/services/`. Build thành công chưa xác minh hành vi UI hoặc phân quyền phía server.
- AI: Python 3.12 theo tài liệu dự án. Phân biệt test logic với test ONNX/GPU. Không dùng kết quả test ảnh giả để kết luận độ chính xác hay FPS thực tế.
- Với thay đổi giao tiếp Python–.NET–React, đối chiếu payload/DTO và hành vi lỗi ở cả bên gửi lẫn bên nhận. Không tự quyết thay đổi ngưỡng nghiệp vụ khi tài liệu và code khác nhau; ghi rõ khác biệt để chủ dự án chọn.
- Chạy kiểm tra phù hợp phạm vi trong PowerShell: `.\scripts\harness.ps1 -Profile frontend` (hoặc `backend`, `ai`). `doctor` kiểm tra điều kiện môi trường. Các profile không tự cài dependency hay khởi động dịch vụ; xem điều kiện trong hướng dẫn.
- Báo rõ kiểm tra PASS, FAIL, BLOCKED hoặc PARTIAL; thiếu môi trường hay test bị bỏ qua không được diễn đạt thành đã xác minh. Với bug, ưu tiên ca tái hiện có ý nghĩa trước khi sửa; không thêm test chỉ lặp lại cách triển khai.
- Chỉ chạy camera, gửi Telegram, ghi R2, thao tác DB thật, commit/push hoặc triển khai khi nhiệm vụ đã cho phép những hành động đó. Kiểm tra local dùng dữ liệu giả được thực hiện trong phạm vi nhiệm vụ.
- Kết thúc bằng kết quả, bằng chứng và giới hạn còn lại. Chỉ bổ sung quy tắc harness khi có lỗi hoặc nhu cầu lặp lại; tránh tích lũy chỉ dẫn không còn hữu ích.
