"""
Universal Video Stream Handler: Xử lý luồng Video đa năng cho Occupancy.
- Chạy ngầm đa luồng AsyncHeadDetector (30 FPS mượt mà).
- Công cụ vẽ bàn làm việc bằng chuột select_roi_polygons.
- Dashboard trực quan thời gian thực với Alpha Blending.
"""

import cv2
import time
import threading
import numpy as np
from typing import Union, Optional, List, Tuple, Callable

from shared.utils.ring_buffer import CircularRingBuffer
from .geometry import denormalize_box
from .detector import RTDETRHeadDetector, HeadDetection, AsyncHeadDetector
from .pipeline import OccupancyPipeline

def select_roi_polygons(frame: np.ndarray) -> List[np.ndarray]:
    """
    Giao diện vẽ vùng bàn làm việc trực quan bằng chuột:
    - Chuột trái: Thêm điểm
    - Chuột phải / 'n': Chốt vùng bàn hiện tại
    - 'u': Undo điểm nhầm
    - 'r': Reset xóa vẽ lại
    - SPACE / ENTER: Bắt đầu giám sát
    - ESC: Bỏ qua (dùng cấu hình mặc định)
    """
    completed_polygons = []
    current_points = []
    mouse_pos = None
    window_name = "CHON VUNG BAN LAM VIEC (CHUOT TRAI: VE | CHUOT PHAI: CHOT)"
    clone = frame.copy()

    def mouse_callback(event, x, y, flags, param):
        nonlocal current_points, completed_polygons, mouse_pos
        mouse_pos = (x, y)
        if event == cv2.EVENT_LBUTTONDOWN:
            current_points.append((x, y))
        elif event == cv2.EVENT_RBUTTONDOWN:
            if len(current_points) >= 3:
                completed_polygons.append(np.array(current_points, dtype=np.int32))
                current_points = []
            elif len(current_points) > 0:
                print(f"[CẢNH BÁO] Cần tối thiểu 3 điểm để chốt vùng bàn!")

    cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(window_name, 1280, 720)
    cv2.setMouseCallback(window_name, mouse_callback)

    print("\n" + "=" * 65)
    print("👉 HƯỚNG DẪN CHỌN VÙNG GIÁM SÁT BÀN LÀM VIỆC:")
    print("   - Chuột trái : Click thêm điểm góc bàn.")
    print("   - Chuột phải / 'n': Chốt vùng bàn (Bàn 1 -> Bàn 2 -> ...).")
    print("   - Phím 'u'   : Undo (xóa điểm vừa click nhầm).")
    print("   - Phím 'r'   : Reset xóa toàn bộ để vẽ lại từ đầu.")
    print("   - SPACE / ENTER: Hoàn tất và BẮT ĐẦU GIÁM SÁT.")
    print("   - Phím ESC   : Bỏ qua (dùng vùng mặc định).")
    print("=" * 65)

    while True:
        display = clone.copy()

        for idx, poly in enumerate(completed_polygons):
            cv2.polylines(display, [poly], isClosed=True, color=(0, 255, 0), thickness=2)
            M = cv2.moments(poly)
            if M["m00"] != 0:
                cx = int(M["m10"] / M["m00"])
                cy = int(M["m01"] / M["m00"])
                cv2.putText(display, f"BAN {idx+1}", (cx - 30, cy),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)

        if len(current_points) > 0:
            for pt in current_points:
                cv2.circle(display, pt, 4, (0, 0, 255), -1)
            for i in range(len(current_points) - 1):
                cv2.line(display, current_points[i], current_points[i + 1], (0, 165, 255), 2)
            if mouse_pos is not None:
                cv2.line(display, current_points[-1], mouse_pos, (200, 200, 200), 1)

        cv2.imshow(window_name, display)
        key = cv2.waitKey(20) & 0xFF

        if key in [13, 32]:  # Enter hoặc Space
            break
        elif key == 27:      # ESC
            completed_polygons = []
            break
        elif key in [ord('n'), ord('N')]:
            if len(current_points) >= 3:
                completed_polygons.append(np.array(current_points, dtype=np.int32))
                current_points = []
        elif key in [ord('u'), ord('U')]:
            if current_points:
                current_points.pop()
        elif key in [ord('r'), ord('R')]:
            completed_polygons = []
            current_points = []

    cv2.destroyWindow(window_name)
    return completed_polygons


class VideoStreamProcessor:
    def __init__(
        self,
        source: Union[int, str] = 0,
        detector: Optional[RTDETRHeadDetector] = None,
        occupancy_pipeline: Optional[OccupancyPipeline] = None,
        async_mode: bool = True,
        frame_skip: int = 5,
        loop: bool = True
    ):
        self.source = int(source) if isinstance(source, str) and source.isdigit() else source
        self.detector = detector
        self.pipeline = occupancy_pipeline or OccupancyPipeline()
        self.async_mode = async_mode
        self.frame_skip = frame_skip
        self.loop = loop

        self.cap = None
        self.async_worker: Optional[AsyncHeadDetector] = None
        if self.detector and self.async_mode:
            self.async_worker = AsyncHeadDetector(self.detector)

        self.running = False

    def _open_capture(self) -> cv2.VideoCapture:
        cap = cv2.VideoCapture(self.source)
        if not cap.isOpened():
            raise RuntimeError(f"Không thể mở nguồn video: {self.source}")
        return cap

    def run(self, show_window: bool = True, select_roi: bool = False, on_frame_callback: Optional[Callable] = None):
        self.cap = self._open_capture()
        self.running = True

        ret, initial_frame = self.cap.read()
        if not ret or initial_frame is None:
            print("[!] Lỗi: Không đọc được frame đầu tiên từ video!")
            return

        if select_roi and show_window:
            user_polygons = select_roi_polygons(initial_frame)
            if user_polygons:
                self.pipeline = OccupancyPipeline(custom_polygons=user_polygons)
                print(f"[+] Đã cấu hình {len(user_polygons)} vùng bàn giám sát tùy chỉnh.")

        window_name = "AIoT SMART OFFICE - OCCUPANCY MONITOR"
        if show_window:
            cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
            cv2.resizeWindow(window_name, 1280, 720)

        frame_count = 0
        fps_start_time = time.time()
        fps_counter = 0
        current_fps = 0.0

        detections: List[HeadDetection] = []
        latency_ms = 0.0

        try:
            while self.running:
                ret, frame = self.cap.read()
                if not ret:
                    if self.loop and isinstance(self.source, str):
                        self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        continue
                    else:
                        break

                frame_count += 1
                fps_counter += 1
                now = time.time()
                if now - fps_start_time >= 1.0:
                    current_fps = fps_counter / (now - fps_start_time)
                    fps_counter = 0
                    fps_start_time = now

                # 1. Phát hiện đầu người
                if self.detector:
                    if self.async_worker:
                        self.async_worker.submit(frame)
                        detections, latency_ms, _ = self.async_worker.get_results()
                    else:
                        if frame_count % self.frame_skip == 0:
                            t0 = time.perf_counter()
                            detections = self.detector.predict(frame)
                            latency_ms = (time.perf_counter() - t0) * 1000

                # 2. Xử lý FSM trạng thái chỗ ngồi
                seat_statuses = self.pipeline.process_frame(detections, frame_shape=frame.shape[:2], current_time=now)

                # 3. Vẽ Dashboard trực quan
                if show_window:
                    annotated = self._render_ui(frame, detections, seat_statuses, current_fps, latency_ms)
                    cv2.imshow(window_name, annotated)
                    key = cv2.waitKey(1) & 0xFF
                    if key in [ord('q'), ord('Q'), 27]:
                        break

                if on_frame_callback:
                    on_frame_callback(frame, seat_statuses)

        finally:
            self.stop()
            if show_window:
                cv2.destroyAllWindows()

    def _render_ui(
        self,
        frame: np.ndarray,
        detections: List[HeadDetection],
        seat_statuses: List[Dict],
        fps: float,
        latency_ms: float
    ) -> np.ndarray:
        overlay = frame.copy()
        h, w = frame.shape[:2]

        # Vẽ các vùng bàn làm việc
        for seat in seat_statuses:
            color = seat["color_bgr"]
            poly = seat.get("polygon_pixel")
            box_norm = seat.get("normalized_box")

            if poly is not None:
                cv2.fillPoly(overlay, [poly], color)
                cv2.polylines(frame, [poly], True, color, 2)
                M = cv2.moments(poly)
                if M["m00"] != 0:
                    cx = int(M["m10"] / M["m00"])
                    cy = int(M["m01"] / M["m00"])
                    label = f"{seat['seat_name']}: {seat['status']}"
                    cv2.putText(frame, label, (cx - 50, cy), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            elif box_norm is not None:
                x1, y1, x2, y2 = denormalize_box(box_norm, w, h)
                cv2.rectangle(overlay, (x1, y1), (x2, y2), color, -1)
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                label = f"{seat['seat_name']}: {seat['status']}"
                cv2.putText(frame, label, (x1 + 5, y1 + 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

        # Alpha Blending trong suốt
        cv2.addWeighted(overlay, 0.25, frame, 0.75, 0, frame)

        # Vẽ đầu người & tâm điểm
        for det in detections:
            x1, y1, x2, y2 = det.bbox_pixel
            cx, cy = det.center_pixel
            cv2.rectangle(frame, (x1, y1), (x2, y2), (255, 0, 0), 2)
            cv2.circle(frame, (cx, cy), 5, (0, 255, 255), -1)
            cv2.putText(frame, f"Head: {det.confidence:.2f}", (x1, max(20, y1 - 5)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 0, 0), 1)

        # Header info
        device_str = self.detector.device_name if self.detector else "N/A"
        info = f"FPS: {fps:.1f} | Latency: {latency_ms:.1f}ms | Device: {device_str} | Heads: {len(detections)}"
        cv2.putText(frame, info, (20, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 255, 0), 2)
        return frame

    def stop(self):
        self.running = False
        if self.async_worker:
            self.async_worker.stop()
        if self.cap:
            self.cap.release()
