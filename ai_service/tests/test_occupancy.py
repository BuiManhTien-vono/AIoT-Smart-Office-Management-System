"""
Kiểm thử tự động cho Module Occupancy (Giám sát chỗ ngồi):
- Thuật toán Point-in-Box và Ray-Casting.
- FSM 4 trạng thái (EMPTY, PRESENT, TEMP_AWAY, PROLONGED_AWAY).
- Mô hình RT-DETR-L ONNX trên ảnh dummy.
"""

import os
import sys
import unittest
import numpy as np
from pathlib import Path

SERVICE_DIR = Path(__file__).resolve().parent.parent
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

from shared.config import settings, SeatBox
from modules.occupancy.geometry import is_point_in_box, is_point_in_polygon
from modules.occupancy.fsm import SeatStatus
from modules.occupancy.detector import RTDETRHeadDetector, HeadDetection
from modules.occupancy.pipeline import OccupancyPipeline

class TestOccupancyModule(unittest.TestCase):
    def test_point_in_box(self):
        box = [0.2, 0.2, 0.8, 0.8]
        self.assertTrue(is_point_in_box((0.5, 0.5), box))
        self.assertFalse(is_point_in_box((0.1, 0.5), box))

    def test_ray_casting_polygon(self):
        polygon = [(10, 10), (100, 10), (100, 100), (10, 100)]
        self.assertTrue(is_point_in_polygon((50, 50), polygon))
        self.assertFalse(is_point_in_polygon((5, 50), polygon))

    def test_fsm_transitions(self):
        test_seat = SeatBox(
            seat_id="SEAT-01",
            seat_name="Bàn Test",
            normalized_box=[0.3, 0.3, 0.7, 0.7]
        )
        pipeline = OccupancyPipeline(seats=[test_seat], away_alert_sec=10.0)

        # Ban đầu: EMPTY
        res = pipeline.process_frame([])
        self.assertEqual(res[0]["status"], SeatStatus.EMPTY.value)

        # Xuất hiện đầu người
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

    def test_rtdetr_inference(self):
        model_path = settings.occupancy.model_path
        if not os.path.exists(model_path):
            self.skipTest(f"Chưa có file trọng số RT-DETR tại {model_path}, bỏ qua kiểm thử suy luận.")
        detector = RTDETRHeadDetector(model_path=model_path, conf_threshold=0.45)
        dummy = np.zeros((720, 1280, 3), dtype=np.uint8)
        detections = detector.predict(dummy)
        self.assertIsInstance(detections, list)

if __name__ == "__main__":
    unittest.main()
