"""
Abstract Base Inference Engine Interface.
Định nghĩa quy chuẩn chung cho mọi runtime suy luận (ONNX Runtime, TensorRT, PyTorch, OpenVINO).
"""

from abc import ABC, abstractmethod
from typing import Any, List, Dict, Optional

class BaseInferenceEngine(ABC):
    """Lớp cơ sở cho mọi engine suy luận AI."""

    @abstractmethod
    def run(self, input_data: Any) -> Any:
        """Thực thi suy luận trên tensor đầu vào."""
        pass

    @property
    @abstractmethod
    def active_provider(self) -> str:
        """Tên backend đang thực thi (CUDAExecutionProvider, CPUExecutionProvider, ...)."""
        pass

    @property
    @abstractmethod
    def device_name(self) -> str:
        """Tên thiết bị phần cứng (GPU CUDA hoặc CPU)."""
        pass
