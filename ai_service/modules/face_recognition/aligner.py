"""
Căn chỉnh khuôn mặt (Face Alignment) dựa trên 5 điểm mốc giải phẫu.
Biến đổi Affine đưa khuôn mặt về tư thế thẳng chuẩn kích thước 112x112 cho ArcFace.
"""

import cv2
import numpy as np

# Tọa độ 5 điểm mốc chuẩn của ArcFace trong khung hình 112x112
# (Mắt trái, Mắt phải, Đỉnh mũi, Khóe miệng trái, Khóe miệng phải)
ARCFACE_REFERENCE_5PTS = np.array([
    [38.2946, 51.6963],
    [73.5318, 51.5014],
    [56.0252, 71.7366],
    [41.5493, 92.3655],
    [70.7299, 92.2041]
], dtype=np.float32)

class FaceAligner:
    """Thực hiện căn chỉnh xoay mặt theo 5 điểm mốc giải phẫu."""

    @staticmethod
    def align(image: np.ndarray, landmarks: np.ndarray, output_size: int = 112) -> np.ndarray:
        """
        Căn chỉnh khuôn mặt sang kích thước chuẩn 112x112 bằng ma trận biến đổi Affine.
        - image: Ảnh gốc chứa khuôn mặt.
        - landmarks: Mảng numpy shape (5, 2) tọa độ 5 điểm mốc.
        - output_size: Kích thước đầu ra (112 cho ArcFace).
        """
        src = landmarks.astype(np.float32)
        dst = ARCFACE_REFERENCE_5PTS

        if output_size != 112:
            scale = output_size / 112.0
            dst = dst * scale

        # Ước lượng ma trận biến đổi Affine Similarity (xoay, tịnh tiến, tỉ lệ)
        matrix, _ = cv2.estimateAffinePartial2D(src, dst)
        if matrix is None:
            # Fallback nếu landmarks bị suy biến: Warp affine thông thường
            matrix = cv2.getAffineTransform(src[:3], dst[:3])

        aligned = cv2.warpAffine(
            image,
            matrix,
            (output_size, output_size),
            borderValue=0.0
        )
        return aligned
