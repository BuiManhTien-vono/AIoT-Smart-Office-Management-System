"""
Bộ đệm vòng Circular Ring Buffer lưu trữ khung hình trong RAM.
Dung lượng cố định (mặc định 150 frames ~ 10 giây ở 15 FPS),
tự động ghi đè khung hình cũ nhất, đảm bảo an toàn bộ nhớ không rò rỉ RAM.
"""

import cv2
import numpy as np
from collections import deque
from typing import List, Optional
import threading

class CircularRingBuffer:
    def __init__(self, capacity: int = 150):
        self.capacity = capacity
        self.buffer = deque(maxlen=capacity)
        self.lock = threading.Lock()

    def append(self, frame: np.ndarray):
        """Thêm 1 frame mới vào bộ đệm vòng (luôn giữ tối đa `capacity` frames)."""
        with self.lock:
            self.buffer.append(frame.copy())

    def get_all_frames(self) -> List[np.ndarray]:
        """Lấy toàn bộ danh sách frame hiện có trong bộ đệm."""
        with self.lock:
            return list(self.buffer)

    def size(self) -> int:
        with self.lock:
            return len(self.buffer)

    def clear(self):
        with self.lock:
            self.buffer.clear()

    def export_clip(self, output_path: str, fps: float = 15.0) -> bool:
        """Trích xuất toàn bộ các khung hình trong buffer thành video tệp MP4."""
        with self.lock:
            frames = list(self.buffer)

        if not frames:
            return False

        h, w = frames[0].shape[:2]
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(output_path, fourcc, fps, (w, h))

        for f in frames:
            writer.write(f)

        writer.release()
        return True
