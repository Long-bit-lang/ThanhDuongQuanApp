# THANH ĐƯỜNG QUÁN POS SYSTEM

Hệ thống quản lý bán hàng (POS) chuyên nghiệp dành cho mô hình quán nhậu Việt Nam, phục vụ đồng thời Nhân viên Phục vụ (Mobile Web PWA trên iPhone/Android), Thu ngân (SUNMI T1-G Desktop/Tablet POS) và Chủ quán (Quản trị & Báo cáo tài chính).

---

## 1. Công nghệ sử dụng

- **Backend**: Python 3.14/3.12+, FastAPI, SQLAlchemy 2.x Async, Alembic, PostgreSQL 16 (Docker Compose), Pydantic v2, Argon2id, PyJWT (HS256).
- **Frontend**: React 19, TypeScript, Vite, CSS Design System, Responsive Mobile-First & Tablet/Desktop Layout, Lucide React.
- **Realtime**: WebSocket Event Dispatcher tự động đồng bộ hóa trạng thái bàn, đơn gọi và thanh toán giữa các thiết bị.
- **In ấn & Phần cứng**: Cầu nối in hóa đơn nhiệt 80mm ESC/POS UTF-8, ZYWELL ZY-Q822 USB Adapter & máy POS SUNMI T1-G (Android 6.0.1).

---

## 2. Tài liệu kỹ thuật dự án (`documentation/`)

- [Kiến trúc hệ thống (ARCHITECTURE.md)](documentation/ARCHITECTURE.md)
- [Thiết kế Cơ sở dữ liệu 16 bảng (DATABASE_SCHEMA.md)](documentation/DATABASE_SCHEMA.md)
- [Đặc tả API Reference (API_REFERENCE.md)](documentation/API_REFERENCE.md)
- [Bảo mật & Phân quyền RBAC (SECURITY.md)](documentation/SECURITY.md)
- [Hướng dẫn triển khai mạng LAN & Docker (DEPLOYMENT.md)](documentation/DEPLOYMENT.md)
- [Tích hợp Máy in nhiệt ZYWELL & SUNMI T1-G (PRINTER_INTEGRATION.md)](documentation/PRINTER_INTEGRATION.md)
- [Báo cáo Kiểm thử tự động 43/43 Tests (TEST_REPORT.md)](documentation/TEST_REPORT.md)
- [Hướng dẫn vận hành nghiệp vụ (USER_GUIDE.md)](documentation/USER_GUIDE.md)
- [Hướng dẫn triển khai Online & Vận hành SUNMI/Điện thoại (DEPLOYMENT_AND_USER_GUIDE.md)](documentation/DEPLOYMENT_AND_USER_GUIDE.md)

---

## 3. Khởi động nhanh (Quick Start)

### 3.1. Khởi động PostgreSQL Container
```bash
docker compose -f infrastructure/compose.yaml up -d
```

### 3.2. Cập nhật Database & Khởi tạo Chủ quán
```bash
cd backend
source .venv/bin/activate
alembic upgrade head

# Khởi tạo tài khoản Chủ quán ban đầu (an toàn qua CLI)
PYTHONPATH=. python -m app.modules.identity.cli bootstrap-owner
```

### 3.3. Chạy Backend API Server
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3.4. Chạy Frontend POS Client
```bash
cd ../frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

---

## 4. Chạy kiểm thử tự động (Automated Tests)

```bash
# Backend test suite (43/43 tests passed)
PYTHONPATH=backend backend/.venv/bin/pytest backend/tests/ -v

# Frontend build & TypeScript check (0 errors)
cd frontend
npm run build
```

---

## 5. Quy tắc bảo vệ Codebase
- Thư mục `zywell-sdk/` là tài nguyên vendor được bảo vệ tuyệt đối: không sửa, xóa, format hoặc commit.
- Tiền tệ trong database luôn sử dụng `NUMERIC(14, 2)` / `Decimal`, không bao giờ dùng `float`.
- Lịch sử giao dịch, đơn hàng và thanh toán là bất biến (immutable), không xóa bản ghi phát sinh.
