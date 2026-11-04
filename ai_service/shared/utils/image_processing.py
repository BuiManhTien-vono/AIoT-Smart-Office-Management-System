"""
Tiện ích tiền/hậu xử lý ảnh dùng chung cho các mô hình AI.
Hỗ trợ letterbox, chuẩn hóa tensor, tính toán độ sắc nét (chống nhòe).
"""

import cv2
import numpy as np
from typing import Tuple, Optional

def direct_resize_and_normalize(
    image: np.ndarray,
    target_size: Tuple[int, int] = (960, 960)
) -> np.ndarray:
    """
    Tiền xử lý trực tiếp (Direct Resize) sang RGB, float32 [0.0, 1.0] và định dạng NCHW.
    Phù hợp cho RT-DETR-L.
    """
    resized = cv2.resize(image, target_size)
    rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    chw = np.transpose(rgb, (2, 0, 1))[np.newaxis, ...]
    return chw

def letterbox(
    image: np.ndarray,
    target_shape: Tuple[int, int] = (640, 640),
    color: Tuple[int, int, int] = (114, 114, 114)
) -> Tuple[np.ndarray, float, Tuple[int, int]]:
    """
    Resize giữ nguyên tỉ lệ khung hình (Aspect Ratio) với padding màu xám.
    Trả về: (ảnh padded, scale_ratio, (pad_w, pad_h))
    """
    shape = image.shape[:2]  # [height, width]
    target_h, target_w = target_shape

    r = min(target_w / shape[1], target_h / shape[0])
    new_unpad = (int(round(shape[1] * r)), int(round(shape[0] * r)))
    dw, dh = target_w - new_unpad[0], target_h - new_unpad[1]
    dw /= 2
    dh /= 2

    if shape[::-1] != new_unpad:
        image = cv2.resize(image, new_unpad, interpolation=cv2.INTER_LINEAR)

    top, bottom = int(round(dh - 0.1)), int(round(dh + 0.1))
    left, right = int(round(dw - 0.1)), int(round(dw + 0.1))
    image = cv2.copyMakeBorder(image, top, bottom, left, right, cv2.BORDER_CONSTANT, value=color)
    return image, r, (left, top)

def calculate_laplacian_blur(image: np.ndarray) -> float:
    """
    Đánh giá độ sắc nét của ảnh (FR-BIO-03):
    Tính phương sai của toán tử vi phân Laplace: Score_blur = Var(Laplace(I)).
    Nếu Score_blur <= 100, ảnh được xem là bị mờ nhòe.
    """
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    return float(laplacian.var())
