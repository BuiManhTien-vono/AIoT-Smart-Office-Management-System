"""
REST API Endpoints cho Module Occupancy (Giám sát Chỗ ngồi) và đồng bộ hai chiều với Backend .NET 10.
"""

import json
import time
import cv2
import numpy as np
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

from shared.config import settings, SeatBox
from shared.backend_client import BackendSyncClient
from modules.occupancy.fsm import SeatStatus
from modules.occupancy.pipeline import OccupancyPipeline
from modules.occupancy.geometry import is_point_in_polygon

router = APIRouter(prefix="/api/v1/occupancy", tags=["Occupancy Monitoring"])

occupancy_pipeline = OccupancyPipeline(
    seats=settings.occupancy.default_seats,
    away_alert_sec=settings.occupancy.away_alert_seconds,
    anti_flicker_frames=settings.occupancy.anti_flicker_frames,
    prolonged_away_sec=settings.occupancy.prolonged_away_sec
)
backend_client = BackendSyncClient()


class SeatConfigurationRequest(BaseModel):
    seats: List[SeatBox]


class SimulatedOccupancyObservation(BaseModel):
    seat_code: str
    is_occupied: bool
    consecutive_absent_frames: int = 0
    away_duration_sec: float = 0.0
    detected_employee_id: Optional[str] = None
    confidence: float = 0.92


class PushStateSyncRequest(BaseModel):
    camera_code: Optional[str] = None
    frame_sequence: int = 1
    captured_at_utc: Optional[str] = None
    observations: Optional[List[SimulatedOccupancyObservation]] = None


@router.get("/seats")
def get_configured_seats():
    """Lấy danh sách các bàn làm việc đang được cấu hình trong AI Service."""
    seats_info = []
    for seat_id, state in occupancy_pipeline.seats_state.items():
        seats_info.append({
            "seat_id": state.seat_id,
            "seat_name": state.seat_name,
            "status": state.status.value,
            "normalized_box": state.normalized_box,
            "normalized_polygon": state.normalized_polygon,
            "assigned_employee_id": state.assigned_employee_id,
            "consecutive_absent_frames": state.consecutive_absent_frames,
            "away_duration_sec": round(state.away_duration_sec, 1)
        })
    return {
        "status": "success",
        "backend_api_url": backend_client.base_api_url,
        "seats": seats_info
    }


@router.get("/status")
def get_occupancy_status():
    """Lấy trạng thái tổng quan các ghế (EMPTY, PRESENT, TEMP_AWAY, PROLONGED_AWAY)."""
    return {
        "status": "success",
        "active_mode": "ASYNC_STREAM",
        "seats_count": len(occupancy_pipeline.seats_state),
        "alert_threshold_sec": settings.away_alert_seconds,
        "prolonged_away_sec": settings.prolonged_away_sec,
        "backend_api_url": backend_client.base_api_url,
        "last_sync_error": backend_client.last_sync_error
    }


@router.post("/sync-zones-from-backend")
def sync_zones_from_backend(camera_code: Optional[str] = None):
    """
    Kéo cấu hình đa giác vùng bàn chuẩn hóa [0.0, 1.0] từ Backend .NET
    (GET /api/v1/occupancy/cameras/{cameraCode}/zones) về nạp vào OccupancyPipeline.
    """
    target_cam = camera_code or settings.occupancy.default_camera_code
    try:
        seats = backend_client.fetch_camera_zones(target_cam)
        if seats:
            occupancy_pipeline.update_seats(seats)
        return {
            "status": "success",
            "camera_code": target_cam,
            "synced_seats_count": len(seats),
            "seats": [s.model_dump() if hasattr(s, "model_dump") else s.dict() for s in seats]
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/push-state-sync")
def push_state_sync_to_backend(request: PushStateSyncRequest):
    """
    Đẩy trạng thái chỗ ngồi từ AI Service sang Backend .NET (POST /api/v1/occupancy/state-sync)
    để kích hoạt máy trạng thái C#, cập nhật SignalR Live Seat Map và đồng bộ sang Module Reporting.
    """
    target_cam = request.camera_code or settings.occupancy.default_camera_code

    if request.observations:
        seat_statuses = [
            {
                "seat_id": obs.seat_code,
                "has_occupant": obs.is_occupied,
                "consecutive_absent_frames": obs.consecutive_absent_frames,
                "away_duration_sec": obs.away_duration_sec,
                "detected_employee_id": obs.detected_employee_id,
                "occupant_head": {"confidence": obs.confidence}
            }
            for obs in request.observations
        ]
    else:
        seat_statuses = [
            {
                "seat_id": st.seat_id,
                "has_occupant": st.status == SeatStatus.PRESENT,
                "consecutive_absent_frames": st.consecutive_absent_frames,
                "away_duration_sec": st.away_duration_sec,
                "detected_employee_id": st.assigned_employee_id,
                "occupant_head": st.occupant_head
            }
            for st in occupancy_pipeline.seats_state.values()
        ]

    try:
        backend_resp = backend_client.sync_occupancy_state(
            camera_code=target_cam,
            frame_sequence=request.frame_sequence,
            seat_statuses=seat_statuses,
            captured_at_utc=request.captured_at_utc
        )
        return {
            "status": "success",
            "camera_code": target_cam,
            "backend_response": backend_resp
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


_detector_instance: Optional[Any] = None


def get_head_detector():
    """Lấy hoặc khởi tạo singleton detector RT-DETR."""
    global _detector_instance
    if _detector_instance is None:
        from modules.occupancy.detector import RTDETRHeadDetector
        model_file = settings.occupancy.ensure_model_exists()
        _detector_instance = RTDETRHeadDetector(
            model_path=model_file,
            conf_threshold=settings.confidence_threshold,
            imgsz=settings.imgsz
        )
    return _detector_instance


@router.post("/detect-preview")
async def detect_preview(
    file: UploadFile = File(...),
    seats_json: Optional[str] = Form(None),
    conf_threshold: Optional[float] = Form(None)
):
    """
    Chạy thử nghiệm mô hình RT-DETR trên 1 khung hình chụp từ Canvas (Phương án 1).
    Phát hiện vị trí đầu người và đối chiếu Ray-Casting với các vùng bàn làm việc.
    """
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None:
            raise HTTPException(status_code=400, detail="Không thể giải mã tệp hình ảnh.")

        detector = get_head_detector()
        old_conf = detector.conf_threshold
        if conf_threshold is not None:
            detector.conf_threshold = conf_threshold

        t0 = time.perf_counter()
        detections = detector.predict(frame)
        latency_ms = round((time.perf_counter() - t0) * 1000, 1)

        if conf_threshold is not None:
            detector.conf_threshold = old_conf

        seats_data = []
        if seats_json:
            try:
                seats_data = json.loads(seats_json)
            except Exception:
                seats_data = []

        detected_heads = []
        occupied_seat_ids = set()

        for det in detections:
            xc, yc = det.center_normalized
            matched_seat_id = None

            for seat in seats_data:
                pts = seat.get("polygonPoints") or seat.get("polygon_points") or []
                if len(pts) >= 3:
                    poly_tuples = [(float(p["x"]), float(p["y"])) for p in pts]
                    if is_point_in_polygon((xc, yc), poly_tuples):
                        matched_seat_id = seat.get("id") or seat.get("seatCode")
                        occupied_seat_ids.add(matched_seat_id)
                        break

            detected_heads.append({
                "bbox_normalized": [float(v) for v in det.bbox_normalized],
                "center_normalized": [float(det.center_normalized[0]), float(det.center_normalized[1])],
                "confidence": round(float(det.confidence), 3),
                "matched_seat_id": matched_seat_id
            })

        return {
            "status": "success",
            "inference_time_ms": latency_ms,
            "detections_count": len(detected_heads),
            "detections": detected_heads,
            "occupied_seat_ids": list(occupied_seat_ids)
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Lỗi khi suy luận RT-DETR: {str(exc)}")
