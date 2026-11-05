"""
Kiểm thử tự động cho AI Service (Cấu trúc mới):
1. Kiểm tra thuật toán hình học tính Tâm Đầu & kiểm tra rơi vào hình hộp bàn.
2. Kiểm tra bộ đệm vòng Circular Ring Buffer.
3. Kiểm tra máy trạng thái chỗ ngồi FSM (Anti-Flicker).
4. Kiểm tra nạp và suy luận các mô hình ONNX (RT-DETR-L, SCRFD Face Detector, ArcFace 512D).
"""

import sys
import os
import unittest
import numpy as np
from pathlib import Path

# Đưa thư mục ai_service vào sys.path
TEST_DIR = Path(__file__).resolve().parent
SERVICE_DIR = TEST_DIR.parent
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

from modules.occupancy.geometry import is_point_in_box, is_point_in_polygon, denormalize_box
from shared.config import SeatBox, settings
from shared.utils.ring_buffer import CircularRingBuffer
from modules.occupancy.fsm import SeatStatus
from modules.occupancy.pipeline import OccupancyPipeline
from modules.occupancy.detector import RTDETRHeadDetector, HeadDetection
from modules.face_recognition.detector import SCRFDFaceDetector
from modules.face_recognition.recognizer import ArcFaceRecognizer


class TestGeometryAndFSM(unittest.TestCase):
    def test_point_in_box(self):
        """Kiểm tra điểm tâm đầu nằm trong/ngoài hình hộp bàn làm việc."""
        box = [0.2, 0.2, 0.8, 0.8]  # [xmin, ymin, xmax, ymax]
        
        # Điểm nằm chính giữa hộp
        center_inside = (0.5, 0.5)
        self.assertTrue(is_point_in_box(center_inside, box))
        
        # Điểm nằm sát mép trong
        edge_inside = (0.2, 0.2)
        self.assertTrue(is_point_in_box(edge_inside, box))
        
        # Điểm nằm ngoài hộp
        outside = (0.1, 0.5)
        self.assertFalse(is_point_in_box(outside, box))
        
        outside_far = (0.9, 0.95)
        self.assertFalse(is_point_in_box(outside_far, box))

    def test_point_in_polygon_ray_casting(self):
        """Kiểm tra thuật toán Ray-Casting cho đa giác 4 đỉnh."""
        polygon = [(10, 10), (100, 10), (100, 100), (10, 100)]
        self.assertTrue(is_point_in_polygon((50, 50), polygon))
        self.assertFalse(is_point_in_polygon((5, 50), polygon))
        self.assertFalse(is_point_in_polygon((150, 50), polygon))

    def test_circular_ring_buffer(self):
        """Kiểm tra dung lượng cố định của CircularRingBuffer, tránh rò rỉ RAM."""
        buffer = CircularRingBuffer(capacity=5)
        dummy_frame = np.zeros((100, 100, 3), dtype=np.uint8)
        
        for i in range(10):
            buffer.append(dummy_frame)
            
        self.assertEqual(buffer.size(), 5)
        frames = buffer.get_all_frames()
        self.assertEqual(len(frames), 5)

    def test_occupancy_pipeline_head_center_fsm(self):
        """Kiểm tra FSM chỗ ngồi: Tâm đầu trong hộp -> PRESENT, vắng liên tục -> TEMP_AWAY."""
        test_seat = SeatBox(
            seat_id="TEST-01",
            seat_name="Bàn Test",
            normalized_box=[0.3, 0.3, 0.7, 0.7]
        )
        pipeline = OccupancyPipeline(seats=[test_seat], anti_flicker_frames=3, prolonged_away_sec=10.0)
        
        # 1. Ban đầu: Chưa có ai -> EMPTY
        res = pipeline.process_frame([])
        self.assertEqual(res[0]["status"], SeatStatus.EMPTY.value)
        
        # 2. Xuất hiện đầu người có tâm nằm trong hộp (xc=0.5, yc=0.5)
        mock_head = HeadDetection(
            bbox_pixel=(300, 300, 700, 700),
            bbox_normalized=(0.3, 0.3, 0.7, 0.7),
            center_pixel=(500, 500),
            center_normalized=(0.5, 0.5),
            confidence=0.92,
            class_id=0
        )
        res = pipeline.process_frame([mock_head])
        self.assertEqual(res[0]["status"], SeatStatus.PRESENT.value)
        self.assertTrue(res[0]["has_occupant"])
        
        # 3. Người rời vị trí (không có đầu trong hộp)
        pipeline.process_frame([])
        pipeline.process_frame([])
        res = pipeline.process_frame([])
        self.assertEqual(res[0]["status"], SeatStatus.TEMP_AWAY.value)


class TestModelLoading(unittest.TestCase):
    def test_rtdetr_head_model_exists(self):
        """Kiểm tra file rtdetr_head.onnx nếu có trong modules/occupancy/weights/."""
        model_path = Path(settings.occupancy.model_path)
        if not model_path.exists():
            self.skipTest(f"Chưa có file trọng số RT-DETR tại {model_path}, bỏ qua.")
        self.assertTrue(model_path.exists())
        self.assertGreater(model_path.stat().st_size, 10_000_000)

    def test_rtdetr_head_detector_inference(self):
        """Kiểm tra nạp mô hình RT-DETR-L ONNX và chạy suy luận trên dummy frame."""
        model_path = settings.occupancy.model_path
        if not os.path.exists(model_path):
            self.skipTest(f"Chưa có file trọng số RT-DETR tại {model_path}, bỏ qua.")
        detector = RTDETRHeadDetector(model_path=model_path, conf_threshold=0.45)
        
        self.assertEqual(detector.input_names, ["images"])
        self.assertEqual(detector.target_w, 960)
        self.assertEqual(detector.target_h, 960)
        self.assertEqual(detector.output_names, ["output0"])
        
        dummy = np.zeros((720, 1280, 3), dtype=np.uint8)
        detections = detector.predict(dummy)
        self.assertIsInstance(detections, list)

    def test_face_detector_model_exists(self):
        """Kiểm tra file trọng số SCRFD face detector có tồn tại và đạt kích thước."""
        det_path = settings.face.detector_path
        if not det_path.exists():
            self.skipTest(f"Chưa có file trọng số SCRFD tại {det_path}, bỏ qua.")
        self.assertTrue(det_path.exists(), f"Không tìm thấy file SCRFD tại: {det_path}")
        self.assertGreater(det_path.stat().st_size, 2_000_000, "File SCRFD phải lớn hơn 2MB")

    def test_arcface_model_exists_and_infers(self):
        """Kiểm tra file trọng số ArcFace iResNet-50 và chạy suy luận 512D chuẩn hóa L2."""
        rec_path = settings.face.recognizer_path
        if not rec_path.exists():
            self.skipTest(f"Chưa có file trọng số ArcFace tại {rec_path}, bỏ qua.")
        self.assertTrue(rec_path.exists(), f"Không tìm thấy file ArcFace tại: {rec_path}")
        self.assertGreater(rec_path.stat().st_size, 100_000_000, "File ArcFace phải lớn hơn 100MB")

        recognizer = ArcFaceRecognizer(model_path=str(rec_path))
        dummy_face = np.zeros((112, 112, 3), dtype=np.uint8)
        embedding = recognizer.extract_features(dummy_face)
        self.assertEqual(embedding.shape, (512,))
        self.assertAlmostEqual(float(np.linalg.norm(embedding)), 1.0, places=4)


if __name__ == "__main__":
    unittest.main()
