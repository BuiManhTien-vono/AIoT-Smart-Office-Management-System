"""
Module Nhận diện Khuôn mặt (Face Recognition & Biometrics).
"""

from .detector import SCRFDFaceDetector, FaceDetection
from .aligner import FaceAligner
from .recognizer import ArcFaceRecognizer, compute_cosine_similarity
from .anti_spoofing import AntiSpoofingChecker
from .pipeline import FaceRecognitionPipeline
