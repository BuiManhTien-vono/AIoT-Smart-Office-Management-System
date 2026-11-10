"""
Kiểm tra thực thể sống & chống giả mạo khuôn mặt (Anti-Spoofing & Liveness).
Tích hợp mô hình học sâu MiniFASNet-V2 (FR-ATT-01) và kiểm tra độ nét Laplace (FR-BIO-03).
Tự động tải mô hình từ GitHub Release nếu máy chưa có file trọng số.
"""

import os
import cv2
import numpy as np
from typing import Tuple, Optional, Dict, Any

from shared.config import settings
from shared.engines.onnx_engine import OnnxEngine
from shared.utils.image_processing import calculate_laplacian_blur


class AntiSpoofingChecker:
    """
    Bộ kiểm tra thực thể sống & chống giả mạo khuôn mặt (MiniFASNet-V2).
    Chạy suy luận trên CPU hoặc GPU.
    """

    def __init__(
        self,
        model_path: Optional[str] = None,
        blur_threshold: float = 20.0,
        min_face_size: int = 112,
        use_cpu: bool = True,
        auto_download: bool = True
    ):
        target_path = model_path
        if not target_path or not os.path.exists(target_path):
            if auto_download:
                try:
                    target_path = settings.face.ensure_anti_spoofing_exists()
                except Exception as e:
                    print(f"[AntiSpoofingChecker] Warning: Không thể nạp anti-spoofing: {e}")
                    target_path = str(settings.face.anti_spoofing_path)
            else:
                target_path = str(settings.face.anti_spoofing_path)

        self.model_path = target_path if os.path.exists(target_path) else None
        self.blur_threshold = blur_threshold
        self.min_face_size = min_face_size
        self.use_cpu = use_cpu
        self.engine: Optional[OnnxEngine] = None

        if self.model_path and os.path.exists(self.model_path):
            self.engine = OnnxEngine(model_path=self.model_path, use_cpu=use_cpu)

    def assess_quality(self, face_crop: np.ndarray) -> Tuple[bool, str, float]:
        """
        Đánh giá chất lượng khuôn mặt (FR-BIO-03):
        1. Kích thước tối thiểu: Chiều dài tối đa >= 112px và cạnh ngắn >= 65px (phù hợp tỷ lệ oval mặt người).
        2. Độ sắc nét Laplace >= 20.0 (chấp nhận ảnh điện thoại có làm mịn da tự nhiên, lọc ảnh rung nhòe).
        """
        if face_crop is None or face_crop.size == 0:
            return False, "Khuôn mặt rỗng.", 0.0

        h, w = face_crop.shape[:2]
        if max(h, w) < self.min_face_size or min(h, w) < 65:
            return False, f"Khuôn mặt quá nhỏ ({w}x{h} px < {self.min_face_size} px)", 0.0

        blur_score = calculate_laplacian_blur(face_crop)
        if blur_score < self.blur_threshold:
            return False, f"Ảnh bị mờ nhòe (Score_blur={blur_score:.1f} < {self.blur_threshold:.1f})", blur_score

        return True, "Chất lượng đạt yêu cầu", blur_score

    def crop_fas_patch(self, img_bgr: np.ndarray, bbox: Tuple[int, int, int, int], scale: float = 2.7, out_size: int = 80) -> np.ndarray:
        """Cắt patch mở rộng theo tỷ lệ scale 2.7 cho MiniFASNet-V2."""
        src_h, src_w = img_bgr.shape[:2]
        x1, y1, x2, y2 = bbox
        x1 = max(0, min(src_w - 1, int(x1)))
        y1 = max(0, min(src_h - 1, int(y1)))
        x2 = max(x1 + 1, min(src_w, int(x2)))
        y2 = max(y1 + 1, min(src_h, int(y2)))

        w = max(1, x2 - x1)
        h = max(1, y2 - y1)
        cx = x1 + w / 2.0
        cy = y1 + h / 2.0

        new_w = w * scale
        new_h = h * scale

        left_top_x = max(0, int(cx - new_w / 2.0))
        left_top_y = max(0, int(cy - new_h / 2.0))
        right_bottom_x = min(src_w, int(cx + new_w / 2.0))
        right_bottom_y = min(src_h, int(cy + new_h / 2.0))

        if right_bottom_x <= left_top_x or right_bottom_y <= left_top_y:
            crop = img_bgr[y1:y2, x1:x2]
        else:
            crop = img_bgr[left_top_y:right_bottom_y, left_top_x:right_bottom_x]

        if crop.size == 0 or crop.shape[0] == 0 or crop.shape[1] == 0:
            crop = img_bgr

        return cv2.resize(crop, (out_size, out_size))

    def check_liveness(
        self,
        img_bgr: np.ndarray,
        bbox: Optional[Tuple[int, int, int, int]] = None,
        threshold: float = 0.60
    ) -> Tuple[bool, float, Dict[str, Any]]:
        """
        Kiểm tra người thật (Anti-Spoofing / Liveness Check) bằng MiniFASNet-V2.
        """
        if self.engine is None:
            is_good, _, score = self.assess_quality(img_bgr)
            return is_good, 1.0 if is_good else 0.0, {"warning": "Mô hình MiniFASNet chưa được nạp."}

        if bbox is not None:
            patch = self.crop_fas_patch(img_bgr, bbox, scale=2.7, out_size=80)
        else:
            patch = cv2.resize(img_bgr, (80, 80))

        blob = patch.astype(np.float32).transpose(2, 0, 1)
        blob = np.expand_dims(blob, axis=0)

        input_name = self.engine.input_names[0]
        logits = self.engine.run({input_name: blob})[0]

        exp_l = np.exp(logits - np.max(logits))
        probs = exp_l / np.sum(exp_l)
        real_score = float(probs[0][1])
        is_real = real_score >= threshold

        return is_real, real_score, {
            "real_score": real_score,
            "spoof_print_score": float(probs[0][0]),
            "spoof_screen_score": float(probs[0][2]),
            "is_real": is_real,
            "threshold": threshold
        }
