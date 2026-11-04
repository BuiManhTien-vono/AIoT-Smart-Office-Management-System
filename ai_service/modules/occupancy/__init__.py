"""
Module Giám sát Chỗ ngồi (Occupancy Monitoring Module).
"""

from .fsm import SeatStatus, SeatState, STATUS_COLORS_BGR
from .geometry import (
    is_point_in_box,
    is_point_in_polygon,
    is_point_in_polygon_cv2,
    denormalize_box,
    denormalize_point
)
from .detector import RTDETRHeadDetector, HeadDetection, AsyncHeadDetector
from .pipeline import OccupancyPipeline
from .video_stream import VideoStreamProcessor, select_roi_polygons
