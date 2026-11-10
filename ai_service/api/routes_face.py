"""
REST API Endpoints cho Module Face Recognition (Nhận diện Khuôn mặt).
Cung cấp API đăng ký mẫu ảnh, trích xuất vector 512D, đối soát trùng lặp,
kiểm tra thực thể sống (MiniFASNet-V2) và luồng chấm công / trực đêm tự động nối sang Backend .NET 10.
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
import cv2
import numpy as np

from modules.face_recognition.pipeline import FaceRecognitionPipeline
from modules.face_recognition.recognizer import compute_cosine_similarity
from shared.config import settings
from shared.backend_client import BackendSyncClient

router = APIRouter(prefix="/api/v1/face", tags=["Face Biometrics"])

pipeline = FaceRecognitionPipeline()
backend_client = BackendSyncClient()


class DuplicateCheckRequest(BaseModel):
    new_embedding: List[float]
    existing_records: List[Dict[str, Any]]  # [{"employee_id": "EMP-01", "embedding": [...]}]
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


@router.post("/gate-checkin")
async def gate_camera_checkin(
    file: UploadFile = File(...),
    gate_camera_id: Optional[str] = Form(default=None),
    camera_id: Optional[str] = Form(default=None),
    snapshot_object_key: Optional[str] = Form(default=None)
):
    """
    Luồng liên thông End-to-End tại Camera Cửa (AI Service -> Backend .NET 10):
    1. Phát hiện khuôn mặt (SCRFD) & Kiểm tra thực thể sống (MiniFASNet-V2).
    2. Nếu phát hiện giả mạo (Spoofing) -> Gọi POST /api/v1/security/incidents trên Backend .NET.
    3. Nếu là người thật -> Căn chỉnh Affine 112x112 & Trích xuất vector 512D (ArcFace).
    4. Gọi POST /api/v1/biometrics/identify trên Backend .NET để định danh 1:N.
    5. Nếu khớp nhân viên -> Tự động gọi POST /api/v1/attendance/check để chấm công!
    """
    effective_camera_id = gate_camera_id or camera_id
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if image is None:
        raise HTTPException(status_code=400, detail="Không thể giải mã file ảnh.")

    faces = pipeline.detector.detect(image)
    if len(faces) == 0:
        raise HTTPException(status_code=422, detail="Không tìm thấy khuôn mặt trong khung hình.")

    primary_face = faces[0]
    bbox = primary_face.bbox_pixel

    # 1. Kiểm tra chống giả mạo sinh trắc học (FR-ATT-01)
    is_real, real_score, liveness_details = pipeline.anti_spoofing.check_liveness(image, bbox=bbox)
    if not is_real:
        try:
            incident = backend_client.report_security_incident(
                camera_id=effective_camera_id or settings.face.default_gate_camera_id,
                department_id=settings.face.default_department_id,
                is_spoofing_attempt=True,
                snapshot_object_key=snapshot_object_key
            )
        except Exception as exc:
            incident = {"error": str(exc)}

        return {
            "success": False,
            "status": "SPOOFING_ATTEMPT",
            "liveness": liveness_details,
            "security_incident": incident
        }

    # 2. Căn chỉnh Affine 5 điểm mốc & Trích xuất vector 512 chiều chuẩn hóa L2
    if hasattr(primary_face, "landmarks") and primary_face.landmarks is not None and len(primary_face.landmarks) == 5:
        aligned_face = pipeline.aligner.align(image, primary_face.landmarks, output_size=112)
    else:
        x1, y1, x2, y2 = bbox
        aligned_face = cv2.resize(image[y1:y2, x1:x2], (112, 112))

    embedding = pipeline.recognizer.extract_features(aligned_face).tolist()

    # 3. Gọi sang Backend .NET để so khớp 1:N và chấm công
    try:
        identify_res = backend_client.identify_employee_on_backend(embedding=embedding, threshold=0.65)
        is_matched = identify_res.get("isMatched", False)
        employee_id = identify_res.get("employeeId")
        similarity = float(identify_res.get("similarity") or identify_res.get("maxSimilarity") or 0.0)
        identify_res["similarity"] = similarity

        if not is_matched or not employee_id:
            return {
                "success": True,
                "status": "UNKNOWN_PERSON",
                "liveness_score": round(real_score, 4),
                "identification": identify_res
            }

        attendance_res = backend_client.check_in_out_on_backend(
            employee_id=str(employee_id),
            match_confidence=max(similarity, 0.75),
            gate_camera_id=effective_camera_id,
            snapshot_object_key=snapshot_object_key
        )
        return {
            "success": True,
            "status": "CHECKED_IN_OUT",
            "liveness_score": round(real_score, 4),
            "identification": identify_res,
            "attendance": attendance_res
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
