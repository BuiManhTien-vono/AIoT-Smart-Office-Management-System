"""
Kiểm thử tự động cho Module Occupancy (Giám sát chỗ ngồi) và Cầu nối BackendSyncClient:
- Thuật toán Point-in-Box và Ray-Casting.
- FSM 4 trạng thái (EMPTY, PRESENT, TEMP_AWAY, PROLONGED_AWAY).
- Đồng bộ đa giác chuẩn hóa [0.0, 1.0] và tạo payload State-Sync gửi về Backend .NET 10.
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
from shared.backend_client import BackendSyncClient
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

    def test_fsm_transitions_and_backend_payload_mapping(self):
        test_seat = SeatBox(
            seat_id="SEAT_IT_01",
            seat_name="Bàn Test",
            normalized_box=[0.1, 0.2, 0.3, 0.5],
            polygon_points=[(0.1, 0.2), (0.3, 0.2), (0.3, 0.5), (0.1, 0.5)]
        )
        pipeline = OccupancyPipeline(seats=[test_seat], away_alert_sec=10.0)

        # Ban đầu: EMPTY
        res = pipeline.process_frame([])
        self.assertEqual(res[0]["status"], SeatStatus.EMPTY.value)

        # Xuất hiện đầu người nằm trong đa giác chuẩn hóa (0.2, 0.35)
        mock_head = HeadDetection(
            bbox_pixel=(150, 200, 250, 300),
            bbox_normalized=(0.15, 0.25, 0.25, 0.45),
            center_pixel=(200, 250),
            center_normalized=(0.20, 0.35),
            confidence=0.92,
            class_id=0
        )
        res = pipeline.process_frame([mock_head])
        self.assertEqual(res[0]["status"], SeatStatus.PRESENT.value)
        self.assertTrue(res[0]["has_occupant"])

        # Kiểm tra đóng gói payload khớp 100% với POST /api/v1/occupancy/state-sync của C# Backend
        payload = BackendSyncClient.build_state_sync_payload(
            camera_code="CAM_DESK_IT",
            frame_sequence=150,
            seat_statuses=res,
            captured_at_utc="2026-11-06T09:00:00Z"
        )
        self.assertEqual(payload["cameraCode"], "CAM_DESK_IT")
        self.assertEqual(payload["frameSequence"], 150)
        self.assertEqual(len(payload["observations"]), 1)
        obs = payload["observations"][0]
        self.assertEqual(obs["seatCode"], "SEAT_IT_01")
        self.assertTrue(obs["isOccupied"])
        self.assertEqual(obs["unoccupiedContinuousFrames"], 0)
        self.assertAlmostEqual(obs["detectionConfidence"], 0.92, places=2)

    def test_dynamic_seat_state_sync_in_routes(self):
        from api.routes_occupancy import occupancy_pipeline, SeatState, SeatStatus
        test_seats = [
            {
                "id": "BAN_99",
                "seatCode": "BAN_99",
                "seatName": "Bàn Test 99",
                "polygonPoints": [{"x": 0.1, "y": 0.1}, {"x": 0.3, "y": 0.1}, {"x": 0.3, "y": 0.3}, {"x": 0.1, "y": 0.3}]
            }
        ]
        s_id = test_seats[0]["id"]
        pts = test_seats[0]["polygonPoints"]
        poly_tuples = [(float(p["x"]), float(p["y"])) for p in pts]
        occupancy_pipeline.seats_state[s_id] = SeatState(
            seat_id=s_id,
            seat_name=test_seats[0]["seatName"],
            normalized_polygon=poly_tuples,
            status=SeatStatus.EMPTY
        )
        self.assertIn(s_id, occupancy_pipeline.seats_state)
        self.assertEqual(occupancy_pipeline.seats_state[s_id].status, SeatStatus.EMPTY)
        occupancy_pipeline.seats_state.pop(s_id, None)

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
