# AIoT-Smart-Office-Management-System

**Hệ thống Thị giác Máy tính Giám sát Văn phòng Thông minh (Hỗ trợ Chấm công Tự động, Giám sát Hiện diện Chỗ ngồi và An ninh Ngoài giờ)**

---

## 1. Cấu trúc Dự án (Project Structure)

```text
AIoT-Smart-Office-Management-System/
├── backend/                  # C# .NET 10 Modular Monolith (WebApi + 5 Modules + Infrastructure)
├── ai_service/               # Dịch vụ xử lý hình ảnh AI (Python 3.12, Nhận diện mặt & chỗ ngồi)
├── frontend/                 # Giao diện quản trị Web (React + TypeScript + Vite)
├── deploy/                   # Cấu hình Docker Compose & Nginx Reverse Proxy
├── docs/                     # Hồ sơ Phân tích & Thiết kế Hệ thống (Markdown & LaTeX)
│   ├── 01_YEU_CAU_HE_THONG.md
│   ├── 02_SO_DO_PHAN_RA_CHUC_NANG.md
│   ├── 03_THIET_KE_HE_THONG.md
│   ├── 04_THIET_KE_CO_SO_DU_LIEU.md
│   └── HO_SO_THIET_KE_HE_THONG.tex
└── PROJECT_REQUIREMENTS.md   # Đặc tả tổng hợp yêu cầu dự án
```

## 2. Công nghệ Sử dụng (Tech Stack)
- **Backend:** C# .NET (`ASP.NET Core WebAPI`, `SignalR`, kiến trúc `Modular Monolith`)
- **AI Service:** Python (`FastAPI`, nhận diện khuôn mặt & phát hiện hiện diện chỗ ngồi)
- **Frontend:** React + TypeScript (`Vite`, `HTML5 Canvas Zone Editor`)
- **Database & Storage:** PostgreSQL 16 + Cloudflare R2 / MinIO (S3-compatible)
- **DevOps:** Docker Compose, Nginx, Cloudflare SSL, GitHub Actions CI/CD

