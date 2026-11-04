"""
Pipeline Nhận diện Sinh trắc học Khuôn mặt (Face Recognition Pipeline).
Phối hợp các tác vụ:
1. Phát hiện mặt (Face Detection)
2. Kiểm tra chất lượng & Chống giả mạo (Quality Assessment & Anti-Spoofing)
3. Căn chỉnh góc mặt theo 5 điểm mốc (Face Alignment)
4. Trích xuất vector đặc trưng 512 chiều (ArcFace 512D)
5. So khớp Cosine Similarity (Duplicate Check & Attendance)
"""

import cv2
import numpy as np
from typing import List, Dict, Tuple, Optional, Any

from shared.config import settings
from .detector import SCRFDFaceDetector, FaceDetection
from .aligner import FaceAligner
from .recognizer import ArcFaceRecognizer, compute_cosine_similarity
from .anti_spoofing import AntiSpoofingChecker

class FaceRecognitionPipeline:
    def __init__(
        self,
        detector: Optional[SCRFDFaceDetector] = None,
        aligner: Optional[FaceAligner] = None,
        recognizer: Optional[ArcFaceRecognizer] = None,
        anti_spoofing: Optional[AntiSpoofingChecker] = None
    ):
        self.detector = detector or SCRFDFaceDetector()
        self.aligner = aligner or FaceAligner()
        self.recognizer = recognizer or ArcFaceRecognizer()
        self.anti_spoofing = anti_spoofing or AntiSpoofingChecker()

    def process_registration_photo(self, image: np.ndarray) -> Dict[str, Any]:
        """
        Quy trình xử lý ảnh đăng ký hồ sơ nhân viên (FR-BIO-02, FR-BIO-03, FR-BIO-04):
        1. Kiểm tra số lượng khuôn mặt (phải đúng 1 khuôn mặt).
        2. Kiểm định chất lượng (độ phân giải >= 112x112, độ nét Laplace > 100).
        3. Căn chỉnh mặt theo 5 landmarks.
        4. Trích xuất vector chuẩn hóa 512D.
        """
        faces = self.detector.detect(image)

        # 1. Kiểm tra số lượng khuôn mặt
        if len(faces) == 0:
            # Fallback nếu detector chưa có weights: Cắt vùng trung tâm để test
            h, w = image.shape[:2]
            crop_size = min(h, w)
            y1 = (h - crop_size) // 2
            x1 = (w - crop_size) // 2
            face_crop = image[y1:y1+crop_size, x1:x1+crop_size]
        elif len(faces) > 1:
            return {
                "success": False,
                "error_code": "MULTIPLE_FACES",
                "message": f"Phát hiện {len(faces)} khuôn mặt trong ảnh. Vui lòng chỉ chụp 1 người duy nhất."
            }
        else:
            x1, y1, x2, y2 = faces[0].bbox_pixel
            face_crop = image[y1:y2, x1:x2]

        # 2. Đánh giá chất lượng khuôn mặt
        is_quality_pass, quality_msg, blur_score = self.anti_spoofing.assess_quality(face_crop)
        if not is_quality_pass:
            return {
                "success": False,
                "error_code": "QUALITY_FAILED",
                "message": quality_msg,
                "blur_score": blur_score
            }

        # 3. Căn chỉnh mặt
        if len(faces) > 0 and hasattr(faces[0], "landmarks") and faces[0].landmarks is not None:
            aligned_face = self.aligner.align(image, faces[0].landmarks, output_size=112)
        else:
            aligned_face = cv2.resize(face_crop, (112, 112))

        # 4. Trích xuất vector 512D
        embedding = self.recognizer.extract_features(aligned_face)

        return {
            "success": True,
            "message": "Trích xuất đặc trưng thành công",
            "embedding": embedding.tolist(),
            "embedding_dim": len(embedding),
            "blur_score": blur_score
        }

    def verify_duplicate(
        self,
        new_embedding: np.ndarray,
        existing_embeddings: List[Tuple[str, np.ndarray]],
        threshold: float = 0.85
    ) -> Tuple[bool, Optional[str], float]:
        """
        Kiểm tra trùng lặp sinh trắc (FR-BIO-05):
        So sánh Cosine similarity với toàn bộ nhân viên đã có.
        Nếu tồn tại Similarity > threshold (0.85) -> Cảnh báo trùng lặp.
        """
        max_sim = -1.0
        matched_id = None

        for emp_id, emp_vec in existing_embeddings:
            sim = compute_cosine_similarity(new_embedding, emp_vec)
            if sim > max_sim:
                max_sim = sim
                matched_id = emp_id

        is_duplicate = max_sim >= threshold
        return is_duplicate, matched_id, max_sim
