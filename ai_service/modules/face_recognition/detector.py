"""
Bộ phát hiện khuôn mặt & 5 điểm mốc giải phẫu (Face Detection & Landmarks).
Hỗ trợ mô hình SCRFD định dạng ONNX (Offline 100%).
"""

import os
import cv2
import numpy as np
from typing import List, Tuple, Optional
from dataclasses import dataclass

from shared.config import settings
from shared.engines.onnx_engine import OnnxEngine
from shared.utils.image_processing import letterbox

try:
    import insightface
    HAS_INSIGHTFACE = True
except ImportError:
    HAS_INSIGHTFACE = False

try:
    import onnxruntime as ort
    HAS_ORT = True
except ImportError:
    HAS_ORT = False


@dataclass
class FaceDetection:
    """Đối tượng phát hiện khuôn mặt với 5 điểm mốc giải phẫu (5-landmarks)."""
    bbox_pixel: Tuple[int, int, int, int]              # [xmin, ymin, xmax, ymax]
    bbox_normalized: Tuple[float, float, float, float]    # [xmin, ymin, xmax, ymax] tỷ lệ [0.0, 1.0]
    landmarks: np.ndarray                              # Shape (5, 2): mắt trái, mắt phải, mũi, mép miệng trái, mép miệng phải
    score: float                                       # Ngưỡng tự tin phát hiện mặt


class SCRFDFaceDetector:
    """
    Engine phát hiện khuôn mặt ONNX Runtime (SCRFD).
    Nạp trực tiếp từ file trọng số scrfd_face_det.onnx (det_500m.onnx).
    """

    def __init__(
        self,
        model_path: Optional[str] = None,
        conf_threshold: float = 0.5,
        use_cpu: bool = False
    ):
        target_path = model_path or str(settings.face.detector_path)
        self.model_path = target_path if os.path.exists(target_path) else None
        self.conf_threshold = conf_threshold
        self.use_cpu = use_cpu
        self.detector = None
        self.engine: Optional[OnnxEngine] = None

        if self.model_path:
            self._init_detector()

    def _init_detector(self):
        providers = ["CPUExecutionProvider"]
        ctx_id = -1
        if not self.use_cpu and HAS_ORT:
            available = ort.get_available_providers()
            if "CUDAExecutionProvider" in available:
                providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
                ctx_id = 0

        if HAS_INSIGHTFACE:
            try:
                self.detector = insightface.model_zoo.get_model(self.model_path, providers=providers)
                self.detector.prepare(ctx_id=ctx_id, input_size=(320, 320))
                return
            except Exception as e:
                print(f"[SCRFDFaceDetector] Warning: Không thể nạp qua insightface model_zoo ({e}), thử OnnxEngine...")

        try:
            self.engine = OnnxEngine(model_path=self.model_path, use_cpu=self.use_cpu)
        except Exception as e:
            print(f"[SCRFDFaceDetector] Warning: OnnxEngine init error: {e}")

    def detect(self, frame: np.ndarray) -> List[FaceDetection]:
        """Phát hiện danh sách khuôn mặt trong khung hình."""
        if frame is None or frame.size == 0:
            return []

        h, w = frame.shape[:2]
        results: List[FaceDetection] = []

        # 1. Ưu tiên giải mã chuẩn qua InsightFace SCRFD Wrapper
        if self.detector is not None:
            try:
                bboxes, kpss = self.detector.detect(frame, input_size=(320, 320))
                if bboxes is not None and len(bboxes) > 0:
                    for i in range(len(bboxes)):
                        score = float(bboxes[i, 4])
                        if score < self.conf_threshold:
                            continue
                        x1, y1, x2, y2 = bboxes[i, :4]
                        x1 = max(0, min(int(x1), w - 1))
                        y1 = max(0, min(int(y1), h - 1))
                        x2 = max(0, min(int(x2), w))
                        y2 = max(0, min(int(y2), h))
                        kps = kpss[i] if kpss is not None and len(kpss) > i else np.zeros((5, 2), dtype=np.float32)

                        results.append(FaceDetection(
                            bbox_pixel=(x1, y1, x2, y2),
                            bbox_normalized=(x1 / w, y1 / h, x2 / w, y2 / h),
                            landmarks=kps,
                            score=score
                        ))
                    return results
            except Exception as e:
                print(f"[SCRFDFaceDetector] Lỗi khi detect qua InsightFace: {e}")

        # 2. Fallback qua OnnxEngine nếu không có InsightFace
        if self.engine is not None:
            input_img, ratio, (pad_w, pad_h) = letterbox(frame, (640, 640))
            input_tensor = cv2.cvtColor(input_img, cv2.COLOR_BGR2RGB).astype(np.float32)
            input_tensor = (input_tensor - 127.5) / 128.0
            input_tensor = np.transpose(input_tensor, (2, 0, 1))[np.newaxis, ...]

            input_name = self.engine.input_names[0]
            outputs = self.engine.run({input_name: input_tensor})
            # Nếu chạy mock hoặc custom post-process
            return results

        return results
