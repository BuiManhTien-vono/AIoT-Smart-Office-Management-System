"""
Entrypoint khởi động AI Service:
- Chế độ CLI: Chạy thử nghiệm phát hiện người & giám sát bàn làm việc trên Video / Webcam,
  tự động đồng bộ State-Sync sang Backend .NET 10.
- Chế độ API: Khởi chạy FastAPI Server phục vụ toàn bộ các endpoints cho Backend .NET.
"""

import os
import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

import argparse
from typing import Optional
from contextlib import asynccontextmanager

# Thêm thư mục hiện tại vào sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from shared.config import settings
from shared.backend_client import BackendSyncClient
from modules.occupancy.detector import RTDETRHeadDetector
from modules.occupancy.pipeline import OccupancyPipeline
from modules.occupancy.video_stream import VideoStreamProcessor, select_roi_polygons

# Nạp routers API
try:
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import RedirectResponse
    from api.routes_occupancy import router as occupancy_router
    from api.routes_face import router as face_router

    global_detector: Optional[RTDETRHeadDetector] = None

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        global global_detector
        try:
            model_file = settings.occupancy.ensure_model_exists()
            print(f"[*] Nạp mô hình ONNX RT-DETR-L từ: {model_file}")
            global_detector = RTDETRHeadDetector(
                model_path=model_file,
                conf_threshold=settings.confidence_threshold,
                imgsz=settings.imgsz
            )
            print(f"[+] Nạp thành công RT-DETR-L. Execution Provider: {global_detector.active_provider}")
        except Exception as e:
            print(f"[!] Lỗi khi nạp mô hình RT-DETR-L: {e}")

        try:
            face_models = settings.face.ensure_all_models_exist()
            print(f"[+] Toàn bộ 3 mô hình khuôn mặt đã sẵn sàng:")
            for k, v in face_models.items():
                print(f"    - {k}: {v}")
        except Exception as e:
            print(f"[!] Lỗi khi nạp mô hình khuôn mặt: {e}")

        yield

    app = FastAPI(
        title="Smart Office AI Computer Vision Service",
        description="Dịch vụ AI phân tích thị giác máy tính: Giám sát chỗ ngồi & Nhận diện sinh trắc học (Đồng bộ Backend .NET 10)",
        version="1.1.0",
        lifespan=lifespan
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Gắn các routes nghiệp vụ
    if occupancy_router is not None:
        app.include_router(occupancy_router)
    if face_router is not None:
        app.include_router(face_router)

    @app.get("/", include_in_schema=False)
    def index():
        """Tự động chuyển hướng về giao diện Swagger UI tài liệu API."""
        return RedirectResponse(url="/docs")

    @app.get("/health")
    def health_check():
        if global_detector and global_detector.session:
            return {
                "status": "healthy",
                "model_loaded": True,
                "model_path": settings.occupancy.model_path,
                "execution_provider": global_detector.active_provider,
                "device_name": global_detector.device_name,
                "input_names": global_detector.input_names,
                "input_shapes": [list(s) if s else [] for s in global_detector.input_shapes],
                "confidence_threshold": global_detector.conf_threshold,
                "backend_api_url": settings.backend_api_url,
                "modules": ["occupancy", "face_recognition"]
            }
        return {
            "status": "warning",
            "model_loaded": False,
            "backend_api_url": settings.backend_api_url,
            "modules": ["occupancy", "face_recognition"]
        }

except ImportError:
    app = None


def run_cli():
    parser = argparse.ArgumentParser(description="Chạy thử nghiệm AI Service (Occupancy & Face Recognition)")
    parser.add_argument("source_pos", nargs="?", default=None, help="Nguồn video: 0 (Webcam) hoặc đường dẫn file .mp4/.avi")
    parser.add_argument("--source", type=str, default=None, help="Nguồn video")
    parser.add_argument("--model", type=str, default=None, help="Đường dẫn file trọng số RT-DETR-L")
    parser.add_argument("--conf", type=float, default=0.35, help="Ngưỡng tự tin (mặc định 0.35)")
    parser.add_argument("--skip", type=int, default=5, help="Mức frame skip nếu không dùng async")
    parser.add_argument("--cpu", action="store_true", help="Chạy trên CPU thay vì GPU")
    parser.add_argument("--sync", action="store_true", help="Chạy chế độ đồng bộ (mặc định là ASYNC mượt 30 FPS)")
    parser.add_argument("--select-roi", action="store_true", default=True, help="Bật giao diện dùng chuột vẽ trực tiếp các bàn làm việc (Mặc định: BẬT)")
    parser.add_argument("--no-select-roi", dest="select_roi", action="store_false", help="Bỏ qua bước vẽ bằng chuột, sử dụng các vùng bàn mặc định / từ Backend")
    parser.add_argument("--show", action="store_true", default=True, help="Hiển thị cửa sổ trực quan OpenCV")
    parser.add_argument("--no-show", dest="show", action="store_false", help="Tắt hiển thị cửa sổ trực quan")
    parser.add_argument("--camera-code", type=str, default=settings.occupancy.default_camera_code, help="Mã camera đồng bộ với Backend .NET")
    parser.add_argument("--backend-url", type=str, default=settings.backend_api_url, help="URL gốc của Backend .NET API")
    parser.add_argument("--no-sync-backend", dest="sync_backend", action="store_false", default=True, help="Tắt tự động đẩy state-sync về Backend .NET")
    parser.add_argument("--api", action="store_true", help="Chạy ở chế độ FastAPI Web Server")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host cho FastAPI")
    parser.add_argument("--port", type=int, default=8000, help="Port cho FastAPI")

    args = parser.parse_args()

    if args.api:
        if app is None:
            print("[!] Lỗi: Chưa cài đặt FastAPI hoặc Uvicorn. Vui lòng cài: pip install fastapi uvicorn")
            sys.exit(1)
        import uvicorn
        print(f"[*] Khởi động FastAPI server tại http://{args.host}:{args.port}")
        uvicorn.run(app, host=args.host, port=args.port)
        return

    # Lựa chọn nguồn video
    source = args.source_pos or args.source
    if source is None:
        if settings.occupancy.fallback_video_path and os.path.exists(settings.occupancy.fallback_video_path):
            source = settings.occupancy.fallback_video_path
        else:
            source = 0  # Mặc định webcam

    # Chuyển kiểu webcam index nếu là chuỗi số
    if isinstance(source, str) and source.isdigit():
        source = int(source)

    model_path = args.model or settings.occupancy.model_path

    print("=" * 70)
    print(" HỆ THỐNG THỊ GIÁC MÁY TÍNH VĂN PHÒNG THÔNG MINH (SMART OFFICE AI)")
    print("=" * 70)
    print(f"  - Nguồn Video      : {source}")
    print(f"  - Mô hình RT-DETR  : {model_path}")
    print(f"  - Chế độ suy luận  : {'CPU' if args.cpu else 'GPU (Ưu tiên CUDA)'}")
    print(f"  - Luồng xử lý      : {'ĐỒNG BỘ (Sync)' if args.sync else 'BẤT ĐỒNG BỘ ĐA LUỒNG (Async 30 FPS)'}")
    print(f"  - Vẽ bàn trực quan : {'BẬT (Dùng chuột vẽ)' if args.select_roi else 'TẮT (Dùng mặc định / Backend)'}")
    print(f"  - Đồng bộ Backend  : {args.backend_url if args.sync_backend else 'TẮT'} (Camera: {args.camera_code})")
    print("=" * 70)

    # 1. Khởi tạo Head Detector
    try:
        detector = RTDETRHeadDetector(
            model_path=model_path,
            use_cpu=args.cpu,
            conf_threshold=args.conf,
            imgsz=settings.imgsz
        )
        print(f"[+] Khởi tạo detector thành công. Provider: {detector.active_provider}")
    except Exception as e:
        print(f"[!] Không thể khởi tạo detector: {e}")
        sys.exit(1)

    # 2. Khởi tạo Pipeline & Video Stream Processor
    pipeline = OccupancyPipeline(
        seats=settings.occupancy.default_seats,
        away_alert_sec=settings.occupancy.away_alert_seconds,
        anti_flicker_frames=settings.occupancy.anti_flicker_frames,
        prolonged_away_sec=settings.occupancy.prolonged_away_sec
    )

    backend_client = BackendSyncClient(base_api_url=args.backend_url) if args.sync_backend else None

    processor = VideoStreamProcessor(
        source=source,
        detector=detector,
        pipeline=pipeline,
        async_mode=not args.sync,
        frame_skip=args.skip,
        show_window=args.show,
        select_roi=args.select_roi,
        sync_backend=args.sync_backend,
        camera_code=args.camera_code,
        backend_client=backend_client
    )

    try:
        processor.run()
    except KeyboardInterrupt:
        print("\n[*] Đã dừng chương trình theo yêu cầu người dùng.")
    finally:
        processor.stop()


if __name__ == "__main__":
    run_cli()
