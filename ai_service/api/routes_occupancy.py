"""
REST API Endpoints cho Module Occupancy (Giám sát Chỗ ngồi).
"""

from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
from pydantic import BaseModel

from shared.config import settings, SeatBox
from modules.occupancy.fsm import SeatStatus

router = APIRouter(prefix="/api/v1/occupancy", tags=["Occupancy Monitoring"])

class SeatConfigurationRequest(BaseModel):
    seats: List[SeatBox]

@router.get("/seats")
def get_configured_seats():
    """Lấy danh sách các bàn làm việc đang được cấu hình."""
    return {
        "status": "success",
        "seats": [seat.model_dump() if hasattr(seat, "model_dump") else seat.dict() for seat in settings.default_seats]
    }

@router.get("/status")
def get_occupancy_status():
    """Lấy trạng thái tổng quan các ghế (EMPTY, PRESENT, TEMP_AWAY, PROLONGED_AWAY)."""
    return {
        "status": "success",
        "active_mode": "ASYNC_STREAM",
        "seats_count": len(settings.default_seats),
        "alert_threshold_sec": settings.away_alert_seconds
    }
