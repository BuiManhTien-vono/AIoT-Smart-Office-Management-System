FROM python:3.12-slim

WORKDIR /app

# Cài đặt thư viện nền tối thiểu cho ONNX Runtime & OpenCV Headless, curl cho healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Thư mục trọng số ONNX theo đúng đường dẫn trong shared/config.py (được mount volume trong docker-compose)
RUN mkdir -p /app/modules/occupancy/weights /app/modules/face_recognition/weights

EXPOSE 8000

# Khởi chạy ở chế độ FastAPI Web Server (Headless Container Mode)
CMD ["python", "main.py", "--api", "--host", "0.0.0.0", "--port", "8000"]
