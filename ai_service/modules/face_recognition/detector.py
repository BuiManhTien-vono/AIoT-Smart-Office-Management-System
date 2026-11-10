"""
Bộ phát hiện khuôn mặt & 5 điểm mốc giải phẫu (Face Detection & Landmarks).
Hỗ trợ mô hình SCRFD định dạng ONNX (Offline 100%, tự động tải nếu thiếu).
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
        use_cpu: bool = False,
        auto_download: bool = True
    ):
        target_path = model_path
        if not target_path or not os.path.exists(target_path):
            if auto_download:
                try:
                    target_path = settings.face.ensure_detector_exists()
                except Exception as e:
                    print(f"[SCRFDFaceDetector] Warning: Không thể nạp detector: {e}")
                    target_path = str(settings.face.detector_path)
            else:
                target_path = str(settings.face.detector_path)

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
            input_size = (640, 640)
            input_img, ratio, (pad_w, pad_h) = letterbox(frame, input_size)
            input_tensor = cv2.cvtColor(input_img, cv2.COLOR_BGR2RGB).astype(np.float32)
            input_tensor = (input_tensor - 127.5) / 128.0
            input_tensor = np.transpose(input_tensor, (2, 0, 1))[np.newaxis, ...]

            input_name = self.engine.input_names[0]
            outputs = self.engine.run({input_name: input_tensor})
            return self._decode_scrfd_outputs(
                outputs=outputs,
                orig_w=w,
                orig_h=h,
                input_size=input_size,
                ratio=ratio,
                pad_w=pad_w,
                pad_h=pad_h
            )

        return results

    def _decode_scrfd_outputs(
        self,
        outputs: List[np.ndarray],
        orig_w: int,
        orig_h: int,
        input_size: Tuple[int, int] = (640, 640),
        ratio: float = 1.0,
        pad_w: float = 0.0,
        pad_h: float = 0.0,
        nms_threshold: float = 0.4
    ) -> List[FaceDetection]:
        """Giải mã 9 tensor đầu ra của SCRFD (det_500m.onnx) trên 3 tầng FPN stride [8, 16, 32]."""
        if not outputs or len(outputs) < 6:
            return []

        strides = [8, 16, 32]
        num_strides = len(strides)
        has_kps = len(outputs) >= 9
        in_h, in_w = input_size

        scores_list: List[np.ndarray] = []
        bboxes_list: List[np.ndarray] = []
        kpss_list: List[np.ndarray] = []

        for idx, stride in enumerate(strides):
            scores = outputs[idx].reshape(-1)
            bbox_preds = outputs[idx + num_strides].reshape(-1, 4) * stride
            kps_preds = (
                outputs[idx + num_strides * 2].reshape(-1, 10) * stride
                if has_kps
                else None
            )

            fm_h, fm_w = in_h // stride, in_w // stride
            anchor_centers = np.stack(np.mgrid[:fm_h, :fm_w][::-1], axis=-1).astype(np.float32)
            anchor_centers = (anchor_centers * stride).reshape((-1, 2))
            num_anchors = max(1, len(scores) // (fm_h * fm_w))
            if num_anchors > 1:
                anchor_centers = np.stack([anchor_centers] * num_anchors, axis=1).reshape((-1, 2))

            pos_inds = np.where(scores >= self.conf_threshold)[0]
            if len(pos_inds) == 0:
                continue

            pos_scores = scores[pos_inds]
            pos_bbox_preds = bbox_preds[pos_inds]
            pos_centers = anchor_centers[pos_inds]

            x1 = pos_centers[:, 0] - pos_bbox_preds[:, 0]
            y1 = pos_centers[:, 1] - pos_bbox_preds[:, 1]
            x2 = pos_centers[:, 0] + pos_bbox_preds[:, 2]
            y2 = pos_centers[:, 1] + pos_bbox_preds[:, 3]
            bboxes = np.stack([x1, y1, x2, y2], axis=-1)

            if kps_preds is not None:
                pos_kps_preds = kps_preds[pos_inds]
                kpss = np.zeros((len(pos_inds), 5, 2), dtype=np.float32)
                for i in range(5):
                    kpss[:, i, 0] = pos_centers[:, 0] + pos_kps_preds[:, i * 2]
                    kpss[:, i, 1] = pos_centers[:, 1] + pos_kps_preds[:, i * 2 + 1]
            else:
                kpss = np.zeros((len(pos_inds), 5, 2), dtype=np.float32)

            scores_list.append(pos_scores)
            bboxes_list.append(bboxes)
            kpss_list.append(kpss)

        if not scores_list:
            return []

        all_scores = np.concatenate(scores_list, axis=0)
        all_bboxes = np.concatenate(bboxes_list, axis=0)
        all_kpss = np.concatenate(kpss_list, axis=0)

        # Quy đổi từ khung ảnh letterbox 640x640 về khung hình gốc (orig_w, orig_h)
        safe_ratio = ratio if ratio > 0 else 1.0
        all_bboxes[:, [0, 2]] = (all_bboxes[:, [0, 2]] - pad_w) / safe_ratio
        all_bboxes[:, [1, 3]] = (all_bboxes[:, [1, 3]] - pad_h) / safe_ratio
        all_kpss[:, :, 0] = (all_kpss[:, :, 0] - pad_w) / safe_ratio
        all_kpss[:, :, 1] = (all_kpss[:, :, 1] - pad_h) / safe_ratio

        keep = self._nms(all_bboxes, all_scores, nms_threshold)
        detections: List[FaceDetection] = []
        for i in keep:
            bx1, by1, bx2, by2 = all_bboxes[i]
            x1_i = max(0, min(int(round(bx1)), orig_w - 1))
            y1_i = max(0, min(int(round(by1)), orig_h - 1))
            x2_i = max(x1_i + 1, min(int(round(bx2)), orig_w))
            y2_i = max(y1_i + 1, min(int(round(by2)), orig_h))

            detections.append(FaceDetection(
                bbox_pixel=(x1_i, y1_i, x2_i, y2_i),
                bbox_normalized=(x1_i / orig_w, y1_i / orig_h, x2_i / orig_w, y2_i / orig_h),
                landmarks=all_kpss[i].astype(np.float32),
                score=float(all_scores[i])
            ))

        # Ưu tiên khuôn mặt có diện tích lớn nhất / độ tin cậy cao nhất
        detections.sort(key=lambda d: (d.bbox_pixel[2] - d.bbox_pixel[0]) * (d.bbox_pixel[3] - d.bbox_pixel[1]), reverse=True)
        return detections

    @staticmethod
    def _nms(bboxes: np.ndarray, scores: np.ndarray, thresh: float = 0.4) -> List[int]:
        """Non-Maximum Suppression (NMS) loại bỏ các hộp khuôn mặt trùng lắp."""
        x1 = bboxes[:, 0]
        y1 = bboxes[:, 1]
        x2 = bboxes[:, 2]
        y2 = bboxes[:, 3]
        areas = np.maximum(0.0, x2 - x1 + 1) * np.maximum(0.0, y2 - y1 + 1)
        order = scores.argsort()[::-1]

        keep: List[int] = []
        while order.size > 0:
            i = int(order[0])
            keep.append(i)
            if order.size == 1:
                break
            xx1 = np.maximum(x1[i], x1[order[1:]])
            yy1 = np.maximum(y1[i], y1[order[1:]])
            xx2 = np.minimum(x2[i], x2[order[1:]])
            yy2 = np.minimum(y2[i], y2[order[1:]])

            w = np.maximum(0.0, xx2 - xx1 + 1)
            h = np.maximum(0.0, yy2 - yy1 + 1)
            inter = w * h
            ovr = inter / (areas[i] + areas[order[1:]] - inter + 1e-6)

            inds = np.where(ovr <= thresh)[0]
            order = order[inds + 1]

        return keep
