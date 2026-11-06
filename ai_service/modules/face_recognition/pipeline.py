"""
Pipeline Nhận diện Sinh trắc học Khuôn mặt (Face Recognition Pipeline).
Kiến trúc phối hợp 3 tầng (Triple-Stage Architecture):
1. Phát hiện mặt & 5 điểm mốc (SCRFD ONNX Detector)
2. Kiểm tra chất lượng (Laplace Blur) & Chống giả mạo (MiniFASNet-V2 Anti-Spoofing)
3. Căn chỉnh góc mặt chuẩn 112x112 (Face Alignment Affine)
4. Trích xuất vector đặc trưng 512 chiều (ArcFace iResNet-50 512D)
5. So khớp Cosine Similarity (Kiểm tra trùng lặp FR-BIO-05 & Chấm công FR-ATT-02)
"""

import cv2
import numpy as np
from typing import List, Dict, Tuple, Optional, Any, Union

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
        1. Kiểm tra số lượng khuôn mặt (phải đúng 1 khuôn mặt, từ chối nếu 0 hoặc > 1).
        2. Kiểm định chất lượng (độ phân giải >= 112x112, độ nét Laplace > 100).
        3. Căn chỉnh mặt theo 5 landmarks đưa về ảnh 112x112.
        4. Trích xuất vector chuẩn hóa 512D (L2 norm = 1.0).
        """
        if image is None or image.size == 0:
            return {
                "success": False,
                "error_code": "EMPTY_IMAGE",
                "message": "Dữ liệu ảnh rỗng hoặc không giải mã được."
            }

        faces = self.detector.detect(image)

        # 1. Kiểm tra số lượng khuôn mặt (FR-BIO-03: đúng 1 khuôn mặt)
        if len(faces) == 0:
            return {
                "success": False,
                "error_code": "NO_FACE_DETECTED",
                "message": "Không phát hiện thấy khuôn mặt nào trong khung hình. Vui lòng chụp rõ mặt."
            }

        if len(faces) > 1:
            return {
                "success": False,
                "error_code": "MULTIPLE_FACES",
                "message": f"Phát hiện {len(faces)} khuôn mặt trong ảnh. Vui lòng chỉ chụp 1 người duy nhất."
            }

        face = faces[0]
        x1, y1, x2, y2 = face.bbox_pixel
        face_crop = image[y1:y2, x1:x2]

        # 2. Đánh giá chất lượng khuôn mặt (FR-BIO-03: độ nét Laplace > 100, size >= 112x112)
        is_quality_pass, quality_msg, blur_score = self.anti_spoofing.assess_quality(face_crop)
        if not is_quality_pass:
            return {
                "success": False,
                "error_code": "QUALITY_FAILED",
                "message": quality_msg,
                "blur_score": blur_score,
                "bbox": list(face.bbox_pixel)
            }

        # 3. Căn chỉnh mặt theo 5 landmarks
        if hasattr(face, "landmarks") and face.landmarks is not None and len(face.landmarks) == 5:
            aligned_face = self.aligner.align(image, face.landmarks, output_size=112)
        else:
            aligned_face = cv2.resize(face_crop, (112, 112))

        # 4. Trích xuất vector 512D chuẩn hóa L2
        embedding = self.recognizer.extract_features(aligned_face)

        return {
            "success": True,
            "message": "Trích xuất đặc trưng thành công.",
            "embedding": embedding.tolist(),
            "embedding_dim": len(embedding),
            "blur_score": blur_score,
            "bbox": list(face.bbox_pixel)
        }

    def verify_duplicate(
        self,
        new_embedding: np.ndarray,
        existing_embeddings: List[Tuple[str, np.ndarray]],
        threshold: float = 0.85
    ) -> Tuple[bool, Optional[str], float]:
        """
        Kiểm tra trùng lặp sinh trắc (FR-BIO-05):
        So sánh Cosine similarity với toàn bộ nhân viên đã có trong CSDL.
        Nếu tồn tại Similarity > threshold (0.85) -> Cảnh báo nguy cơ trùng hồ sơ.
        """
        if len(existing_embeddings) == 0:
            return False, None, 0.0

        max_sim = -1.0
        matched_id = None

        for emp_id, emp_vec in existing_embeddings:
            sim = compute_cosine_similarity(new_embedding, emp_vec)
            if sim > max_sim:
                max_sim = sim
                matched_id = emp_id

        is_duplicate = max_sim >= threshold
        return is_duplicate, matched_id, max_sim

    def identify_attendance(
        self,
        frame: np.ndarray,
        gallery_database: Union[Dict[str, np.ndarray], List[Tuple[str, np.ndarray]]],
        threshold: float = 0.70,
        check_liveness: bool = True
    ) -> Dict[str, Any]:
        """
        Nhận diện điểm danh 1:N không chạm (FR-ATT-01, FR-ATT-02):
        - Frame camera sảnh/cổng -> SCRFD -> MiniFASNet -> ArcFace 512D -> Tìm max cosine similarity
        - Ngưỡng nhận diện match: >= 0.70 (theo FR-ATT-02).
        """
        faces = self.detector.detect(frame)
        if len(faces) == 0:
            return {
                "success": False,
                "status": "NO_FACE",
                "message": "Không có khuôn mặt nào trong khung hình."
            }

        primary_face = faces[0]
        x1, y1, x2, y2 = primary_face.bbox_pixel

        # Kiểm tra thực thể sống chống giả mạo (FR-ATT-01)
        if check_liveness:
            is_real, real_score, liveness_details = self.anti_spoofing.check_liveness(frame, bbox=(x1, y1, x2, y2))
            if not is_real:
                return {
                    "success": False,
                    "status": "SPOOFING_ATTEMPT",
                    "real_score": real_score,
                    "details": liveness_details,
                    "message": "Cảnh báo nghi vấn giả mạo sinh trắc học (SPOOFING_ATTEMPT)."
                }

        # Căn chỉnh & trích xuất vector 512D
        if hasattr(primary_face, "landmarks") and primary_face.landmarks is not None and len(primary_face.landmarks) == 5:
            aligned_face = self.aligner.align(frame, primary_face.landmarks, output_size=112)
        else:
            face_crop = frame[y1:y2, x1:x2]
            aligned_face = cv2.resize(face_crop, (112, 112))

        query_vector = self.recognizer.extract_features(aligned_face)

        # Chuẩn hóa gallery_database
        items: List[Tuple[str, np.ndarray]] = []
        if isinstance(gallery_database, dict):
            for k, v in gallery_database.items():
                items.append((k, np.asarray(v, dtype=np.float32).flatten()))
        elif isinstance(gallery_database, list):
            for item in gallery_database:
                if isinstance(item, tuple):
                    items.append((item[0], np.asarray(item[1], dtype=np.float32).flatten()))
                elif isinstance(item, dict):
                    emp_id = item.get("employee_id") or item.get("id")
                    emp_emb = item.get("embedding")
                    if emp_id and emp_emb is not None:
                        items.append((emp_id, np.asarray(emp_emb, dtype=np.float32).flatten()))

        if not items:
            return {
                "success": True,
                "status": "UNKNOWN",
                "matched_id": None,
                "similarity": 0.0,
                "message": "Cơ sở dữ liệu nhân viên rỗng."
            }

        # So khớp vector hóa
        ids = [item[0] for item in items]
        matrix = np.array([item[1] for item in items], dtype=np.float32)
        scores = np.dot(matrix, query_vector)

        best_idx = int(np.argmax(scores))
        best_score = float(scores[best_idx])
        best_id = ids[best_idx]
        is_match = best_score >= threshold

        return {
            "success": True,
            "status": "MATCHED" if is_match else "UNKNOWN",
            "is_match": is_match,
            "matched_id": best_id if is_match else None,
            "candidate_id": best_id,
            "similarity": best_score,
            "threshold": threshold,
            "bbox": [x1, y1, x2, y2],
            "message": f"Khớp nhân viên {best_id}" if is_match else "Người lạ (Dưới ngưỡng xác thực 0.70)"
        }
