"""
REST API Endpoints cho Module Face Recognition (Nhận diện Khuôn mặt).
Cung cấp API đăng ký mẫu ảnh, trích xuất vector 512D, đối soát trùng lặp và nhận diện điểm danh 1:N.
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
import cv2
import numpy as np

from modules.face_recognition.pipeline import FaceRecognitionPipeline
from modules.face_recognition.recognizer import compute_cosine_similarity
from shared.config import settings

router = APIRouter(prefix="/api/v1/face", tags=["Face Biometrics"])

pipeline = FaceRecognitionPipeline()

class DuplicateCheckRequest(BaseModel):
    new_embedding: List[float]
    existing_records: List[Dict[str, Any]] # [{"employee_id": "EMP-01", "embedding": [...]}]
    threshold: Optional[float] = None


@router.post("/extract-features")
async def extract_face_features(file: UploadFile = File(...)):
    """
    Nhận diện khuôn mặt & trích xuất vector 512 chiều từ ảnh tải lên (FR-BIO-03, FR-BIO-04).
    Kiểm tra độ sắc nét và kích thước khuôn mặt.
    """
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if image is None:
        raise HTTPException(status_code=400, detail="Không thể giải mã file ảnh.")

    result = pipeline.process_registration_photo(image)
    if not result.get("success"):
        raise HTTPException(status_code=422, detail=result)

    return result


@router.post("/verify-duplicate")
def verify_duplicate_biometrics(payload: DuplicateCheckRequest):
    """
    Kiểm tra trùng lặp sinh trắc học với CSDL nhân sự (FR-BIO-05).
    """
    threshold = payload.threshold or settings.face.similarity_threshold
    new_vec = np.array(payload.new_embedding, dtype=np.float32)

    db_embeddings = [
        (rec["employee_id"], np.array(rec["embedding"], dtype=np.float32))
        for rec in payload.existing_records
    ]

    is_duplicate, matched_id, max_sim = pipeline.verify_duplicate(
        new_embedding=new_vec,
        existing_embeddings=db_embeddings,
        threshold=threshold
    )

    return {
        "is_duplicate": is_duplicate,
        "matched_employee_id": matched_id,
        "similarity_score": round(max_sim, 4),
        "threshold": threshold,
        "warning": "Phát hiện nguy cơ trùng lặp hồ sơ" if is_duplicate else None
    }


@router.post("/liveness-check")
async def check_face_liveness(file: UploadFile = File(...)):
    """
    Kiểm tra thực thể sống chống giả mạo bằng MiniFASNet-V2 (FR-ATT-01).
    """
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if image is None:
        raise HTTPException(status_code=400, detail="Không thể giải mã file ảnh.")

    faces = pipeline.detector.detect(image)
    if len(faces) == 0:
        raise HTTPException(status_code=422, detail="Không tìm thấy khuôn mặt trong ảnh.")

    bbox = faces[0].bbox_pixel
    is_real, score, details = pipeline.anti_spoofing.check_liveness(image, bbox=bbox)
    return {
        "is_real": is_real,
        "real_score": round(score, 4),
        "details": details
    }
