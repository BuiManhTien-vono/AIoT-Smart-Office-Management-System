# KIẾN TRÚC HỆ THỐNG AI SERVICE (AI SERVICE ARCHITECTURE)

Tài liệu này mô tả chi tiết kiến trúc thư mục, triết lý thiết kế và quy chuẩn mở rộng cho dịch vụ **AI Service** trong hệ thống Thị giác máy tính Văn phòng thông minh (**Smart Office AIoT**).

---

## 🎯 1. Triết Lý Thiết Kế: Feature-Driven / Vertical Slice

Ban đầu, các dự án AI thường gom chung code theo các tầng kỹ thuật ngang (`core/`, `models/`, `pipelines/`). Tuy nhiên, khi hệ thống triển khai nhiều mô hình khác nhau về bản chất vận hành (Stream 24/7 đối nghịch với Event/API On-demand), cấu trúc phân tầng ngang bộc lộ nhiều hạn chế:
- **Xung đột nghiệp vụ**: Sửa code xử lý khuôn mặt vô tình ảnh hưởng đến thuật toán giám sát chỗ ngồi.
- **Quá tải nhận thức (Cognitive Load)**: Phải mở cùng lúc 4-5 thư mục để sửa một tính năng.
- **Khó quản lý tài nguyên phần cứng**: Khó cô lập việc mô hình nào dùng GPU, mô hình nào dùng CPU.

Do đó, **AI Service được tái cấu trúc theo mô hình Phân mảng nghiệp vụ độc lập (Vertical Slice / Feature Modules)**:
- Mỗi module là một đơn vị khép kín (**Self-contained**): Tự quản lý `weights/`, `detector.py`, `pipeline.py` và thuật toán riêng.
- Các tài nguyên nền tảng (ONNX Engine, cấu hình, xử lý ảnh) được tập trung tại `shared/`.

```
                  ┌──────────────────────────────────────────────┐
                  │                 FastAPI App                  │
                  │              (ai_service/main.py)            │
                  └──────┬────────────────────────────────┬──────┘
                         │                                │
            ┌────────────▼──────────┐        ┌────────────▼──────────┐
            │   api/routes_occupancy│        │     api/routes_face   │
            └────────────┬──────────┘        └────────────┬──────────┘
                         │                                │
        ┌────────────────▼──────────────┐  ┌──────────────▼────────────────┐
        │  modules/occupancy            │  │  modules/face_recognition     │
        │  - RT-DETR-L Head Detector    │  │  - Face Detector (5 Landmarks)│
        │  - Ray-Casting & cv2 Polygon  │  │  - Face Aligner (112x112)     │
        │  - 4-State FSM Engine         │  │  - ArcFace 512D Embeddings    │
        │  - Async Video Stream Handler │  │  - Liveness & Anti-Spoofing   │
        └────────────────┬──────────────┘  └──────────────┬────────────────┘
                         │                                │
                         └────────────────┬───────────────┘
                                          │
                        ┌─────────────────▼─────────────────┐
                        │              shared/              │
                        │  - OnnxEngine (CUDA / CPU)        │
                        │  - Image Utils & Ring Buffer      │
                        │  - Central Config & Settings      │
                        └───────────────────────────────────┘
```

---

## 📁 2. Sơ Đồ Cấu Trúc Thư Mục Chi Tiết

```text
ai_service/
│
├── shared/                                 # [TẦNG DÙNG CHUNG] Tiện ích & Engine cốt lõi
│   ├── engines/                            # Quản lý phiên thực thi suy luận (Inference Runtimes)
│   │   ├── base_engine.py                  # Interface trừu tượng BaseInferenceEngine
│   │   └── onnx_engine.py                  # OnnxEngine: Quản lý CUDA/CPU fallback, DLL & Warm-up
│   ├── utils/                              # Tiện ích toán học & xử lý ảnh
│   │   ├── image_processing.py             # Letterbox, direct resize, kiểm tra độ nét Laplace
│   │   └── ring_buffer.py                  # Circular Ring Buffer lưu trữ frame trên RAM
│   └── config.py                           # Cấu hình tập trung (Pydantic Settings)
│
├── modules/                                # [TẦNG NGHIỆP VỤ] Các module AI độc lập
│   │
│   ├── occupancy/                          # MODULE 1: GIÁM SÁT HIỆN DIỆN CHỖ NGỒI (Real-time Stream 24/7)
│   │   ├── weights/                        # Trọng số mô hình của riêng Occupancy
│   │   │   └── rtdetr_head.onnx            # RT-DETR-L ONNX (~126 MB, input 960x960)
│   │   ├── detector.py                     # RTDETRHeadDetector & AsyncHeadDetector chạy ngầm
│   │   ├── geometry.py                     # Point-in-Box, Point-in-Polygon (Ray-Casting C++)
│   │   ├── fsm.py                          # Máy trạng thái 4 bước: EMPTY, PRESENT, AWAY
│   │   ├── pipeline.py                     # OccupancyPipeline kết nối Detector + Geometry + FSM
│   │   └── video_stream.py                 # VideoStreamProcessor & công cụ vẽ bàn bằng chuột
│   │
│   └── face_recognition/                   # MODULE 2: NHẬN DIỆN KHUÔN MẶT (Event-driven / REST API)
│       ├── weights/                        # Trọng số mô hình sinh trắc học
│       │   ├── .gitkeep
│       │   ├── scrfd_face_det.onnx         # Mô hình phát hiện mặt & 5 điểm mốc
│       │   ├── arcface_res50.onnx          # Mô hình trích xuất vector 512D
│       │   └── anti_spoofing.onnx          # Mô hình kiểm tra thực thể sống Liveness
│       ├── detector.py                     # SCRFDFaceDetector (Crop mặt + trích 5 landmarks)
│       ├── aligner.py                      # FaceAligner: Biến đổi Affine 5 điểm về chuẩn 112x112
│       ├── recognizer.py                   # ArcFaceRecognizer: Trích xuất vector 512D chuẩn hóa L2
│       ├── anti_spoofing.py                # AntiSpoofingChecker: Kiểm định độ sắc nét & liveness
│       └── pipeline.py                     # FaceRecognitionPipeline: Xử lý ảnh mẫu & kiểm tra trùng lặp
│
├── api/                                    # [GIAO TIẾP NGOẠI VI] REST API Endpoints (FastAPI)
│   ├── routes_occupancy.py                 # Endpoints tra cứu trạng thái bàn, cấu hình tọa độ
│   └── routes_face.py                      # Endpoints đăng ký mặt, trích xuất vector, check trùng lặp
│
├── tests/                                  # [KIỂM THỬ TỰ ĐỘNG] Unit tests độc lập
│   ├── test_occupancy.py                   # Test thuật toán bàn ghế, FSM, suy luận RT-DETR
│   ├── test_face.py                        # Test căn chỉnh Affine, Cosine similarity, lọc ảnh mờ
│   └── test_onnx_inference.py              # Suite test tương thích ngược toàn hệ thống
│
├── main.py                                 # Entrypoint chính: Chạy CLI Stream hoặc FastAPI Server
├── requirements.txt                        # Danh sách thư viện Python phụ thuộc
└── Dockerfile                              # Cấu hình container hóa độc lập cho AI Service
```

---

## 🔄 3. Luồng Dữ Liệu Các Nghiệp Vụ (Data Pipelines)

### 3.1. Luồng Giám Sát Chỗ Ngồi (Occupancy Pipeline)
Chạy liên tục theo thời gian thực (30+ FPS) không gây nghẽn luồng video nhờ `AsyncHeadDetector`:

$$\text{RTSP / Camera Frame} \xrightarrow{\text{Video Thread}} \text{Display (30+ FPS)}$$
$$\downarrow \text{(Background Thread)}$$
$$\text{RT-DETR-L 960x960} \xrightarrow{\text{NumPy Mask}} \text{Tâm đầu người } (c_x, c_y)$$
$$\downarrow$$
$$\text{Kiểm tra Đa giác Bàn } \mathcal{P}_{\text{seat}} \xrightarrow{\text{cv2.pointPolygonTest}} \text{Có người / Vắng mặt}$$
$$\downarrow$$
$$\text{Máy trạng thái FSM} \xrightarrow{\text{Anti-flicker}} \begin{cases} 
\text{EMPTY} & \text{(Bàn trống)} \\
\text{PRESENT} & \text{(Có mặt làm việc)} \\
\text{TEMP\_AWAY} & \text{(Vắng mặt } t < 10\text{s - } 15\text{m)} \\
\text{PROLONGED\_AWAY} & \text{(Vắng kéo dài } \rightarrow \text{Cảnh báo đỏ)}
\end{cases}$$

---

### 3.2. Luồng Sinh Trắc Khuôn Mặt (Face Recognition Pipeline)
Kích hoạt theo sự kiện (Khi tải ảnh đăng ký hoặc khi nhân viên chấm công):

$$\text{Ảnh chân dung đầu vào}$$
$$\downarrow$$
$$\text{Kiểm định số lượng mặt (FR-BIO-03): Reject nếu } \ne 1 \text{ mặt}$$
$$\downarrow$$
$$\text{Kiểm định chất lượng: } \text{Var}(\nabla^2 I) > 100 \text{ và Size } \ge 112 \times 112\text{ px}$$
$$\downarrow$$
$$\text{Face Alignment: Biến đổi Affine dựa trên 5 điểm mốc } \rightarrow \text{Ảnh chuẩn } 112 \times 112$$
$$\downarrow$$
$$\text{ArcFace Backbone} \rightarrow \vec{v} \in \mathbb{R}^{512} \quad \text{với} \quad \|\vec{v}\|_2 = 1$$
$$\downarrow$$
$$\text{Cosine Similarity Check: } \text{Sim}(\vec{v}, \vec{v}_i) = \vec{v} \cdot \vec{v}_i > 0.85 \rightarrow \text{Cảnh báo trùng hồ sơ}$$

---

## ⚡ 4. Quản Lý Tài Nguyên Phần Cứng (GPU GTX 1650 4GB)

Hệ thống được thiết kế để vận hành an toàn trên các thiết bị biên hoặc máy trạm có VRAM hạn chế (4GB VRAM):

| Tác vụ / Mô hình | Thiết bị chỉ định | Mức tiêu thụ VRAM / RAM | Ghi chú |
| :--- | :--- | :--- | :--- |
| **RT-DETR-L (960x960)** | **GPU (CUDA)** | $\approx 1.5 - 1.8\text{ GB VRAM}$ | Luồng liên tục, ưu tiên GPU để đạt tốc độ cao. |
| **Face Detector & ArcFace** | **GPU (CUDA)** | $\approx 0.6 - 0.8\text{ GB VRAM}$ | Kích hoạt theo sự kiện (On-demand), giải phóng nhanh. |
| **Anti-Spoofing & Liveness** | **CPU** | $\approx 200\text{ MB RAM}$ | Chạy trên CPU để tiết kiệm VRAM cho RT-DETR. |
| **Tổng tiêu thụ VRAM** | -- | **$\le 2.6\text{ GB} < 4.0\text{ GB}$** | Tuyệt đối an toàn, không bị tràn bộ nhớ (`CUDA OOM`). |

---

## 🛠️ 5. Hướng Dẫn Dành Cho Lập Trình Viên

### 5.1. Khởi chạy Dịch vụ

#### Cách 1: Chạy Server REST API (FastAPI)
```bash
# Đứng tại thư mục gốc ai_service:
python main.py --api --host 0.0.0.0 --port 8000
```
- Tài liệu tương tác Swagger UI: `http://localhost:8000/docs`
- Kiểm tra trạng thái hoạt động: `http://localhost:8000/health`

#### Cách 2: Chạy Giám sát Video thời gian thực (CLI GUI)
```bash
# Chạy với webcam mặc định, có vẽ bàn bằng chuột:
python main.py 0

# Chạy với file video có sẵn:
python main.py path/to/video.mp4 --conf 0.35
```

---

### 5.2. Chạy Kiểm Thử Tự Động (Unit Tests)

Bộ kiểm thử được viết độc lập bằng `unittest`, tự động kiểm tra toàn vẹn từ thuật toán hình học đến suy luận mô hình:

```bash
# Chạy toàn bộ 14+ unit tests:
python -m unittest discover -s tests

# Chạy riêng kiểm thử Occupancy:
python -m unittest tests/test_occupancy.py

# Chạy riêng kiểm thử Face Recognition:
python -m unittest tests/test_face.py
```

---

### 5.3. Quy Chuẩn Khi Thêm Một Mô Hình Mới

Khi muốn tích hợp thêm một mô hình mới vào dự án:
1. **Đặt file trọng số** vào thư mục `weights/` của module liên quan (hoặc tạo module mới trong `modules/<ten_module>/weights/`).
2. **Kế thừa `OnnxEngine`** từ `shared/engines/onnx_engine.py` để tự động thừa hưởng cơ chế fallback CUDA/CPU và warm-up.
3. **Định nghĩa Pre-processing & Post-processing** bên trong file `detector.py` hoặc `model.py` của module đó.
4. **Viết Unit Test** tương ứng trong `tests/` để xác thực đầu vào/đầu ra trước khi tích hợp vào pipeline chính.
