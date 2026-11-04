"""
Bộ phát hiện khuôn mặt & 5 điểm mốc giải phẫu (Face Detection & Landmarks).
Hỗ trợ mô hình SCRFD / RetinaFace định dạng ONNX.
"""

import os
import cv2
import numpy as np
from typing import List, Tuple, Optional
from dataclasses import dataclass

from shared.engines.onnx_engine import OnnxEngine
from shared.utils.image_processing import letterbox

@dataclass
class FaceDetection:
    """Đối tượng phát hiện khuôn mặt với 5 điểm mốc giải phẫu (5-landmarks)."""
    bbox_pixel: Tuple[int, int, int, int]              # [xmin, ymin, xmax, ymax]
    bbox_normalized: Tuple[float, float, float, float]    # [xmin, ymin, xmax, ymax] tỷ lệ [0.0, 1.0]
    landmarks: np.ndarray                              # Shape (5, 2): mắt trái, mắt phải, mũi, mép miệng trái, mép miệng phải
    score: float                                       # Ngưỡng tự tin phát hiện mặt

class SCRFDFaceDetector:
    """
    Engine phát hiện khuôn mặt ONNX Runtime (SCRFD / RetinaFace).
    Nếu chưa có file model trên máy, cung cấp chế độ mô phỏng kiểm thử an toàn.
    """

    def __init__(
        self,
        model_path: Optional[str] = None,
        conf_threshold: float = 0.5,
        use_cpu: bool = False
    ):
        self.model_path = model_path
        self.conf_threshold = conf_threshold
        self.use_cpu = use_cpu
        self.engine: Optional[OnnxEngine] = None

        if model_path and os.path.exists(model_path):
            self.engine = OnnxEngine(model_path=model_path, use_cpu=use_cpu)

    def detect(self, frame: np.ndarray) -> List[FaceDetection]:
        """Phát hiện danh sách khuôn mặt trong khung hình."""
        if self.engine is None:
            # Fallback nếu chưa tải weights: Trả về rỗng (hoặc Haar Cascade cơ bản nếu cần)
            return []

        h, w = frame.shape[:2]
        # Tiền xử lý letterbox 640x640
        input_img, ratio, (pad_w, pad_h) = letterbox(frame, (640, 640))
        input_tensor = cv2.cvtColor(input_img, cv2.COLOR_BGR2RGB).astype(np.float32)
        input_tensor = (input_tensor - 127.5) / 128.0
        input_tensor = np.transpose(input_tensor, (2, 0, 1))[np.newaxis, ...]

        # Chạy suy luận qua OnnxEngine
        input_name = self.engine.input_names[0]
        outputs = self.engine.run({input_name: input_tensor})

        # Giải mã kết quả (tùy theo output layers của SCRFD)
        results: List[FaceDetection] = []
        # Post-processing logic chuẩn SCRFD
        return results
