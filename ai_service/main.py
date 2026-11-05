"""
Entrypoint chính cho Dịch vụ AI (AI Service - Modular Multi-Model Architecture).
Hỗ trợ cả 2 module:
1. Occupancy: Giám sát chỗ ngồi thời gian thực với RT-DETR-L.
2. Face Recognition: Sinh trắc học & nhận diện khuôn mặt qua REST API.
"""

import sys
import os
import argparse
from typing import Optional, List
from pathlib import Path

# Đảm bảo UTF-8 an toàn trên Windows Console
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from shared.config import settings, SeatBox
from modules.occupancy import (
    RTDETRHeadDetector,
    OccupancyPipeline,
    VideoStreamProcessor
)
from shared.utils.ring_buffer import CircularRingBuffer

# Khởi tạo FastAPI App
try:
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    import uvicorn
    from api import occupancy_router, face_router

    app = FastAPI(
        title="AIoT Smart Office - AI Service",
        description="Dịch vụ AI đa mô hình: Giám sát chỗ ngồi (RT-DETR-L) & Sinh trắc khuôn mặt (ArcFace)",
        version="2.0.0"
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

    global_detector: Optional[RTDETRHeadDetector] = None

    @app.on_event("startup")
    def startup_event():
        global global_detector
        try:
            model_file = settings.occupancy.ensure_model_exists()
            print(f"[*] Nạp mô hình ONNX RT-DETR-L từ: {model_file}")
            global_detector = RTDETRHeadDetector(
                model_path=model_file,
                conf_threshold=settings.confidence_threshold,
                imgsz=settings.imgsz
            )
            print(f"[+] Nạp thành công. Execution Provider: {global_detector.active_provider}")
        except Exception as e:
            print(f"[!] Lỗi khi nạp mô hình: {e}")

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
                "modules": ["occupancy", "face_recognition"]
            }
        return {"status": "warning", "model_loaded": False, "modules": ["occupancy", "face_recognition"]}

except ImportError:
    app = None


def resolve_video_source(source_arg: Optional[str]) -> str:
    """Tự động phát hiện nguồn video thông minh (từ D:\\code\\lmao\\018.avi hoặc webcam)."""
    if source_arg:
        return source_arg

    lmao_video = "D:\\code\\lmao\\018.avi"
    if os.path.exists(lmao_video):
        print(f"[INFO] Tự động chọn video test thực tế: {lmao_video}")
        return lmao_video

    return "0"


def main():
    parser = argparse.ArgumentParser(description="Chạy thử nghiệm AI Service (Occupancy & Face Recognition)")
    parser.add_argument("source_pos", nargs="?", default=None, help="Nguồn video: 0 (Webcam) hoặc đường dẫn file .mp4/.avi")
    parser.add_argument("--source", type=str, default=None, help="Nguồn video")
    parser.add_argument("--model", type=str, default=settings.occupancy.model_path, help="Đường dẫn file trọng số RT-DETR-L")
    parser.add_argument("--conf", type=float, default=settings.confidence_threshold, help="Ngưỡng tự tin (mặc định 0.35)")
    parser.add_argument("--skip", type=int, default=settings.frame_skip, help="Mức frame skip nếu không dùng async")
    parser.add_argument("--cpu", action="store_true", help="Chạy trên CPU thay vì GPU")
    parser.add_argument("--sync", action="store_true", help="Chạy chế độ đồng bộ (mặc định là ASYNC mượt 30 FPS)")
    parser.add_argument("--select-roi", action="store_true", default=True, help="Bật giao diện dùng chuột vẽ trực tiếp các bàn làm việc (Mặc định: BẬT)")
    parser.add_argument("--no-select-roi", dest="select_roi", action="store_false", help="Bỏ qua bước vẽ bằng chuột, sử dụng các vùng bàn mặc định")
    parser.add_argument("--show", action="store_true", default=True, help="Hiển thị cửa sổ trực quan OpenCV")
    parser.add_argument("--no-show", dest="show", action="store_false", help="Tắt hiển thị cửa sổ trực quan")
    parser.add_argument("--api", action="store_true", help="Chạy ở chế độ FastAPI Web Server")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host cho FastAPI")
    parser.add_argument("--port", type=int, default=8000, help="Port cho FastAPI")

    args = parser.parse_args()

    # 1. Chế độ FastAPI
    if args.api:
        if app is None:
            print("[!] Thiếu thư viện fastapi/uvicorn. Chạy: pip install fastapi uvicorn")
            sys.exit(1)
        print(f"[*] Khởi động FastAPI server tại http://{args.host}:{args.port}")
        uvicorn.run(app, host=args.host, port=args.port)
        return

    # 2. Chế độ Stream CLI trực quan (Occupancy)
    selected_source = resolve_video_source(args.source or args.source_pos)
    use_async = not args.sync

    print("=" * 75)
    print("AIoT SMART OFFICE - RT-DETR-L HEAD DETECTION & OCCUPANCY MONITOR")
    print("=" * 75)
    print(f"  • Nguồn Video:         {selected_source}")
    print(f"  • File Trọng số:       {args.model}")
    print(f"  • Ngưỡng Tin cậy:      {args.conf}")
    print(f"  • Chế độ luồng:        {'ASYNC THREADING (30+ FPS Mượt mà 100%)' if use_async else f'FRAME SKIP (1/{args.skip})'}")
    print(f"  • Vẽ bàn bằng chuột:   {args.select_roi}")
    print(f"  • Hiển thị GUI:        {args.show}")
    print("=" * 75)

    # Nạp Detector
    try:
        detector = RTDETRHeadDetector(
            model_path=args.model,
            use_cpu=args.cpu,
            conf_threshold=args.conf,
            imgsz=settings.imgsz
        )
        print(f"[+] Nạp thành công mô hình ONNX: {detector.device_name} ({detector.active_provider})")
    except Exception as e:
        print(f"[!] Lỗi khi nạp mô hình: {e}")
        detector = None

    # Khởi tạo Pipeline
    pipeline = OccupancyPipeline(seats=settings.default_seats, away_alert_sec=settings.away_alert_seconds)

    # Khởi chạy Processor
    processor = VideoStreamProcessor(
        source=selected_source,
        detector=detector,
        occupancy_pipeline=pipeline,
        async_mode=use_async,
        frame_skip=args.skip,
        loop=True
    )

    processor.run(show_window=args.show, select_roi=args.select_roi)


if __name__ == "__main__":
    main()
