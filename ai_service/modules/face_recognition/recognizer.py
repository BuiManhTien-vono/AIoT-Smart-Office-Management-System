"""
Trích xuất vector đặc trưng khuôn mặt (ArcFace Feature Extraction - 512D).
Chuẩn hóa L2 vector đặc trưng và so khớp độ tương đồng Cosine (FR-BIO-04, FR-BIO-05).
Tự động tải mô hình từ GitHub Release nếu máy chưa có file trọng số.
"""

import os
import cv2
import numpy as np
from typing import List, Tuple, Optional

from shared.config import settings
from shared.engines.onnx_engine import OnnxEngine

def compute_cosine_similarity(vec1: np.ndarray, vec2: np.ndarray) -> float:
    """
    Tính độ tương đồng Cosine giữa 2 vector đặc trưng:
    Similarity = (v1 . v2) / (||v1|| * ||v2||)
    Nếu 2 vector đã được chuẩn hóa L2, Similarity = v1 . v2
    """
    norm1 = np.linalg.norm(vec1)
    norm2 = np.linalg.norm(vec2)
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return float(np.dot(vec1, vec2) / (norm1 * norm2))

class ArcFaceRecognizer:
    """
    Trích xuất vector 512 chiều từ ảnh mặt 112x112 đã căn chỉnh.
    Tự động chuẩn hóa L2: ||v||_2 = 1.
    """

    def __init__(
        self,
        model_path: Optional[str] = None,
        use_cpu: bool = False
    ):
        target_path = model_path
        if not target_path or not os.path.exists(target_path):
            try:
                target_path = settings.face.ensure_recognizer_exists()
            except Exception as e:
                print(f"[ArcFaceRecognizer] Warning: Không thể nạp recognizer: {e}")
                target_path = str(settings.face.recognizer_path)

        self.model_path = target_path if os.path.exists(target_path) else None
        self.use_cpu = use_cpu
        self.engine: Optional[OnnxEngine] = None

        if self.model_path and os.path.exists(self.model_path):
            self.engine = OnnxEngine(model_path=self.model_path, use_cpu=use_cpu)

    def extract_features(self, aligned_face: np.ndarray) -> np.ndarray:
        """
        Trích xuất vector 512 chiều từ ảnh khuôn mặt 112x112.
        Nếu chưa nạp model thực tế, tạo một vector giả lập ngẫu nhiên phục vụ kiểm thử.
        """
        if self.engine is None:
            dummy = np.random.randn(512).astype(np.float32)
            return dummy / np.linalg.norm(dummy)

        # Tiền xử lý ArcFace chuẩn: RGB, float32, trừ 127.5 chia 128.0
        face = cv2.resize(aligned_face, (112, 112))
        face = cv2.cvtColor(face, cv2.COLOR_BGR2RGB).astype(np.float32)
        face = (face - 127.5) / 128.0
        face = np.transpose(face, (2, 0, 1))[np.newaxis, ...]  # (1, 3, 112, 112)

        input_name = self.engine.input_names[0]
        outputs = self.engine.run({input_name: face})
        embedding = outputs[0][0]  # (512,)

        # Chuẩn hóa L2
        norm = np.linalg.norm(embedding)
        if norm > 0:
            embedding = embedding / norm

        return embedding.astype(np.float32)
