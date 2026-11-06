"""
Kiểm thử tự động cho Module Face Recognition:
- Tính toán độ tương đồng Cosine (Cosine Similarity).
- Kiểm tra trùng lặp sinh trắc học (Duplicate check FR-BIO-05).
- Đánh giá chất lượng khuôn mặt (Blur score Laplace FR-BIO-03).
- Căn chỉnh Affine 5 điểm landmarks (Face Alignment FR-BIO-04).
- Kiểm tra mô hình chống giả mạo MiniFASNet-V2 (FR-ATT-01).
"""

import os
import sys
import unittest
import numpy as np
from pathlib import Path

SERVICE_DIR = Path(__file__).resolve().parent.parent
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

from shared.config import settings
from modules.face_recognition.detector import SCRFDFaceDetector
from modules.face_recognition.recognizer import compute_cosine_similarity, ArcFaceRecognizer
from modules.face_recognition.aligner import FaceAligner, ARCFACE_REFERENCE_5PTS
from modules.face_recognition.anti_spoofing import AntiSpoofingChecker
from modules.face_recognition.pipeline import FaceRecognitionPipeline


class TestFaceRecognitionModule(unittest.TestCase):
    def test_cosine_similarity(self):
        # Hai vector giống hệt nhau -> Similarity = 1.0
        v1 = np.array([1.0, 0.0, 0.0], dtype=np.float32)
        v2 = np.array([1.0, 0.0, 0.0], dtype=np.float32)
        self.assertAlmostEqual(compute_cosine_similarity(v1, v2), 1.0, places=4)

        # Hai vector trực giao -> Similarity = 0.0
        v3 = np.array([0.0, 1.0, 0.0], dtype=np.float32)
        self.assertAlmostEqual(compute_cosine_similarity(v1, v3), 0.0, places=4)

    def test_duplicate_check(self):
        pipeline = FaceRecognitionPipeline(
            detector=SCRFDFaceDetector(auto_download=False),
            recognizer=ArcFaceRecognizer(auto_download=False),
            anti_spoofing=AntiSpoofingChecker(auto_download=False)
        )
        base_vec = np.random.randn(512).astype(np.float32)
        base_vec = base_vec / np.linalg.norm(base_vec)

        # Vector gần giống (thêm nhiễu rất nhỏ) -> Similarity > 0.85
        duplicate_vec = base_vec + np.random.normal(0, 0.01, 512).astype(np.float32)
        duplicate_vec = duplicate_vec / np.linalg.norm(duplicate_vec)

        existing = [("EMP-001", base_vec)]
        is_dup, matched_id, score = pipeline.verify_duplicate(duplicate_vec, existing, threshold=0.85)

        self.assertTrue(is_dup)
        self.assertEqual(matched_id, "EMP-001")
        self.assertGreater(score, 0.85)

    def test_face_alignment(self):
        # Kiểm tra căn chỉnh Affine từ 5 điểm mốc
        dummy_img = np.zeros((200, 200, 3), dtype=np.uint8)
        landmarks = np.array([
            [50, 60],
            [90, 60],
            [70, 80],
            [55, 110],
            [85, 110]
        ], dtype=np.float32)

        aligned = FaceAligner.align(dummy_img, landmarks, output_size=112)
        self.assertEqual(aligned.shape, (112, 112, 3))

    def test_laplacian_blur_check(self):
        checker = AntiSpoofingChecker(auto_download=False)
        # Ảnh đen tuyền (không có nét) -> score = 0 <= 100 -> Fail
        flat_img = np.zeros((150, 150, 3), dtype=np.uint8)
        is_pass, msg, score = checker.assess_quality(flat_img)
        self.assertFalse(is_pass)
        self.assertIn("mờ nhòe", msg)

    def test_minifasnet_liveness_inference(self):
        # Kiểm tra suy luận thực tế với mô hình MiniFASNet-V2 ONNX nếu đã có file trọng số
        fas_path = settings.face.anti_spoofing_path
        if not fas_path.exists():
            self.skipTest(f"Chưa có file trọng số MiniFASNet-V2 tại {fas_path}, bỏ qua.")
        checker = AntiSpoofingChecker(model_path=str(fas_path), auto_download=False)
        self.assertIsNotNone(checker.engine, "Mô hình MiniFASNet-V2 chưa được nạp.")
        dummy_face = np.full((120, 120, 3), 128, dtype=np.uint8)
        is_real, score, details = checker.check_liveness(dummy_face)
        self.assertIsInstance(is_real, (bool, np.bool_))
        self.assertGreaterEqual(score, 0.0)
        self.assertLessEqual(score, 1.0)
        self.assertIn("spoof_print_score", details)
        self.assertIn("spoof_screen_score", details)


if __name__ == "__main__":
    unittest.main()
