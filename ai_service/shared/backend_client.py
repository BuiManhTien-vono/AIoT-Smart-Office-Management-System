"""
Bộ cầu nối giao tiếp HTTP/REST giữa Python AI Service và Backend .NET 10 (Modular Monolith):
1. Kéo cấu hình đa giác vùng ảo từ Backend: GET /api/v1/occupancy/cameras/{cameraCode}/zones
2. Đẩy đồng bộ trạng thái chỗ ngồi (FSM State-Sync): POST /api/v1/occupancy/state-sync
3. Định danh khuôn mặt 1:N & Chấm công tự động:
   - POST /api/v1/biometrics/identify
   - POST /api/v1/attendance/check
4. Báo cáo sự cố an ninh ngoài giờ / Giả mạo sinh trắc học:
   - POST /api/v1/security/incidents
"""

import json
import time
import uuid
import threading
import urllib.request
import urllib.error
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

from .config import settings, SeatBox


class BackendSyncClient:
    """
    Client giao tiếp bất đồng bộ & đồng bộ với SmartOffice.WebApi (.NET 10).
    Sử dụng urllib chuẩn của Python để không phụ thuộc cứng vào thư viện ngoài,
    kèm cơ chế gửi ngầm (Background Worker) không làm nghẽn luồng Video 30 FPS.
    """

    def __init__(
        self,
        base_api_url: Optional[str] = None,
        timeout_sec: float = 3.0,
        sync_interval_sec: Optional[float] = None
    ):
        raw_url = base_api_url or settings.backend_api_url
        self.base_api_url = raw_url.rstrip("/")
        self.timeout_sec = timeout_sec
        self.sync_interval_sec = (
            sync_interval_sec if sync_interval_sec is not None else settings.occupancy.state_sync_interval_sec
        )

        self._lock = threading.Lock()
        self._last_sync_timestamp = 0.0
        self._is_syncing = False
        self.last_sync_response: Optional[Dict[str, Any]] = None
        self.last_sync_error: Optional[str] = None

    def _request_json(
        self,
        method: str,
        relative_path: str,
        payload: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        url = f"{self.base_api_url}/{relative_path.lstrip('/')}"
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": "SmartOffice-AIService/1.0"
        }

        data = None
        if payload is not None:
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")

        req = urllib.request.Request(url=url, data=data, headers=headers, method=method.upper())
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_sec) as resp:
                raw_body = resp.read().decode("utf-8")
                if not raw_body:
                    return {"success": True, "status_code": resp.status}
                parsed = json.loads(raw_body)
                if isinstance(parsed, dict):
                    return parsed
                return {"data": parsed}
        except urllib.error.HTTPError as http_err:
            err_body = ""
            try:
                err_body = http_err.read().decode("utf-8")
            except Exception:
                pass
            raise RuntimeError(f"HTTP {http_err.code} từ Backend ({url}): {err_body or http_err.reason}")
        except urllib.error.URLError as url_err:
            raise RuntimeError(f"Không thể kết nối tới Backend ({url}): {url_err.reason}")

    # =========================================================================
    # 1. MODULE OCCUPANCY: Kéo cấu hình đa giác vùng bàn & Đẩy State-Sync
    # =========================================================================

    def fetch_camera_zones(self, camera_code: Optional[str] = None) -> List[SeatBox]:
        """
        Gọi GET /api/v1/occupancy/cameras/{cameraCode}/zones từ Backend .NET
        và chuyển đổi thành danh sách SeatBox chuẩn hóa [0.0, 1.0] cho OccupancyPipeline.
        """
        cam_code = (camera_code or settings.occupancy.default_camera_code).strip().upper()
        resp = self._request_json("GET", f"occupancy/cameras/{cam_code}/zones")
        zones = resp.get("zones") or []

        seats: List[SeatBox] = []
        for z in zones:
            seat_code = z.get("seatCode") or z.get("seat_code")
            seat_name = z.get("seatName") or z.get("seat_name") or seat_code
            assigned_emp_id = z.get("assignedEmployeeId")
            poly_points = z.get("polygonPoints") or []

            normalized_poly = []
            xs, ys = [], []
            for pt in poly_points:
                px = float(pt.get("x", 0.0))
                py = float(pt.get("y", 0.0))
                normalized_poly.append((px, py))
                xs.append(px)
                ys.append(py)

            if xs and ys:
                norm_box = [min(xs), min(ys), max(xs), max(ys)]
            else:
                norm_box = [0.1, 0.1, 0.5, 0.5]

            seats.append(SeatBox(
                seat_id=seat_code,
                seat_name=seat_name,
                normalized_box=norm_box,
                polygon_points=normalized_poly if len(normalized_poly) >= 3 else None,
                assigned_employee_id=str(assigned_emp_id) if assigned_emp_id else None
            ))

        return seats

    @staticmethod
    def build_state_sync_payload(
        camera_code: str,
        frame_sequence: int,
        seat_statuses: List[Dict[str, Any]],
        captured_at_utc: Optional[str] = None,
        prolonged_absence_threshold_seconds: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Chuyển đổi kết quả từ OccupancyPipeline.process_frame() sang đúng hợp đồng JSON
        của POST /api/v1/occupancy/state-sync trên Backend .NET 10.
        """
        timestamp_str = captured_at_utc or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        observations = []

        for s in seat_statuses:
            head = s.get("occupant_head")
            confidence = 0.0
            if head is not None and hasattr(head, "confidence"):
                confidence = float(head.confidence)
            elif isinstance(head, dict) and "confidence" in head:
                confidence = float(head["confidence"])
            elif s.get("has_occupant"):
                confidence = 0.90

            observations.append({
                "seatCode": s["seat_id"],
                "isOccupied": bool(s.get("has_occupant", False)),
                "unoccupiedContinuousFrames": int(s.get("consecutive_absent_frames", 0)),
                "unoccupiedContinuousSeconds": int(round(float(s.get("away_duration_sec", 0.0)))),
                "detectedEmployeeId": s.get("detected_employee_id"),
                "detectionConfidence": round(confidence, 4)
            })

        payload: Dict[str, Any] = {
            "cameraCode": camera_code.strip().upper(),
            "capturedAtUtc": timestamp_str,
            "frameSequence": int(frame_sequence),
            "observations": observations
        }
        if prolonged_absence_threshold_seconds is not None:
            payload["prolongedAbsenceThresholdSeconds"] = int(prolonged_absence_threshold_seconds)
        return payload

    def sync_occupancy_state(
        self,
        camera_code: str,
        frame_sequence: int,
        seat_statuses: List[Dict[str, Any]],
        captured_at_utc: Optional[str] = None,
        prolonged_absence_threshold_seconds: Optional[int] = None
    ) -> Dict[str, Any]:
        """Gửi đồng bộ trạng thái chỗ ngồi sang POST /api/v1/occupancy/state-sync."""
        payload = self.build_state_sync_payload(
            camera_code=camera_code,
            frame_sequence=frame_sequence,
            seat_statuses=seat_statuses,
            captured_at_utc=captured_at_utc,
            prolonged_absence_threshold_seconds=prolonged_absence_threshold_seconds
        )
        result = self._request_json("POST", "occupancy/state-sync", payload)
        with self._lock:
            self.last_sync_response = result
            self.last_sync_error = None
        return result

    def submit_occupancy_state_async(
        self,
        camera_code: str,
        frame_sequence: int,
        seat_statuses: List[Dict[str, Any]],
        prolonged_absence_threshold_seconds: Optional[int] = None
    ) -> bool:
        """
        Đẩy dữ liệu state-sync sang Backend trong một luồng ngầm (non-blocking)
        theo chu kỳ `sync_interval_sec` để giữ nguyên tốc độ 30 FPS cho luồng Video.
        """
        now = time.time()
        with self._lock:
            if self._is_syncing or (now - self._last_sync_timestamp < self.sync_interval_sec):
                return False
            self._is_syncing = True
            self._last_sync_timestamp = now

        snapshot_statuses = list(seat_statuses)

        def _worker():
            try:
                self.sync_occupancy_state(
                    camera_code=camera_code,
                    frame_sequence=frame_sequence,
                    seat_statuses=snapshot_statuses,
                    prolonged_absence_threshold_seconds=prolonged_absence_threshold_seconds
                )
            except Exception as exc:
                with self._lock:
                    self.last_sync_error = str(exc)
            finally:
                with self._lock:
                    self._is_syncing = False

        threading.Thread(target=_worker, daemon=True).start()
        return True

    # =========================================================================
    # 2. MODULE BIOMETRICS & ATTENDANCE: Nhận diện 1:N & Chấm công tự động
    # =========================================================================

    def identify_employee_on_backend(
        self,
        embedding: List[float],
        threshold: float = 0.65
    ) -> Dict[str, Any]:
        """Gọi POST /api/v1/biometrics/identify trên Backend .NET."""
        vec = [float(x) for x in embedding]
        payload = {
            "queryVector": vec,
            "embedding": vec,
            "threshold": float(threshold)
        }
        return self._request_json("POST", "biometrics/identify", payload)

    @staticmethod
    def _resolve_camera_guid(camera_id: Optional[str]) -> str:
        if camera_id:
            try:
                return str(uuid.UUID(str(camera_id).strip()))
            except ValueError:
                pass
        return settings.face.default_gate_camera_id

    def check_in_out_on_backend(
        self,
        employee_id: str,
        match_confidence: float,
        gate_camera_id: Optional[str] = None,
        snapshot_object_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """Gọi POST /api/v1/attendance/check trên Backend .NET."""
        payload = {
            "employeeId": employee_id,
            "gateCameraId": self._resolve_camera_guid(gate_camera_id),
            "matchConfidence": float(match_confidence),
            "snapshotObjectKey": snapshot_object_key
        }
        return self._request_json("POST", "attendance/check", payload)

    # =========================================================================
    # 3. MODULE SECURITY: Báo cáo sự cố trực đêm & Giả mạo sinh trắc học
    # =========================================================================

    def report_security_incident(
        self,
        camera_id: Optional[str] = None,
        department_id: Optional[str] = None,
        detected_employee_id: Optional[str] = None,
        is_spoofing_attempt: bool = False,
        snapshot_object_key: Optional[str] = None,
        video_clip_object_key: Optional[str] = None,
        detected_at_utc: Optional[str] = None
    ) -> Dict[str, Any]:
        """Gọi POST /api/v1/security/incidents trên Backend .NET."""
        payload = {
            "cameraId": self._resolve_camera_guid(camera_id),
            "departmentId": department_id,
            "detectedEmployeeId": detected_employee_id,
            "isSpoofingAttempt": bool(is_spoofing_attempt),
            "snapshotObjectKey": snapshot_object_key,
            "videoClipObjectKey": video_clip_object_key,
            "detectedAtUtc": detected_at_utc or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        }
        return self._request_json("POST", "security/incidents", payload)

