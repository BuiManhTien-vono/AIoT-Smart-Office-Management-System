"""
AI Service Package Initialization.
Tự động cấu hình sys.path để hỗ trợ import nội bộ linh hoạt
cả khi chạy trực tiếp trong ai_service/ lẫn khi import từ thư mục gốc của dự án.
"""

import sys
from pathlib import Path

PACKAGE_DIR = Path(__file__).resolve().parent
if str(PACKAGE_DIR) not in sys.path:
    sys.path.insert(0, str(PACKAGE_DIR))
