"""
Máy trạng thái hữu hạn (FSM) giám sát hiện diện chỗ ngồi văn phòng.
Quản lý 4 trạng thái: EMPTY, PRESENT, TEMP_AWAY, PROLONGED_AWAY.
"""

from enum import Enum
from typing import Optional, List, Dict, Tuple, Any
from dataclasses import dataclass
import numpy as np

class SeatStatus(str, Enum):
    EMPTY = "EMPTY"                     # Xám: Bàn trống / Chưa có ai ngồi
    PRESENT = "PRESENT"                 # Xanh lá: Có mặt tại bàn
    TEMP_AWAY = "TEMP_AWAY"             # Vàng cam: Vắng mặt tạm thời (< threshold)
    PROLONGED_AWAY = "PROLONGED_AWAY"   # Đỏ: Vắng mặt kéo dài / Cảnh báo rời chỗ

STATUS_COLORS_BGR = {
    SeatStatus.EMPTY: (180, 180, 180),         # Xám
    SeatStatus.PRESENT: (0, 255, 0),           # Xanh lá cây
    SeatStatus.TEMP_AWAY: (0, 215, 255),       # Vàng cam
    SeatStatus.PROLONGED_AWAY: (0, 0, 255)     # Đỏ cảnh báo
}

@dataclass
class SeatState:
    seat_id: str
    seat_name: str
    polygon_pixel: Optional[np.ndarray] = None                 # Đa giác pixel [N, 2] nếu vẽ bằng chuột
    normalized_polygon: Optional[List[Tuple[float, float]]] = None  # Đa giác chuẩn hóa [(x, y), ...] từ Backend .NET
    normalized_box: Optional[List[float]] = None               # [xmin, ymin, xmax, ymax] tỷ lệ [0.0, 1.0]
    assigned_employee_id: Optional[str] = None                 # Nhân viên cố định của bàn (từ Backend)
    status: SeatStatus = SeatStatus.EMPTY
    consecutive_absent_frames: int = 0
    consecutive_present_frames: int = 0
    away_start_time: Optional[float] = None
    away_duration_sec: float = 0.0
    occupant_head: Optional[Any] = None
    is_alert: bool = False
