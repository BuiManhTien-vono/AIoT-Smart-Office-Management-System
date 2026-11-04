"""
Shared Core Module - Chứa các tài nguyên dùng chung cho toàn bộ AI Service.
Bao gồm:
- Configs
- Inference Engines (ONNX, PyTorch,...)
- Tiện ích xử lý ảnh & Ring Buffer
"""

from .config import settings, Settings, SeatBox
