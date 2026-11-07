# Harness engineering cho Smart Office — bản 0.1

Mục tiêu: giúp bạn và agent hoàn thành nhiệm vụ có tiêu chí rõ, đúng ngữ cảnh và có bằng chứng kiểm tra. Bạn quyết định hành vi sản phẩm; agent đề xuất, triển khai và chỉ ra điều chưa xác minh. Chế độ khởi đầu là **học và thực hành**, theo lựa chọn của bạn.

Ở đây, harness là môi trường và vòng phản hồi bao quanh công việc của agent: chỉ dẫn, tài liệu, công cụ kiểm tra và cách nghiệm thu. Bản này tận dụng Codex đang dùng, không cần thêm một ứng dụng agent hay API key.

## 1. Bắt đầu bằng bài thực hành nhỏ

Từ thư mục gốc repository, trong PowerShell:

```powershell
# Chỉ xem điều kiện môi trường, chưa chạy test hay khởi động dịch vụ.
.\scripts\harness.ps1 -Profile doctor

# Chỉ chạy kiểm tra frontend, sử dụng dependency đang có.
.\scripts\harness.ps1 -Profile frontend

# Build và chạy bộ test backend, không tự restore.
.\scripts\harness.ps1 -Profile backend

# Test logic AI, không chọn các test suy luận ONNX.
.\scripts\harness.ps1 -Profile ai

# Chỉ định interpreter của môi trường AI nếu đã có.
.\scripts\harness.ps1 -Profile ai -PythonExecutable .\ai_service\.venv\Scripts\python.exe
```

`all` chạy cả ba profile; chỉ dùng khi thay đổi ảnh hưởng cả ba. Script được kiểm tra trên PowerShell 7 ở Windows; với Linux/CI, dùng trực tiếp các lệnh trong `checks.json` và bỏ hậu tố `.cmd` của npm. Windows PowerShell 5.1 chưa được xác minh trong môi trường này.

Kết quả lưu tại `harness/runs/*.json`, được bỏ qua bởi Git. File chứa thời gian UTC, profile, mã băm cấu hình, trạng thái và đầu ra kiểm tra. Đây là log local; chỉ chia sẻ sau khi xem nội dung. Nếu script lỗi cấu hình trước khi chạy xong, sửa lỗi đó rồi chạy lại; có thể chưa có report cho lượt lỗi cấu hình.

| Trạng thái | Ý nghĩa | Việc tiếp theo |
|---|---|---|
| PASS | Kiểm tra đã chọn chạy thành công | Xem giới hạn của kiểm tra trước khi nghiệm thu |
| FAIL | Lệnh kiểm tra trả lỗi | Đọc lỗi, phân biệt lỗi sẵn có với lỗi do thay đổi |
| BLOCKED | Thiếu runtime hoặc dependency đã được kiểm tra trước | Chuẩn bị môi trường phù hợp rồi chạy lại |
| PARTIAL | Công cụ báo đã bỏ qua test | Ghi rõ phần thiếu, chưa kết luận đủ bằng chứng |

Exit code: `0` = các kiểm tra đã chọn đạt; `1` = có FAIL; `2` = có BLOCKED/PARTIAL mà không có FAIL. Script nhận diện báo cáo skip phổ biến của unittest và dotnet; người đọc vẫn phải kiểm tra tổng số test và lý do skip trong log. Các bài kiểm tra thủ công chưa chạy không tự xuất hiện trong report.

`doctor` kiểm tra phiên bản, sự có mặt của node_modules và restore assets backend; nó không xác minh đủ thư viện Python, tính mới của dependency hay chất lượng ứng dụng. Thiếu thư viện Python khi chạy profile AI được ghi FAIL kèm traceback, cần phân loại là vấn đề môi trường khi đọc kết quả.

Nếu VSTest báo không kết nối được với testhost, runner ghi BLOCKED. Lượt thực hành đầu gặp tình huống này trong môi trường hạn chế truy cập tiến trình; chạy lại bộ test với quyền truy cập local phù hợp đã đạt 7/7. Không tăng timeout hay sửa nghiệp vụ chỉ để che lỗi kết nối testhost. Runner không tự thay quyền truy cập.

## 2. Quy trình cho mỗi nhiệm vụ

| Bước | Bạn đóng góp | Agent thực hiện | Đầu ra |
|---|---|---|---|
| 1. Chốt bài toán | Mô tả điều muốn thấy, ví dụ đúng/sai | Biến yêu cầu thành tiêu chí quan sát được; nêu giả định | Task brief ngắn |
| 2. Chọn ngữ cảnh | Chỉ ra quyết định nghiệp vụ hoặc thiết kế đã thống nhất | Đọc file liên quan, xem Git và điều kiện chạy | Danh sách phạm vi và kiểm tra cần chạy |
| 3. Tạo bằng chứng ban đầu | Bổ sung tình huống thực tế nếu có | Với bug: tái hiện; với tính năng: xác định cách nghiệm thu | Ca lỗi hoặc checklist đầu vào/đầu ra |
| 4. Sửa theo lát cắt nhỏ | Có thể góp ý trong lúc agent làm | Sửa đủ luồng đã chọn, giữ nguyên phần ngoài phạm vi | Diff có thể review |
| 5. Kiểm tra và sửa lỗi | Đối chiếu trải nghiệm hoặc quy tắc nghiệp vụ | Chạy đúng profile và test đích; sửa lỗi do thay đổi rồi kiểm tra lại | Log và bằng chứng hành vi |
| 6. Nghiệm thu | Chọn khi có đánh đổi sản phẩm; xem kết quả | Báo thay đổi, kiểm tra, giới hạn, phần còn lại | Kết quả có thể đánh giá độc lập |
| 7. Cải tiến harness | Nêu chỗ agent hiểu sai hoặc phải nhắc nhiều | Đề xuất một chỉnh sửa nhỏ vào tài liệu/test/quy tắc phù hợp | Giảm lỗi lặp lại ở nhiệm vụ sau |

Task ngắn có thể ghi brief trong chat. Với thay đổi nhiều file, dùng [TASK_TEMPLATE.md](TASK_TEMPLATE.md). Không bắt buộc tạo hồ sơ cho sửa lỗi chính tả hoặc thao tác nhỏ.

Trong chế độ học, mỗi nhiệm vụ có ba điểm giải thích: **trước khi sửa** (vì sao chọn hướng này), **khi có bằng chứng mới** (nó làm thay đổi quyết định ra sao), **sau kiểm tra** (kiểm tra chứng minh được điều gì). Những điểm này không phải cổng yêu cầu bạn xác nhận liên tục.

## 3. Bản đồ ngữ cảnh theo dự án

Đây là bản đồ chỉ đường, không phải danh sách buộc đọc hết.

| Nhiệm vụ | Ngữ cảnh nên đọc | Bằng chứng ưu tiên |
|---|---|---|
| Yêu cầu/chấm công/an ninh | `PROJECT_REQUIREMENTS.md`, `docs/01_YEU_CAU_HE_THONG.md`, mã nghiệp vụ liên quan | Ví dụ biên của quy tắc; giờ UTC và giờ nghiệp vụ rõ ràng |
| Backend/module/schema | `backend/src/Modules/`, `backend/src/Shared/`, `docs/04_THIET_KE_CO_SO_DU_LIEU.md` | Test đích + profile backend có test cô lập module/schema |
| Giao diện | `docs/UI_DESIGN_SYSTEM.md`, trang/component đích, service frontend | Lint/build + kiểm tra UI: loading, empty, error, thành công, màn hình nhỏ |
| Payload Python → .NET | `ai_service/shared/backend_client.py`, DTO và controller module tương ứng | Payload mẫu dữ liệu giả, tên trường/kiểu/UTC và hành vi từ chối |
| Hiện diện chỗ ngồi | `ai_service/modules/occupancy/`, domain/service Occupancy backend | Test chống nhiễu, ngưỡng vắng mặt, tọa độ chuẩn hóa, mute giờ trưa |
| Nhận diện khuôn mặt | `ai_service/modules/face_recognition/`, module Biometrics/Attendance | Logic chất lượng/cosine tách khỏi test mô hình và đánh giá dữ liệu thật |
| Triển khai | `deploy/`, `.github/workflows/deploy.yml`, Dockerfile từng dịch vụ | Kiểm tra cấu hình và môi trường đích khi nhiệm vụ có triển khai |

Nếu yêu cầu và code khác nhau, ghi hai phía và tác động vào brief. Ví dụ đặc tả FR-OCC-01 mô tả điểm đáy bounding box người, trong khi pipeline hiện tại dùng tâm đầu RT-DETR; đây là quyết định cần đối chiếu, không nên âm thầm sửa tài liệu hoặc thuật toán cho khớp một phía.

## 4. Các lớp kiểm tra

**Lớp A — điều kiện chạy:** `doctor`, runtime và dependency. Mốc mặc định của harness: .NET SDK major 10, Python >=3.12 theo README AI, Node >=22.12 để thống nhất môi trường thực hành. Node 20.19 cũng nằm trong engines của Vite đang cài, nhưng chưa chọn làm chuẩn nhóm trong bản này. Có thể đổi mốc trong `checks.json`; thay đổi mốc cần phù hợp dependency thực tế.

**Lớp B — kiểm tra local theo phần sửa:**

- `frontend`: `npm run lint`, `npm run build`. Chưa có script test hành vi frontend trong package.json tại thời điểm khảo sát.
- `backend`: build solution với `--no-restore`, rồi test với `--no-build --no-restore`. Dùng một MSBuild worker (`-m:1`) và không tái sử dụng worker để chạy ổn định trong môi trường thực hành hiện tại. Bộ test hiện có dùng EF InMemory và chứa kiểm tra cô lập 5 module/schema; chúng không xác minh hành vi PostgreSQL thật.
- `ai`: chọn 10 test logic hiện có về hình học, FSM/payload, ring buffer, cosine, alignment và blur. Các module test vẫn import numpy/OpenCV/ONNX Runtime và thư viện liên quan, nên cần môi trường Python AI phù hợp; không chọn các phương thức inference hoặc khởi tạo pipeline nhận diện có thể nạp trọng số.

**Lớp C — tích hợp theo nhiệm vụ:** kiểm tra API thật, SignalR hoặc DB test cô lập nếu thay đổi ảnh hưởng các ranh giới đó. Ghi rõ máy chủ, dữ liệu giả và điều kiện chạy. Bản 0.1 chưa tự dựng các dịch vụ này.

**Lớp D — nghiệm thu sản phẩm:** thử luồng người dùng, quyền truy cập ở server, dữ liệu biên, camera/mô hình trên tập đánh giá phù hợp. Ảnh đen trong test ONNX chỉ là smoke test, không chứng minh độ chính xác, chống giả mạo hay tốc độ hệ thống.

Một thay đổi payload liên dịch vụ cần B + C phù hợp; thay đổi UI cần B + kiểm tra hành vi UI; chỉ sửa hướng dẫn cần xác minh lệnh/liên kết liên quan. Không chạy toàn bộ mọi lớp cho mọi nhiệm vụ.

Chuẩn bị dependency là bước riêng khi cần: `npm ci` trong frontend; `dotnet restore backend/SmartOffice.slnx` ở root; tạo môi trường Python 3.12 rồi cài `ai_service/requirements.txt`. Những bước này cần tải package; runner không thực hiện ngầm. Profile backend dừng các bước tiếp theo nếu build lỗi nhưng vẫn cho profile khác chạy khi dùng `all`.

## 5. Bạn có thể tùy chỉnh những gì?

| Điểm tùy chỉnh | Mặc định bản 0.1 | Nơi sửa |
|---|---|---|
| Cách giải thích | Học qua thực hành, ba điểm giải thích/nhiệm vụ | `AGENTS.md` và brief |
| Nhiệm vụ ưu tiên | Bài đầu: kiểm tra môi trường, lập baseline | Brief của bạn |
| Mốc môi trường và tập lệnh | Theo ba profile trong dự án | `harness/checks.json` |
| Tiêu chí đúng/sai | Ví dụ quan sát được và tình huống biên | Brief/test đích |
| Thiết kế giao diện | Theo tài liệu UI đang có | `docs/UI_DESIGN_SYSTEM.md` |
| Tự chủ của agent | Tự đọc/sửa/kiểm tra local theo nhiệm vụ; thao tác bên ngoài cần có trong phạm vi được giao | `AGENTS.md` |
| Mức kiểm tra trước nghiệm thu | Theo ranh giới bị thay đổi | Phần 4 và brief |

`checks.json` là cấu hình thực thi cho script, không chỉ là tài liệu. Có thể sửa mốc phiên bản, thêm/bớt bước của profile, thay đối số test. Tool được hỗ trợ là `npm`, `dotnet`, `python`; `cwd` phải nằm trong repository. Chỉ chạy cấu hình bạn đã review vì đối số có thể chọn lệnh mang tác dụng phụ. Quy tắc giao tiếp trong AGENTS.md là hướng dẫn cho agent, không phải cơ chế cưỡng chế quyền của hệ điều hành/Codex.

Một thay đổi mẫu để học cách customize: thêm một test logic mới vào `ai_service/tests`, chạy test đó riêng, sau đó thêm tên test vào danh sách `args` của profile AI và chạy lại profile. Nếu thay đổi suite, cập nhật mô tả số lượng/phạm vi kiểm tra ở hướng dẫn này.

## 6. Kế hoạch tăng dần

1. **Hiện tại:** bản đồ ngữ cảnh + quy trình + runner local + bài thực hành baseline. Chạy thử, ghi nơi thiếu bằng chứng.
2. **Sau khi chọn một luồng:** tạo fixture và test contract Python–.NET cho occupancy, hoặc test hành vi frontend tùy ưu tiên của bạn. Chốt một ví dụ đúng và một ví dụ lỗi trước.
3. **Khi kiểm tra local ổn định:** đưa các gate phù hợp vào CI hiện có; giữ job kiểm tra độc lập với hành động deploy. Workflow hiện có build/test backend và build frontend, chưa thấy lint frontend hay test AI. Chưa thay workflow trong bản này.
4. **Sau 3–5 nhiệm vụ:** cùng xem lỗi lặp lại, số lượt phải sửa sau review, thời gian có phản hồi đầu tiên và số kiểm tra BLOCKED/PARTIAL. Giữ quy tắc có ích, bỏ bước thừa. Chỉ thêm skill chuyên dụng khi một quy trình đã lặp lại đủ rõ.

## 7. Tài liệu tham khảo

- [OpenAI Docs: Iterating Development Workflows with Codex](https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex): AGENTS.md và các tài liệu quy trình nằm cùng code; cấu trúc ngoài AGENTS.md là quy ước có thể tùy chỉnh.
- [OpenAI Docs: Rethinking skills and prompts](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra): giữ chỉ dẫn gọn và đọc tài liệu theo ngữ cảnh công việc.

Các profile, mốc thực hành và cách nghiệm thu ở trên là thiết kế riêng cho repository này, không phải yêu cầu bắt buộc của OpenAI.
