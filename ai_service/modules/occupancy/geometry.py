"""
Hình học tính toán cho Giám sát Chỗ ngồi (Occupancy):
- Point-in-Box và Point-in-Polygon (Ray-Casting & cv2.pointPolygonTest).
- Chuyển đổi tọa độ chuẩn hóa [0.0, 1.0] sang pixel thực tế.
"""

import cv2
import numpy as np
from typing import List, Tuple, Union

Point2D = Tuple[float, float]
Box2D = Union[List[float], Tuple[float, float, float, float]]  # [xmin, ymin, xmax, ymax]
Polygon2D = Union[List[Point2D], np.ndarray]

def is_point_in_box(point: Point2D, box: Box2D) -> bool:
    """
    Kiểm tra điểm (x, y) có nằm trong hình hộp chữ nhật [xmin, ymin, xmax, ymax] hay không.
    Hỗ trợ cả tọa độ pixel và tọa độ chuẩn hóa [0.0, 1.0].
    """
    x, y = point
    xmin, ymin, xmax, ymax = box
    return (xmin <= x <= xmax) and (ymin <= y <= ymax)

def is_point_in_polygon_cv2(point: Point2D, polygon: Polygon2D) -> bool:
    """
    Kiểm tra điểm (px, py) có nằm trong đa giác polygon hay không bằng OpenCV (C++ optimized).
    """
    if not isinstance(polygon, np.ndarray):
        poly_arr = np.array(polygon, dtype=np.int32)
    else:
        poly_arr = polygon
    return cv2.pointPolygonTest(poly_arr, (float(point[0]), float(point[1])), False) >= 0

def is_point_in_polygon(point: Point2D, polygon: Polygon2D) -> bool:
    """
    Thuật toán Ray-Casting kiểm tra một điểm (x, y) có nằm trong đa giác 2D khép kín hay không.
    """
    if isinstance(polygon, np.ndarray):
        return is_point_in_polygon_cv2(point, polygon)

    x, y = point
    n = len(polygon)
    if n < 3:
        return False

    inside = False
    p1x, p1y = polygon[0]
    for i in range(1, n + 1):
        p2x, p2y = polygon[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y

    return inside

def denormalize_box(normalized_box: Box2D, frame_width: int, frame_height: int) -> Tuple[int, int, int, int]:
    """Chuyển đổi hộp từ tỷ lệ chuẩn hóa [0.0, 1.0] sang tọa độ pixel thực tế."""
    xmin, ymin, xmax, ymax = normalized_box
    return (
        int(round(xmin * frame_width)),
        int(round(ymin * frame_height)),
        int(round(xmax * frame_width)),
        int(round(ymax * frame_height))
    )

def denormalize_point(normalized_point: Point2D, frame_width: int, frame_height: int) -> Tuple[int, int]:
    """Chuyển đổi điểm từ tỷ lệ chuẩn hóa [0.0, 1.0] sang tọa độ pixel thực tế."""
    x, y = normalized_point
    return (int(round(x * frame_width)), int(round(y * frame_height)))
