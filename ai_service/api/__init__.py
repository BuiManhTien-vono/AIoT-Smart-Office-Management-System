"""
FastAPI Routes & REST API Interface cho AI Service.
"""

try:
    from .routes_occupancy import router as occupancy_router
    from .routes_face import router as face_router
except ImportError:
    occupancy_router = None
    face_router = None
