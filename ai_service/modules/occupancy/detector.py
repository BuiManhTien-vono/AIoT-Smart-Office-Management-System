"""
Bộ suy luận phát hiện phần đầu người (Head Detection - RT-DETR-L).
Tích hợp ONNX Engine chuẩn hóa và luồng chạy ngầm bất đồng bộ AsyncHeadDetector.
"""

import os
import sys
import time
import threading
import cv2
import numpy as np
from typing import List, Tuple, Optional
from dataclasses import dataclass

from shared.engines.onnx_engine import OnnxEngine
from shared.utils.image_processing import direct_resize_and_normalize

@dataclass
class HeadDetection:
    """Đối tượng phát hiện phần đầu người."""
    bbox_pixel: Tuple[int, int, int, int]              # [xmin, ymin, xmax, ymax] dạng pixel
    bbox_normalized: Tuple[float, float, float, float]    # [xmin, ymin, xmax, ymax] tỷ lệ [0.0, 1.0]
    center_pixel: Tuple[int, int]                      # (xc, yc) dạng pixel
    center_normalized: Tuple[float, float]             # (xc, yc) tỷ lệ [0.0, 1.0]
    confidence: float                                  # Điểm tự tin (0.0 - 1.0)
    class_id: int = 0                                  # ID lớp (0: Head)

class RTDETRHeadDetector:
    """
    Engine suy luận phát hiện đầu người chuyên dụng cho mô hình RT-DETR-L (best.onnx / rtdetr_head.onnx).
    """

    def __init__(
        self,
        model_path: str = "rtdetr_head.onnx",
        use_cpu: bool = False,
        conf_threshold: float = 0.35,
        imgsz: int = 960,
        preferred_providers: Optional[List[str]] = None
    ):
        self.conf_threshold = conf_threshold
        self.imgsz = imgsz

        # Khởi tạo ONNX Engine
        self.engine = OnnxEngine(
            model_path=model_path,
            use_cpu=use_cpu,
            preferred_providers=preferred_providers
        )
        self.session = self.engine.session
        self.active_provider = self.engine.active_provider
        self.device_name = self.engine.device_name
        self.input_names = self.engine.input_names
        self.input_shapes = self.engine.input_shapes
        self.output_names = self.engine.output_names
        self.output_shapes = self.engine.output_shapes

        self.input_name = self.input_names[0]

        for shape in self.input_shapes:
            if len(shape) == 4 and isinstance(shape[2], int):
                self.imgsz = shape[2]
                break

        self.target_w = self.imgsz
        self.target_h = self.imgsz

        # Warm-up phiên suy luận
        self._warmup()

    def _warmup(self):
        """Khởi tạo trước bộ nhớ GPU/CPU với 1 tensor rỗng."""
        self.engine.warmup((1, 3, self.imgsz, self.imgsz), dtype=np.float32)

    def detect(self, frame: np.ndarray) -> Tuple[List[Tuple[int, int, int, int]], List[Tuple[int, int]], List[float]]:
        """
        Trả về: (boxes_pixel, centers_pixel, scores).
        """
        orig_h, orig_w = frame.shape[:2]

        # 1. Tiền xử lý trực tiếp 960x960
        img = direct_resize_and_normalize(frame, (self.imgsz, self.imgsz))

        # 2. Suy luận ONNX Runtime
        outputs = self.engine.run({self.input_name: img})[0][0]  # (300, 6)

        # 3. Lọc dự đoán theo ngưỡng tự tin bằng NumPy Vectorized Mask
        scores = outputs[:, 4]
        mask = scores >= self.conf_threshold
        valid = outputs[mask]

        if len(valid) == 0:
            return [], [], []

        cx = valid[:, 0]
        cy = valid[:, 1]
        bw = valid[:, 2]
        bh = valid[:, 3]
        valid_scores = valid[:, 4].tolist()

        # Tính toán Bounding Box pixel thực tế trên ảnh gốc
        x1 = np.clip((cx - bw / 2.0) * orig_w, 0, orig_w).astype(int)
        y1 = np.clip((cy - bh / 2.0) * orig_h, 0, orig_h).astype(int)
        x2 = np.clip((cx + bw / 2.0) * orig_w, 0, orig_w).astype(int)
        y2 = np.clip((cy + bh / 2.0) * orig_h, 0, orig_h).astype(int)

        # Tính toán điểm tâm đầu (Head Center)
        cx_px = ((x1 + x2) // 2).tolist()
        cy_px = ((y1 + y2) // 2).tolist()

        boxes = list(zip(x1.tolist(), y1.tolist(), x2.tolist(), y2.tolist()))
        centers = list(zip(cx_px, cy_px))

        return boxes, centers, valid_scores

    def predict(self, frame: np.ndarray) -> List[HeadDetection]:
        """
        API trả về danh sách đối tượng HeadDetection đầy đủ thông tin.
        """
        orig_h, orig_w = frame.shape[:2]
        boxes, centers, scores = self.detect(frame)

        results: List[HeadDetection] = []
        for (x1, y1, x2, y2), (cx, cy), sc in zip(boxes, centers, scores):
            results.append(HeadDetection(
                bbox_pixel=(x1, y1, x2, y2),
                bbox_normalized=(x1 / orig_w, y1 / orig_h, x2 / orig_w, y2 / orig_h),
                center_pixel=(cx, cy),
                center_normalized=(cx / orig_w, cy / orig_h),
                confidence=float(sc),
                class_id=0
            ))

        return results


class AsyncHeadDetector:
    """
    Luồng chạy ngầm bất đồng bộ cho RT-DETR (giữ video phát liên tục 30 FPS không giật lag).
    """
    def __init__(self, detector: RTDETRHeadDetector):
        self.detector = detector
        self.running = True
        self.lock = threading.Lock()
        self.new_frame = None
        self.is_processing = False
        self.latest_detections: List[HeadDetection] = []
        self.latency_ms = 0.0
        self.inferences_count = 0
        self.thread = threading.Thread(target=self._worker, daemon=True)
        self.thread.start()

    def _worker(self):
        while self.running:
            frame_to_process = None
            with self.lock:
                if self.new_frame is not None:
                    frame_to_process = self.new_frame
                    self.new_frame = None
                    self.is_processing = True

            if frame_to_process is not None:
                t0 = time.perf_counter()
                dets = self.detector.predict(frame_to_process)
                dt = (time.perf_counter() - t0) * 1000

                with self.lock:
                    self.latest_detections = dets
                    self.latency_ms = dt
                    self.inferences_count += 1
                    self.is_processing = False
            else:
                time.sleep(0.005)

    def submit(self, frame: np.ndarray) -> bool:
        """Gửi frame mới cho AI xử lý nếu luồng ngầm đang rảnh."""
        with self.lock:
            if not self.is_processing:
                self.new_frame = frame.copy()
                return True
            return False

    def get_results(self) -> Tuple[List[HeadDetection], float, bool]:
        with self.lock:
            return list(self.latest_detections), self.latency_ms, self.is_processing

    def stop(self):
        self.running = False
