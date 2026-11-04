"""
ONNX Runtime Engine - Bộ quản lý phiên suy luận ONNX chuẩn hóa.
Hỗ trợ tự động fallback CUDA -> CPU, thiết lập graph optimization và CUDA DLL trên Windows.
"""

import os
import sys
import numpy as np
from typing import List, Tuple, Optional, Dict, Any
from pathlib import Path

from .base_engine import BaseInferenceEngine

try:
    import onnxruntime as ort
except ImportError:
    ort = None


def setup_cuda_dll():
    """Hỗ trợ tự động nạp đường dẫn CUDA DLL trên Windows cho onnxruntime-gpu."""
    if sys.platform != "win32":
        return

    dll_dirs = []
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    # 1. Thư mục onnxruntime/capi trong virtualenv
    for venv_name in [".venv", "venv"]:
        ort_capi = os.path.join(base_dir, venv_name, "Lib", "site-packages", "onnxruntime", "capi")
        if os.path.exists(ort_capi):
            dll_dirs.append(ort_capi)

    # 2. CUDA_PATH từ biến môi trường hệ thống
    cuda_path = os.environ.get("CUDA_PATH", "")
    if cuda_path and os.path.exists(os.path.join(cuda_path, "bin")):
        dll_dirs.append(os.path.join(cuda_path, "bin"))

    for d in dll_dirs:
        if hasattr(os, "add_dll_directory"):
            try:
                os.add_dll_directory(d)
            except Exception:
                pass
        os.environ["PATH"] = d + os.pathsep + os.environ.get("PATH", "")


# Kích hoạt CUDA DLL tự động
setup_cuda_dll()


class OnnxEngine(BaseInferenceEngine):
    """
    Quản lý một phiên suy luận ONNX Runtime chuẩn hóa, tái sử dụng cho mọi mô hình
    (RT-DETR, Face Detector, ArcFace, Anti-Spoofing).
    """

    def __init__(
        self,
        model_path: str,
        use_cpu: bool = False,
        preferred_providers: Optional[List[str]] = None
    ):
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Không tìm thấy file mô hình ONNX tại: {os.path.abspath(model_path)}")

        if ort is None:
            raise ImportError(
                "Chưa cài đặt thư viện 'onnxruntime'. Vui lòng chạy: pip install onnxruntime hoặc onnxruntime-gpu"
            )

        self.model_path = model_path
        self.use_cpu = use_cpu

        available = ort.get_available_providers()
        if self.use_cpu:
            providers = ["CPUExecutionProvider"]
        elif preferred_providers:
            providers = [p for p in preferred_providers if p in available]
        else:
            providers = [p for p in ["CUDAExecutionProvider", "CPUExecutionProvider"] if p in available]

        if not providers:
            providers = ["CPUExecutionProvider"]

        session_options = ort.SessionOptions()
        session_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        self.session = ort.InferenceSession(self.model_path, sess_options=session_options, providers=providers)
        self._active_provider = self.session.get_providers()[0]
        self._is_gpu = "CUDA" in self._active_provider

        # Đọc thông số metadata
        self.input_names = [inp.name for inp in self.session.get_inputs()]
        self.input_shapes = [inp.shape for inp in self.session.get_inputs()]
        self.output_names = [out.name for out in self.session.get_outputs()]
        self.output_shapes = [out.shape for out in self.session.get_outputs()]

    @property
    def active_provider(self) -> str:
        return self._active_provider

    @property
    def device_name(self) -> str:
        return "GPU (CUDA)" if self._is_gpu else "CPU"

    def run(self, input_feed: Dict[str, np.ndarray]) -> List[np.ndarray]:
        """Thực thi suy luận với feed dict chuẩn ONNX."""
        return self.session.run(None, input_feed)

    def warmup(self, dummy_shape: Tuple[int, ...], dtype: np.dtype = np.float32):
        """Warm-up session để tránh trễ frame đầu tiên."""
        input_name = self.input_names[0]
        dummy = np.zeros(dummy_shape, dtype=dtype)
        _ = self.session.run(None, {input_name: dummy})
