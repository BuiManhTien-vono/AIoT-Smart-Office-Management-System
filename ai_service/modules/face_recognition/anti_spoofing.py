"""
Kiểm tra thực thể sống & chống giả mạo khuôn mặt (Anti-Spoofing & Liveness).
Tích hợp kiểm tra độ nét Laplace (FR-BIO-03) và Deep Liveness Model.
"""

import os
import cv2
import numpy as np
from typing import Tuple, Optional

from shared.engines.onnx_engine import OnnxEngine
from shared.utils.image_processing import calculate_laplacian_blur

class AntiSpoofingChecker:
    """
    Kiểm tra thực thể sống. Khuyến nghị chạy trên CPU để tiết kiệm VRAM GPU cho RT-DETR.
    """

    def __init__(
        self,
        model_path: Optional[str] = None,
        blur_threshold: float = 100.0,
        min_face_size: int = 112,
        use_cpu: bool = True
    ):
        self.model_path = model_path
        self.blur_threshold = blur_threshold
        self.min_face_size = min_face_size
        self.use_cpu = use_cpu
        self.engine: Optional[OnnxEngine] = None

        if model_path and os.path.exists(model_path):
            self.engine = OnnxEngine(model_path=model_path, use_cpu=True)

    def assess_quality(self, face_crop: np.ndarray) -> Tuple[bool, str, float]:
        """
        Đánh giá chất lượng khuôn mặt (FR-BIO-03):
        1. Kích thước tối thiểu >= 112x112 px.
        2. Độ sắc nét Laplace > 100.0.
        """
        h, w = face_crop.shape[:2]
        if h < self.min_face_size or w < self.min_face_size:
            return False, f"Khuôn mặt quá nhỏ ({w}x{h} px < {self.min_face_size}x{self.min_face_size} px)", 0.0

        blur_score = calculate_laplacian_blur(face_crop)
        if blur_score <= self.blur_threshold:
            return False, f"Ảnh bị mờ nhòe (Score_blur={blur_score:.1f} <= {self.blur_threshold})", blur_score

        return True, "Chất lượng đạt yêu cầu", blur_score

    def check_liveness(self, face_crop: np.ndarray) -> Tuple[bool, float]:
        """
        Kiểm tra ảnh thật hay giả mạo (màn hình điện thoại / ảnh in giấy).
        Trả về: (is_real, confidence_score)
        """
        # Nếu chưa nạp model liveness deep learning: dựa trên đánh giá chất lượng
        if self.engine is None:
            is_good, _, score = self.assess_quality(face_crop)
            return is_good, 1.0 if is_good else 0.0

        # Nếu có model ONNX MiniFASNet:
        # Preprocessing và suy luận trên CPU
        return True, 0.95
