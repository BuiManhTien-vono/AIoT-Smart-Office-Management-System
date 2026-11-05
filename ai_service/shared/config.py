"""
Cấu hình tập trung cho AI Service (Smart Office Vision).
Quản lý tham số cho cả 2 module: Occupancy và Face Recognition.
"""

import os
from pathlib import Path
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

# Thư mục gốc của ai_service
BASE_DIR = Path(__file__).resolve().parent.parent

class SeatBox(BaseModel):
    """Định nghĩa một hình hộp / vùng đa giác bàn làm việc ảo."""
    seat_id: str
    seat_name: str
    # Hỗ trợ dạng hình hộp [xmin, ymin, xmax, ymax] tỷ lệ [0.0, 1.0]
    normalized_box: List[float] = Field(
        ...,
        description="[xmin, ymin, xmax, ymax] với giá trị từ 0.0 đến 1.0"
    )

class OccupancySettings(BaseModel):
    """Cấu hình riêng cho Module Occupancy (Giám sát bàn làm việc)."""
    # Đường dẫn file trọng số RT-DETR-L
    primary_weight_path: Path = BASE_DIR / "modules" / "occupancy" / "weights" / "rtdetr_head.onnx"
    legacy_weight_path: Path = BASE_DIR / "models" / "best.onnx"

    # Link tải tự động từ GitHub Releases chính thức
    model_download_url: str = "https://github.com/BuiManhTien-vono/AIoT-Smart-Office-Management-System/releases/download/v1.0/rt_detr_L-v1.0.0.onnx"

    @property
    def model_path(self) -> str:
        if self.primary_weight_path.exists():
            return str(self.primary_weight_path)
        if self.legacy_weight_path.exists():
            return str(self.legacy_weight_path)
        return str(self.primary_weight_path)

    def ensure_model_exists(self) -> str:
        """Kiểm tra và tự động tải mô hình từ GitHub Release nếu máy mới chưa có file."""
        target_path = self.primary_weight_path
        if target_path.exists() and target_path.stat().st_size > 10_000_000:
            return str(target_path)

        if self.legacy_weight_path.exists() and self.legacy_weight_path.stat().st_size > 10_000_000:
            return str(self.legacy_weight_path)

        target_path.parent.mkdir(parents=True, exist_ok=True)
        print(f"\n[!] Chưa tìm thấy file trọng số RT-DETR-L tại: {target_path}")
        print(f"[*] Đang tự động tải mô hình từ GitHub Releases:")
        print(f"    URL: {self.model_download_url}")
        self._download_with_progress(self.model_download_url, target_path)
        print(f"\n[+] Tải thành công! Mô hình đã sẵn sàng tại: {target_path}\n")
        return str(target_path)

    @staticmethod
    def _download_with_progress(url: str, output_path: Path):
        import urllib.request
        import sys

        temp_path = output_path.with_suffix(".downloading")

        def reporthook(block_num, block_size, total_size):
            downloaded = block_num * block_size
            if total_size > 0:
                percent = min(100.0, (downloaded / total_size) * 100)
                mb_down = downloaded / (1024 * 1024)
                mb_total = total_size / (1024 * 1024)
                sys.stdout.write(f"\r    [Tải xuống] {percent:5.1f}% [{mb_down:6.1f}MB / {mb_total:6.1f}MB]")
                sys.stdout.flush()

        try:
            opener = urllib.request.build_opener()
            opener.addheaders = [("User-Agent", "Mozilla/5.0 (AIoT-Service)")]
            urllib.request.install_opener(opener)

            urllib.request.urlretrieve(url, temp_path, reporthook)
            if temp_path.exists():
                temp_path.replace(output_path)
        except Exception as e:
            if temp_path.exists():
                temp_path.unlink()
            raise RuntimeError(f"Lỗi khi tải mô hình từ {url}: {e}")

    confidence_threshold: float = 0.35
    imgsz: int = 960
    async_mode: bool = True
    frame_skip: int = 5
    ring_buffer_capacity: int = 150
    away_alert_seconds: float = 10.0
    anti_flicker_frames: int = 15
    prolonged_away_sec: float = 900.0
    fallback_video_path: Optional[str] = "D:\\code\\lmao\\018.avi"

    default_seats: List[SeatBox] = [
        SeatBox(
            seat_id="SEAT-01",
            seat_name="Bàn làm việc 01",
            normalized_box=[0.25, 0.20, 0.75, 0.80]
        ),
        SeatBox(
            seat_id="SEAT-02",
            seat_name="Bàn làm việc 02",
            normalized_box=[0.05, 0.20, 0.24, 0.80]
        ),
        SeatBox(
            seat_id="SEAT-03",
            seat_name="Bàn làm việc 03",
            normalized_box=[0.76, 0.20, 0.95, 0.80]
        ),
    ]

class FaceRecognitionSettings(BaseModel):
    """Cấu hình riêng cho Module Face Recognition (Nhận diện khuôn mặt)."""
    weights_dir: Path = BASE_DIR / "modules" / "face_recognition" / "weights"
    detector_model: str = "scrfd_face_det.onnx"
    recognizer_model: str = "arcface_res50.onnx"
    anti_spoofing_model: str = "anti_spoofing.onnx"

    @property
    def detector_path(self) -> Path:
        for fname in [self.detector_model, "det_500m.onnx", "det_500m-v1.0.0.onnx"]:
            candidate = self.weights_dir / fname
            if candidate.exists():
                return candidate
        return self.weights_dir / self.detector_model

    @property
    def recognizer_path(self) -> Path:
        for fname in [self.recognizer_model, "iresnet50.onnx"]:
            candidate = self.weights_dir / fname
            if candidate.exists():
                return candidate
        return self.weights_dir / self.recognizer_model

    @property
    def anti_spoofing_path(self) -> Path:
        for fname in [self.anti_spoofing_model, "minifasnet_v2.onnx"]:
            candidate = self.weights_dir / fname
            if candidate.exists():
                return candidate
        return self.weights_dir / self.anti_spoofing_model

    # Ngưỡng cosine similarity cho nhận diện khuôn mặt trùng khớp (FR-BIO-05: 0.85)
    similarity_threshold: float = 0.85

    # Kiểm tra chất lượng khuôn mặt (FR-BIO-03)
    min_face_size: int = 112
    laplacian_blur_threshold: float = 100.0

    # Kích thước ảnh chuẩn sau khi căn chỉnh 5 điểm mốc đưa vào ArcFace
    arcface_input_size: int = 112

class Settings(BaseModel):
    """Cấu hình tổng thể của AI Service."""
    occupancy: OccupancySettings = Field(default_factory=OccupancySettings)
    face: FaceRecognitionSettings = Field(default_factory=FaceRecognitionSettings)

    # Thuộc tính tương thích ngược cho code cũ
    @property
    def model_path(self) -> str:
        return self.occupancy.model_path

    @property
    def confidence_threshold(self) -> float:
        return self.occupancy.confidence_threshold

    @property
    def imgsz(self) -> int:
        return self.occupancy.imgsz

    @property
    def async_mode(self) -> bool:
        return self.occupancy.async_mode

    @property
    def frame_skip(self) -> int:
        return self.occupancy.frame_skip

    @property
    def ring_buffer_capacity(self) -> int:
        return self.occupancy.ring_buffer_capacity

    @property
    def away_alert_seconds(self) -> float:
        return self.occupancy.away_alert_seconds

    @property
    def anti_flicker_frames(self) -> int:
        return self.occupancy.anti_flicker_frames

    @property
    def prolonged_away_sec(self) -> float:
        return self.occupancy.prolonged_away_sec

    @property
    def fallback_video_path(self) -> Optional[str]:
        return self.occupancy.fallback_video_path

    @property
    def default_seats(self) -> List[SeatBox]:
        return self.occupancy.default_seats

settings = Settings()
