"""
Pipeline Giám sát Hiện diện Chỗ ngồi (Occupancy Pipeline).
Kết hợp RT-DETR-L Head Detection, Ray-Casting đa giác bàn và máy trạng thái FSM.
"""

import cv2
import time
import numpy as np
from typing import List, Dict, Tuple, Optional

from shared.config import SeatBox, settings
from .geometry import is_point_in_box
from .fsm import SeatStatus, SeatState, STATUS_COLORS_BGR
from .detector import HeadDetection

class OccupancyPipeline:
    def __init__(
        self,
        seats: Optional[List[SeatBox]] = None,
        custom_polygons: Optional[List[np.ndarray]] = None,
        away_alert_sec: float = 10.0,
        anti_flicker_frames: int = 5,
        prolonged_away_sec: Optional[float] = None
    ):
        self.away_alert_sec = prolonged_away_sec if prolonged_away_sec is not None else away_alert_sec
        self.anti_flicker_frames = anti_flicker_frames
        self.seats_state: Dict[str, SeatState] = {}

        if custom_polygons:
            for idx, poly in enumerate(custom_polygons):
                s_id = f"SEAT-{idx + 1:02d}"
                self.seats_state[s_id] = SeatState(
                    seat_id=s_id,
                    seat_name=f"Bàn {idx + 1}",
                    polygon_pixel=poly
                )
        else:
            configured_seats = seats or settings.default_seats
            for seat in configured_seats:
                self.seats_state[seat.seat_id] = SeatState(
                    seat_id=seat.seat_id,
                    seat_name=seat.seat_name,
                    normalized_box=seat.normalized_box
                )

    def process_frame(
        self,
        detections: List[HeadDetection],
        frame_shape: Optional[Tuple[int, int]] = None,
        current_time: Optional[float] = None
    ) -> List[Dict]:
        now = current_time or time.time()
        results = []

        for seat_id, state in self.seats_state.items():
            matched_head: Optional[HeadDetection] = None

            # 1. Kiểm tra tâm đầu bằng cv2.pointPolygonTest hoặc is_point_in_box
            for det in detections:
                cx_px, cy_px = det.center_pixel

                if state.polygon_pixel is not None:
                    if cv2.pointPolygonTest(state.polygon_pixel, (float(cx_px), float(cy_px)), False) >= 0:
                        matched_head = det
                        break
                elif state.normalized_box is not None:
                    if is_point_in_box(det.center_normalized, state.normalized_box):
                        matched_head = det
                        break

            # 2. Cập nhật máy trạng thái FSM
            if matched_head is not None:
                state.consecutive_present_frames += 1
                state.consecutive_absent_frames = 0
                state.away_start_time = None
                state.away_duration_sec = 0.0
                state.status = SeatStatus.PRESENT
                state.occupant_head = matched_head
                state.is_alert = False
            else:
                state.consecutive_absent_frames += 1
                state.occupant_head = None

                if state.status == SeatStatus.PRESENT or state.away_start_time is not None:
                    if state.away_start_time is None:
                        state.away_start_time = now

                    state.away_duration_sec = now - state.away_start_time

                    if state.away_duration_sec >= self.away_alert_sec:
                        state.status = SeatStatus.PROLONGED_AWAY
                        state.is_alert = True
                    else:
                        state.status = SeatStatus.TEMP_AWAY
                        state.is_alert = False
                else:
                    state.status = SeatStatus.EMPTY
                    state.is_alert = False

            results.append({
                "seat_id": state.seat_id,
                "seat_name": state.seat_name,
                "status": state.status.value,
                "color_bgr": STATUS_COLORS_BGR[state.status],
                "polygon_pixel": state.polygon_pixel,
                "normalized_box": state.normalized_box,
                "has_occupant": (state.status == SeatStatus.PRESENT),
                "away_duration_sec": round(state.away_duration_sec, 1),
                "is_alert": state.is_alert,
                "occupant_head": state.occupant_head
            })

        return results
