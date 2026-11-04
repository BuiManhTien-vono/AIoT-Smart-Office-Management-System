# AI Service - Modular Multi-Model Vision Service

Dịch vụ AI thị giác máy tính phục vụ hệ thống Smart Office (Văn phòng thông minh), tích hợp kiến trúc đa mô hình độc lập (**Modular Vertical Slice Architecture**):
1. **Module Occupancy**: Phát hiện đầu người (**RT-DETR-L ONNX**) và cỗ máy trạng thái (**FSM**) giám sát hiện diện chỗ ngồi theo thời gian thực (30+ FPS).
2. **Module Face Recognition**: Sinh trắc học khuôn mặt (**SCRFD Face Detection + ArcFace 512D + Anti-Spoofing**).

> 📖 **Xem tài liệu chi tiết về kiến trúc**: Vui lòng tham khảo file [`ARCHITECTURE.md`](file:///d:/code/IOT/ai_service/ARCHITECTURE.md).

---

## 📌 1. Thông Tin Các Mô Hình Trong Hệ Thống

### A. Module Occupancy (Giám sát chỗ ngồi)
- **Kiến trúc mô hình**: RT-DETR-L (Real-Time DEtection TRansformer - Large).
- **Trọng số**: [`modules/occupancy/weights/rtdetr_head.onnx`](file:///d:/code/IOT/ai_service/modules/occupancy/weights/rtdetr_head.onnx) (~126 MB).
- **Nhiệm vụ (Task)**: Phát hiện đầu người (Head Detection) - Class `0: head`.
- **Kích thước đầu vào (Input shape)**: `1 x 3 x 960 x 960` (Tensor name: `images`).
- **Đầu ra (Output shape)**: `1 x 300 x 5` (300 bboxes x `[cx, cy, w, h, score]`, Tensor name: `output0`).
- **Engine suy luận**: `ONNX Runtime` (tự động ưu tiên `CUDAExecutionProvider` nếu có GPU NVIDIA, tự động fallback về `CPUExecutionProvider`).
- **Cơ chế suy luận ngầm**: `AsyncHeadDetector` chạy đa luồng bất đồng bộ (giữ video hiển thị mượt 30+ FPS không trễ).

### B. Module Face Recognition (Sinh trắc học khuôn mặt)
- **Face Detector**: SCRFD / RetinaFace ONNX trích xuất BBox và 5 điểm mốc giải phẫu.
- **Face Alignment**: Chuẩn hóa Affine 5 điểm về kích thước $112 \times 112$.
- **ArcFace**: Trích xuất vector đặc trưng $\vec{v} \in \mathbb{R}^{512}$ chuẩn hóa $L_2$ ($\|\vec{v}\|_2 = 1$).
- **Anti-Spoofing**: Đánh giá độ sắc nét Laplace $\text{Var}(\nabla^2 I) > 100$ và Deep Liveness Checker.

---

## ⚙️ 2. Chuẩn Bị Môi Trường

### Bước 1: Di chuyển vào thư mục dịch vụ AI
```bash
cd ai_service
```

### Bước 2: Tạo và kích hoạt môi trường ảo (Khuyến nghị)
**Trên Windows (PowerShell):**
```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

**Trên Linux / macOS:**
```bash
python3 -m venv .venv
source .venv/bin/activate
```

### Bước 3: Cài đặt các thư viện phụ thuộc
```bash
pip install -r requirements.txt
```

> **Mẹo tăng tốc trên GPU NVIDIA**: Nếu máy có card GPU NVIDIA và CUDA, hãy cài thêm `onnxruntime-gpu`:
> ```bash
> pip install onnxruntime-gpu
> ```

---

## 🧪 3. Kiểm Thử Tự Động (Unit Tests)

Chạy bộ test để xác thực tính toàn vẹn của mô hình `best.onnx`, thuật toán hình học Ray-Casting, Circular Ring Buffer và máy trạng thái FSM:

```bash
# Đứng tại thư mục gốc ai_service:
python -m unittest tests/test_onnx_inference.py

# Hoặc đứng tại thư mục gốc dự án (IOT/):
python -m unittest ai_service/tests/test_onnx_inference.py
```

---

## 🚀 4. Các Lệnh Chạy Mô Hình Trực Tiếp (CLI)

Tất cả các lệnh dưới đây được thực thi từ thư mục `ai_service` (`cd ai_service`):

### 4.1. Chạy với nguồn video tự động / mặc định
Tự động tìm kiếm video test có sẵn tại `D:\code\lmao\018.avi` (nếu không có sẽ chuyển sang Webcam 0):
```bash
python main.py
```

### 4.2. Chạy với Webcam máy tính
```bash
# Cách 1: Truyền vị trí tham số
python main.py 0

# Cách 2: Sử dụng cờ --source
python main.py --source 0
```

### 4.3. Chạy với file Video tùy ý
```bash
python main.py path/to/your_video.mp4
# Hoặc:
python main.py --source "D:/data/test_office.mp4"
```

### 4.4. Bỏ qua bước vẽ bàn, dùng luôn cấu hình bàn mặc định
Bỏ qua màn hình vẽ đa giác bằng chuột và áp dụng ngay tọa độ bàn chuẩn hóa định nghĩa sẵn trong [`core/config.py`](file:///d:/code/IOT/ai_service/core/config.py):
```bash
python main.py --no-select-roi
```

### 4.5. Ép buộc chạy mô hình trên CPU (Bỏ qua GPU)
```bash
python main.py --cpu
```

### 4.6. Điều chỉnh ngưỡng độ tin cậy (Confidence Threshold)
Mặc định là `0.35` (tối ưu hạn chế bỏ sót). Để nâng ngưỡng lên `0.45` hoặc `0.5`:
```bash
python main.py --conf 0.45
```

### 4.7. Chạy chế độ Frame-Skip truyền thống (Chế độ đồng bộ Sync)
Nếu không muốn dùng Async Threading ngầm mà muốn chạy tuần tự nhảy cóc frame:
```bash
python main.py --sync --skip 3
```

### 4.8. Chạy chế độ Headless (Không mở cửa sổ GUI hiển thị)
Thích hợp chạy nền trên server hoặc terminal không có màn hình:
```bash
python main.py --no-show
```

### 4.9. Lệnh tổng hợp nâng cao ví dụ
Chạy webcam với ngưỡng tin cậy 0.4, sử dụng cấu hình bàn có sẵn và chạy ngầm async:
```bash
python main.py 0 --conf 0.4 --no-select-roi
```

---

## 🌐 5. Chạy Chế Độ Web Server (FastAPI REST API)

Khởi chạy AI Service dưới dạng microservice HTTP phục vụ kiểm tra trạng thái sức khỏe (Health Check) và tích hợp backend:

```bash
python main.py --api --host 0.0.0.0 --port 8000
```

### Kiểm tra trạng thái tải mô hình:
- **Trình duyệt**: Truy cập [http://localhost:8000/health](http://localhost:8000/health) hoặc [http://localhost:8000/docs](http://localhost:8000/docs) (Swagger UI).
- **CURL**:
  ```bash
  curl http://localhost:8000/health
  ```
- **Phản hồi mẫu**:
  ```json
  {
    "status": "healthy",
    "model_loaded": true,
    "model_path": "D:\\code\\IOT\\ai_service\\models\\best.onnx",
    "execution_provider": "CUDAExecutionProvider",
    "device_name": "GPU (CUDA)",
    "input_names": ["images"],
    "input_shapes": [[1, 3, 960, 960]],
    "confidence_threshold": 0.35
  }
  ```

---

## 🖱️ 6. Hướng Dẫn Thao Tác Trong Giao Diện Trực Quan

Khi chạy chế độ có GUI (mặc định), hệ thống cung cấp các phím tắt và thao tác tương tác sau:

### Giai đoạn chọn vùng bàn làm việc (ROI Selection):
- **Click chuột trái**: Thêm điểm góc cho đa giác bàn.
- **Click chuột phải** hoặc phím **`n`**: Chốt hoàn tất bàn hiện tại (Bàn 1 ➔ Bàn 2 ➔ ...).
- **Phím `u`**: Undo (xóa điểm vừa click nhầm).
- **Phím `r`**: Reset (xóa tất cả để vẽ lại từ đầu).
- **Phím `SPACE`** hoặc **`ENTER`**: Hoàn tất vẽ và bắt đầu giám sát trực tiếp.
- **Phím `ESC`**: Bỏ qua bước vẽ, chuyển sang sử dụng tọa độ bàn mặc định.

### Giai đoạn đang giám sát trực tiếp (Live Stream & Dashboard):
- **Phím `q`** hoặc **`ESC`**: Dừng chương trình và đóng cửa sổ giám sát an toàn.

---

## 🐳 7. Chạy Bằng Docker Container

### Build Docker Image:
```bash
docker build -t ai-service .
```

### Khởi chạy Container:
```bash
docker run -d -p 8000:8000 --name smart-office-ai ai-service
```
