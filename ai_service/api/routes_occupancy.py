"""
REST API Endpoints cho Module Occupancy (Giám sát Chỗ ngồi) và đồng bộ hai chiều với Backend .NET 10.
"""

import json
import time
import re
import urllib.request
import cv2
import numpy as np
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

from shared.config import settings, SeatBox
from shared.backend_client import BackendSyncClient
from modules.occupancy.fsm import SeatStatus, SeatState
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
    file: Optional[UploadFile] = File(None),
    stream_url: Optional[str] = Form(None),
    seats_json: Optional[str] = Form(None),
    conf_threshold: Optional[float] = Form(None),
    away_alert_sec: Optional[float] = Form(None),
    reset_fsm: Optional[bool] = Form(False),
    camera_code: Optional[str] = Form(None),
    sync_backend: Optional[bool] = Form(True)
):
    """
    Chạy thử nghiệm mô hình RT-DETR trên 1 khung hình chụp từ Canvas (Phương án 1)
    hoặc kéo trực tiếp từ luồng stream_url của IP Camera/Điện thoại để vượt qua rào cản CORS trình duyệt.
    """
    try:
        frame = None

        # 1. Giải mã từ tệp tải lên nếu có
        if file is not None:
            try:
                contents = await file.read()
                if len(contents) > 0:
                    nparr = np.frombuffer(contents, np.uint8)
                    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            except Exception:
                frame = None

        # 2. Nếu không có file (hoặc canvas bị CORS tainted ở client), kéo khung hình trực tiếp từ stream_url
        if frame is None and stream_url:
            s_url = stream_url.strip()
            shot_candidates = []
            if ":8080" in s_url:
                shot_candidates.append(re.sub(r"/video.*$", "/shot.jpg", s_url))
                shot_candidates.append(s_url.rstrip("/") + "/shot.jpg")
            elif ":4747" in s_url:
                shot_candidates.append(re.sub(r"/video.*$", "/cam/1/frame.jpg", s_url))
                shot_candidates.append(s_url.rstrip("/") + "/cam/1/frame.jpg")

            for cand in shot_candidates:
                try:
                    req = urllib.request.Request(cand, headers={"User-Agent": "SmartOffice-AI/1.0"})
                    with urllib.request.urlopen(req, timeout=2.0) as resp:
                        data = resp.read()
                        if len(data) > 0:
                            f = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
                            if f is not None:
                                frame = f
                                break
                except Exception:
                    continue

            # Fallback sang cv2.VideoCapture (MJPEG stream hoặc RTSP)
            if frame is None:
                try:
                    cap = cv2.VideoCapture(s_url)
                    if cap.isOpened():
                        ret, f = cap.read()
                        if ret and f is not None:
                            frame = f
                    cap.release()
                except Exception as exc:
                    print(f"[!] Lỗi đọc frame từ stream_url: {exc}")

        if frame is None:
            raise HTTPException(
                status_code=400,
                detail="Không thể lấy khung hình để suy luận AI. Vui lòng kiểm tra kết nối IP camera hoặc tải file ảnh mẫu."
            )

        detector = get_head_detector()
        old_conf = detector.conf_threshold
        if conf_threshold is not None:
            detector.conf_threshold = conf_threshold

        t0 = time.perf_counter()
        detections = detector.predict(frame)
        latency_ms = round((time.perf_counter() - t0) * 1000, 1)

        if conf_threshold is not None:
            detector.conf_threshold = old_conf

        if away_alert_sec is not None and away_alert_sec > 0:
            occupancy_pipeline.away_alert_sec = away_alert_sec

        if reset_fsm:
            for st in occupancy_pipeline.seats_state.values():
                st.status = SeatStatus.EMPTY
                st.consecutive_absent_frames = 0
                st.consecutive_present_frames = 0
                st.away_start_time = None
                st.away_duration_sec = 0.0
                st.occupant_head = None
                st.is_alert = False

        seats_data = []
        if seats_json:
            try:
                seats_data = json.loads(seats_json)
            except Exception:
                seats_data = []

        # Đồng bộ cấu hình ghế động vào occupancy_pipeline
        current_seat_ids = set()
        for seat in seats_data:
            s_id = str(seat.get("seatCode") or seat.get("id") or "")
            if not s_id:
                continue
            current_seat_ids.add(s_id)
            s_name = str(seat.get("seatName") or seat.get("seatCode") or s_id)
            pts = seat.get("polygonPoints") or seat.get("polygon_points") or []
            poly_tuples = [(float(p["x"]), float(p["y"])) for p in pts] if len(pts) >= 3 else None
            emp_id = seat.get("assignedEmployeeId")

            if s_id not in occupancy_pipeline.seats_state:
                occupancy_pipeline.seats_state[s_id] = SeatState(
                    seat_id=s_id,
                    seat_name=s_name,
                    normalized_polygon=poly_tuples,
                    assigned_employee_id=emp_id,
                    status=SeatStatus.EMPTY
                )
            else:
                st = occupancy_pipeline.seats_state[s_id]
                st.normalized_polygon = poly_tuples
                st.seat_name = s_name
                if emp_id:
                    st.assigned_employee_id = emp_id

        # Loại bỏ các ghế đã bị xóa nếu seats_data được cung cấp
        if seats_data:
            to_remove = [sid for sid in occupancy_pipeline.seats_state if sid not in current_seat_ids]
            for sid in to_remove:
                occupancy_pipeline.seats_state.pop(sid, None)

        # Chạy máy trạng thái FSM (EMPTY, PRESENT, TEMP_AWAY, PROLONGED_AWAY)
        pipeline_results = occupancy_pipeline.process_frame(
            detections,
            frame_shape=(frame.shape[0], frame.shape[1])
        )

        detected_heads = []
        occupied_seat_ids = set()
        seat_states = []

        for res in pipeline_results:
            seat_states.append({
                "seat_id": res["seat_id"],
                "seat_code": res["seat_name"],
                "status": res["status"],
                "away_duration_sec": res["away_duration_sec"],
                "has_occupant": res["has_occupant"],
                "is_alert": res["is_alert"]
            })
            if res["has_occupant"]:
                occupied_seat_ids.add(res["seat_id"])

        for det in detections:
            matched_id = None
            for res in pipeline_results:
                if res["occupant_head"] == det:
                    matched_id = res["seat_id"]
                    break

            detected_heads.append({
                "bbox_normalized": [float(v) for v in det.bbox_normalized],
                "center_normalized": [float(det.center_normalized[0]), float(det.center_normalized[1])],
                "confidence": round(float(det.confidence), 3),
                "matched_seat_id": matched_id
            })

        # Tự động đẩy đồng bộ trạng thái FSM sang Backend .NET để kích hoạt SignalR thời gian thực
        if sync_backend and backend_client and len(pipeline_results) > 0:
            target_cam = (camera_code or settings.occupancy.default_camera_code).strip().upper()
            prolonged_thresh = int(occupancy_pipeline.away_alert_sec) if occupancy_pipeline.away_alert_sec else None
            try:
                backend_client.submit_occupancy_state_async(
                    camera_code=target_cam,
                    frame_sequence=int(time.time() * 1000) % 1_000_000,
                    seat_statuses=pipeline_results,
                    prolonged_absence_threshold_seconds=prolonged_thresh
                )
            except Exception as exc:
                print(f"[!] Lỗi đồng bộ state-sync sang backend: {exc}")

        return {
            "status": "success",
            "inference_time_ms": latency_ms,
            "detections_count": len(detected_heads),
            "detections": detected_heads,
            "occupied_seat_ids": list(occupied_seat_ids),
            "seat_states": seat_states
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Lỗi khi suy luận RT-DETR: {str(exc)}")



@router.post("/reset-fsm")
async def reset_fsm_endpoint():
    """Reset toàn bộ bộ nhớ FSM của các bàn về trạng thái EMPTY trong RAM của AI Service."""
    for st in occupancy_pipeline.seats_state.values():
        st.status = SeatStatus.EMPTY
        st.consecutive_absent_frames = 0
        st.consecutive_present_frames = 0
        st.away_start_time = None
        st.away_duration_sec = 0.0
        st.occupant_head = None
        st.is_alert = False
    return {"status": "success", "message": "Đã reset bộ nhớ FSM các bàn về EMPTY."}
