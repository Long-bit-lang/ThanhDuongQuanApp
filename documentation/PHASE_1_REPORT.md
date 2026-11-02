# Báo cáo Triển khai Phase 1: Khởi tạo Nền tảng (Platform Foundation)

**Dự án:** Thanh Đường Quán POS (`ThanhDuongQuanApp`)  
**Ngày thực hiện:** 01/11/2026  
**Môi trường:** Ubuntu 26.04.1 LTS (x86_64), Python 3.14.4, Node.js v24.22.0, Docker 29.1.3, Docker Compose v2.40.3  

---

## 1. Tổng quan công việc đã thực hiện

Trong Phase 1, toàn bộ bộ khung nền tảng cho hệ thống POS quản lý quán nhậu Thanh Đường Quán đã được thiết lập, kiểm thử và vận hành đồng bộ trên máy cục bộ Ubuntu theo đúng định hướng kiến trúc **Modular Monolith** đã thống nhất:

1. **Hạ tầng (Infrastructure):**
   - Thiết lập cấu hình `infrastructure/compose.yaml` chạy dịch vụ **PostgreSQL 16 Alpine** có healthcheck và volume lưu trữ bền vững `postgres_data`.
   - Tạo mẫu biến môi trường chuẩn hóa `.env.example` ở cả thư mục gốc và `infrastructure/`.
   - Thiết lập `.gitignore` bảo vệ các file bảo mật (`.env`), môi trường ảo (`.venv`), thư mục build (`dist`), và dependencies (`node_modules`).

2. **Backend (FastAPI + SQLAlchemy 2.x + Alembic):**
   - Xây dựng backend FastAPI theo kiến trúc Modular Monolith.
   - Quản lý cấu hình tập trung qua **Pydantic Settings** (`app.core.config`), tự động nạp `.env` và hỗ trợ cả cấu hình CORS đa nguồn (hỗ trợ truy cập mạng nội bộ LAN `192.168.1.22`).
   - Tích hợp **SQLAlchemy 2.x asyncpg** cho tầng kết nối bất đồng bộ (`app.db.session`), hỗ trợ kiểm tra kết nối `SELECT 1` và đo độ trễ truy vấn trực tiếp.
   - Tách biệt rõ ràng tầng Service (`HealthService`) và tầng Router (`API v1`), không đặt logic nghiệp vụ trong route.
   - Thiết lập hệ thống migration **Alembic** với template async, cấu hình `alembic/env.py` liên kết động tới app settings và `Base.metadata`.
   - Khởi tạo khung phân vùng cho 9 domain modules nghiệp vụ theo tài liệu `ARCHITECTURE.md`: `identity`, `catalog`, `floor`, `service`, `billing`, `payments`, `reporting`, `printing`, `audit`.
   - Chuẩn bị sẵn bộ khung kết nối thời gian thực **WebSocket Event Bus** (`app.core.events.ws_manager` và route `/ws/{channel}`) sẵn sàng cho Phase 4.

3. **Frontend (React + TypeScript + Vite):**
   - Khởi tạo ứng dụng React 19 + TypeScript với Vite, biên dịch tối ưu (Zero errors/warnings).
   - Thiết kế giao diện khung chuẩn **Night Lounge / Quán Nhậu** với hệ thống Design Token CSS thuần (Glassmorphism, hiệu ứng chuyển màu ánh vàng hổ phách `amber-gold` và nền tối sang trọng).
   - Thiết kế linh hoạt (Responsive layout) tối ưu cho cả 3 nhóm thiết bị: **Desktop (Owner/Thu ngân)**, **Tablet / SUNMI POS T1-G**, và **Điện thoại di động (Nhân viên phục vụ/Waiter)**.
   - Không hardcode URL backend: Cấu hình `VITE_API_BASE_URL` và `VITE_WS_URL` qua file môi trường.
   - Tích hợp dashboard kiểm tra trực quan trạng thái Backend API, PostgreSQL database (đo độ trễ ms), và công cụ gửi nhận tin nhắn WebSocket thời gian thực trực tiếp trên trình duyệt.

---

## 2. Cấu trúc thư mục sau khi triển khai

```text
sunmi-pos-development/
├── .env.example                          # Mẫu cấu hình biến môi trường chuẩn
├── .gitignore                            # Cấu hình bỏ qua git, không commit .env
├── README.md                             # Tài liệu tổng quan dự án
├── backend/                              # Ứng dụng FastAPI Backend
│   ├── alembic/                          # Quản lý Database Migration
│   │   ├── versions/
│   │   │   └── dba1c6902988_initial_phase1_baseline.py
│   │   ├── env.py
│   │   ├── script.py.mako
│   │   └── README
│   ├── alembic.ini                       # Cấu hình Alembic CLI
│   ├── app/                              # Mã nguồn ứng dụng
│   │   ├── __init__.py
│   │   ├── main.py                       # FastAPI entrypoint, CORS, lifespan, WebSocket
│   │   ├── api/                          # Tầng API HTTP & Routing
│   │   │   ├── __init__.py
│   │   │   └── v1/
│   │   │       ├── __init__.py
│   │   │       ├── router.py             # Router tổng hợp v1
│   │   │       └── endpoints/
│   │   │           ├── __init__.py
│   │   │           └── health.py         # Endpoints kiểm tra sức khỏe hệ thống
│   │   ├── core/                         # Cấu hình trung tâm, sự kiện, security
│   │   │   ├── __init__.py
│   │   │   ├── config.py                 # Pydantic Settings
│   │   │   └── events.py                 # WebSocket Connection Manager & Event Bus
│   │   ├── db/                           # Tầng cơ sở dữ liệu SQLAlchemy 2.x
│   │   │   ├── __init__.py
│   │   │   ├── base.py                   # DeclarativeBase & TimestampMixin
│   │   │   └── session.py                # AsyncEngine, Session, Ping probe
│   │   ├── modules/                      # Phân vùng Modular Monolith
│   │   │   ├── __init__.py
│   │   │   ├── audit/__init__.py         # Append-only audit log
│   │   │   ├── billing/__init__.py       # Hóa đơn & giảm giá
│   │   │   ├── catalog/__init__.py       # Danh mục & món ăn
│   │   │   ├── floor/__init__.py         # Quản lý 50 bàn
│   │   │   ├── identity/__init__.py      # Phân quyền 3 role & tài khoản
│   │   │   ├── payments/__init__.py      # Thanh toán tiền mặt / VietQR mock
│   │   │   ├── printing/__init__.py      # Render hóa đơn & mock in
│   │   │   ├── reporting/__init__.py     # Báo cáo doanh thu
│   │   │   └── service/__init__.py       # Service session, gọi món, hủy món
│   │   └── services/                     # Application Services
│   │       ├── __init__.py
│   │       └── health_service.py         # Logic nghiệp vụ thăm dò sức khỏe hệ thống
│   ├── pytest.ini                        # Cấu hình Pytest
│   ├── requirements.txt                  # Danh mục dependencies Python
│   └── tests/                            # Bộ kiểm thử tự động
│       ├── __init__.py
│       ├── conftest.py                   # Pytest fixtures & HTTP client
│       ├── test_db_connection.py         # Kiểm thử truy vấn DB
│       ├── test_health.py                # Kiểm thử các API health check
│       └── test_websocket.py             # Kiểm thử kết nối WebSocket
├── frontend/                             # Ứng dụng React TypeScript Vite
│   ├── .env.example                      # Mẫu biến môi trường cho Frontend
│   ├── index.html                        # HTML entrypoint, Google Fonts
│   ├── package.json                      # Danh mục gói phụ thuộc npm
│   ├── tsconfig.json                     # Cấu hình TypeScript
│   ├── vite.config.ts                    # Cấu hình máy chủ Vite (host 0.0.0.0)
│   └── src/
│       ├── main.tsx                      # React root mounting
│       ├── index.css                     # Design tokens & glassmorphism styling
│       ├── app/
│       │   ├── App.tsx                   # Main Dashboard component
│       │   └── config.ts                 # Runtime environment configuration
│       ├── features/
│       │   ├── dashboard/                # Khung dashboard tổng quan
│       │   │   └── components/
│       │   │       ├── DevicePreview.tsx # Giao diện kiểm thử thích ứng thiết bị
│       │   │       └── SystemOverview.tsx# Sơ đồ trực quan các module
│       │   └── health/                   # Feature hiển thị sức khỏe hệ thống
│       │       ├── types.ts              # TypeScript interfaces
│       │       ├── components/
│       │       │   ├── DatabaseStatus.tsx# Card trạng thái PostgreSQL
│       │       │   └── HealthCard.tsx    # Card trạng thái FastAPI
│       │       └── hooks/
│       │           └── useHealthCheck.ts # Hook tự động thăm dò API định kỳ
│       └── shared/
│           ├── api/
│           │   └── client.ts             # Typed HTTP fetch client
│           ├── components/
│           │   ├── Button.tsx            # Button component
│           │   ├── Card.tsx              # Card container glassmorphic
│           │   ├── Header.tsx            # Top navigation bar
│           │   └── StatusBadge.tsx       # Status pill badge với animation
│           └── hooks/
│               └── useWebSocket.ts       # Hook kết nối WebSocket realtime
├── infrastructure/                       # Cấu hình hạ tầng cục bộ
│   ├── .env.example
│   └── compose.yaml                      # Docker Compose cho PostgreSQL 16
└── documentation/                        # Tài liệu dự án
    ├── ARCHITECTURE.md
    ├── BUSINESS_RULES.md
    ├── DEVELOPMENT_PLAN.md
    ├── ENVIRONMENT_REPORT.md
    ├── PROJECT_OVERVIEW.md
    └── PHASE_1_REPORT.md                 # Báo cáo kết quả Phase 1 (file này)
```

---

## 3. Danh sách các file được tạo mới và chỉnh sửa

| Đường dẫn file | Thao tác | Mô tả |
| --- | :---: | --- |
| `.gitignore` | Tạo mới | Bỏ qua `.env`, `.venv`, `node_modules`, `dist`, `__pycache__` |
| `.env.example` | Tạo mới | Mẫu biến môi trường gốc cho backend, frontend và postgres |
| `infrastructure/compose.yaml` | Tạo mới | Docker Compose dịch vụ `postgres:16-alpine` |
| `infrastructure/.env.example` | Tạo mới | Mẫu biến môi trường cho infrastructure |
| `backend/requirements.txt` | Tạo mới | Khai báo các thư viện Python: FastAPI, SQLAlchemy, Alembic, asyncpg, psycopg, v.v. |
| `backend/pytest.ini` | Tạo mới | Cấu hình Pytest & asyncio mode |
| `backend/app/core/config.py` | Tạo mới | Pydantic Settings đọc biến môi trường |
| `backend/app/core/events.py` | Tạo mới | WebSocket Connection Manager |
| `backend/app/db/base.py` | Tạo mới | SQLAlchemy DeclarativeBase & TimestampMixin |
| `backend/app/db/session.py` | Tạo mới | Async engine, sessionmaker, ping function |
| `backend/app/services/health_service.py` | Tạo mới | Application service kiểm tra sức khỏe hệ thống |
| `backend/app/api/v1/endpoints/health.py` | Tạo mới | API endpoints `/health`, `/health/db`, `/health/live`, `/health/ready` |
| `backend/app/api/v1/router.py` | Tạo mới | Master router v1 |
| `backend/app/main.py` | Tạo mới | FastAPI app, CORS, lifespan, WebSocket route |
| `backend/alembic.ini` | Tạo mới | Cấu hình Alembic |
| `backend/alembic/env.py` | Tạo mới | Script chạy migration bất đồng bộ |
| `backend/alembic/versions/dba1c6902988_initial_phase1_baseline.py` | Tạo mới | Migration baseline đầu tiên của Phase 1 |
| `backend/tests/conftest.py` | Tạo mới | Pytest fixtures cho AsyncClient và DB session |
| `backend/tests/test_health.py` | Tạo mới | Test suite cho các endpoint health check |
| `backend/tests/test_db_connection.py` | Tạo mới | Test suite cho kết nối cơ sở dữ liệu |
| `backend/tests/test_websocket.py` | Tạo mới | Test suite cho kết nối WebSocket |
| `frontend/.env.example` | Tạo mới | Mẫu cấu hình frontend (`VITE_API_BASE_URL`, `VITE_WS_URL`) |
| `frontend/vite.config.ts` | Tạo mới | Cấu hình Vite host 0.0.0.0, port 5173 |
| `frontend/index.html` | Cập nhật | Tiêu đề tiếng Việt, Google Fonts Plus Jakarta Sans |
| `frontend/src/index.css` | Tạo mới | Hệ thống Design System CSS thuần (Dark Lounge theme) |
| `frontend/src/app/config.ts` | Tạo mới | Nạp biến môi trường cho ứng dụng React |
| `frontend/src/app/App.tsx` | Tạo mới | Giao diện Dashboard khung Phase 1 |
| `frontend/src/main.tsx` | Cập nhật | Điểm khởi chạy React app |
| `frontend/src/shared/api/client.ts` | Tạo mới | HTTP API fetch client |
| `frontend/src/shared/hooks/useWebSocket.ts` | Tạo mới | Hook kết nối WebSocket realtime |
| `frontend/src/shared/components/*` | Tạo mới | Header, Card, Button, StatusBadge |
| `frontend/src/features/health/*` | Tạo mới | Hook & Component theo dõi sức khỏe API & Database |
| `frontend/src/features/dashboard/*` | Tạo mới | Sơ đồ hệ thống & giao diện kiểm thử responsive |
| `documentation/PHASE_1_REPORT.md` | Tạo mới | Báo cáo chi tiết hoàn thành Phase 1 |

---

## 4. Kiến trúc đã triển khai

Hệ thống tuân thủ mô hình **Modular Monolith** được quy định trong `documentation/ARCHITECTURE.md`:

```text
React Client (Desktop / Mobile / SUNMI)
        │ REST API (Fetch) + WebSocket
        ▼
FastAPI API Layer (app.api.v1)
        ▼
Application Services (app.services.health_service)
        ▼
Domain Modules (app.modules.{identity, catalog, floor, service, billing, payments, reporting, printing, audit})
        ▼
Database Layer (app.db.session, SQLAlchemy 2.x AsyncEngine + asyncpg)
        ▼
PostgreSQL 16 (Docker Compose Container: thanh_duong_postgres)
```

- **Tính phân tách rõ ràng:** Router chỉ làm nhiệm vụ tiếp nhận HTTP request, gọi Application Service xử lý, và trả về dữ liệu chuẩn hóa.
- **Không hardcode:** URL backend, database URL, cổng kết nối và CORS origins hoàn toàn điều khiển qua biến môi trường.
- **Chuẩn bị sẵn sàng cho các phase sau:**
  - WebSocket bus đã hoạt động, sẵn sàng cho Phase 4 phát sự kiện đồng bộ bàn và đơn hàng.
  - Phân vùng thư mục các module đã tạo sẵn, đảm bảo không lẫn lộn ranh giới nghiệp vụ.

---

## 5. Danh sách các API hiện có

| Phương thức | Đường dẫn (Endpoint) | Mục đích | Trạng thái phản hồi |
| :---: | :--- | :--- | :---: |
| `GET` | `/` | Trả về thông tin ứng dụng, phiên bản và đường dẫn docs | `200 OK` |
| `GET` | `/health` | Endpoint thăm dò nhanh cho Docker/Load Balancer | `200 OK` / `503 Service Unavailable` |
| `GET` | `/api/v1/health` | Báo cáo chi tiết sức khỏe máy chủ, thời gian, và độ trễ DB | `200 OK` / `503 Service Unavailable` |
| `GET` | `/api/v1/health/db` | Thăm dò trực tiếp cơ sở dữ liệu PostgreSQL (kèm độ trễ ms) | `200 OK` / `503 Service Unavailable` |
| `GET` | `/api/v1/health/live` | Liveness probe (kiểm tra tiến trình còn sống) | `200 OK` |
| `GET` | `/api/v1/health/ready` | Readiness probe (kiểm tra DB sẵn sàng phục vụ) | `200 OK` / `503 Service Unavailable` |
| `GET` | `/docs` | Tài liệu tương tác Swagger UI | `200 OK` |
| `GET` | `/redoc` | Tài liệu ReDoc | `200 OK` |
| `GET` | `/api/v1/openapi.json` | OpenAPI Schema v3 | `200 OK` |
| `WS` | `/ws/{channel}` | Kênh WebSocket hai chiều thời gian thực | `101 Switching Protocols` |

---

## 6. Cấu hình Database & Kết quả Migration

- **Container:** `thanh_duong_postgres` (Image: `postgres:16-alpine`)
- **Port:** `5432:5432`
- **Database Name:** `thanh_duong_pos`
- **User:** `pos_user`
- **Volume:** `postgres_data` (Lưu trữ bền vững trên ổ đĩa local)
- **Engine kết nối ứng dụng:** SQLAlchemy 2.x với driver `asyncpg` (`postgresql+asyncpg://...`)
- **Engine cho Migration:** SQLAlchemy 2.x với driver `psycopg` (`postgresql+psycopg://...`)
- **Alembic Migration:**
  - Revision khởi tạo: `dba1c6902988_initial_phase1_baseline.py`
  - Lệnh thực thi: `alembic upgrade head`
  - Kết quả kiểm tra phiên bản:
    ```text
    INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
    INFO  [alembic.runtime.migration] Will assume transactional DDL.
    dba1c6902988 (head)
    ```

---

## 7. Kết quả kiểm thử bắt buộc

Tất cả 7 yêu cầu kiểm thử bắt buộc đã được thực thi và chứng minh kết quả thực tế:

| STT | Nội dung kiểm thử | Phương thức kiểm tra | Kết quả thực tế | Đánh giá |
| :---: | :--- | :--- | :--- | :---: |
| 1 | Backend khởi động thành công | Chạy Uvicorn trên cổng 8000 | `Uvicorn running on http://0.0.0.0:8000` | **ĐẠT** |
| 2 | Frontend khởi động thành công | Chạy Vite dev server trên cổng 5173 | `VITE ready in 186 ms (http://localhost:5173)` | **ĐẠT** |
| 3 | Frontend có thể gọi backend | HTTP Request từ client tới `/api/v1/health` | HTTP `200 OK`, JSON payload hợp lệ | **ĐẠT** |
| 4 | Backend kết nối PostgreSQL | Query `SELECT 1` và `SELECT version()` | Độ trễ 1.12ms - 1.91ms, database `thanh_duong_pos` | **ĐẠT** |
| 5 | Alembic thực hiện migration | Lệnh `alembic upgrade head` | `Running upgrade -> dba1c6902988 (head)` | **ĐẠT** |
| 6 | API health check trả về hợp lệ | Kiểm tra toàn bộ 5 endpoints health probe | Toàn bộ trả về `200 OK` với dữ liệu chính xác | **ĐẠT** |
| 7 | Các bài kiểm thử cơ bản chạy | Chạy Pytest toàn bộ thư mục `tests/` | **8/8 bài kiểm thử PASS (0.19s)** | **ĐẠT** |

Chi tiết kết quả chạy Pytest tự động:
```text
============================= test session starts ==============================
platform linux -- Python 3.14.4, pytest-9.2.0, pluggy-1.7.0
rootdir: /home/nhlong/Projects/sunmi-pos-development/backend
configfile: pytest.ini
testpaths: tests
plugins: anyio-4.15.1, asyncio-1.4.1

tests/test_db_connection.py::test_database_direct_query PASSED           [ 12%]
tests/test_db_connection.py::test_check_db_connection_function PASSED    [ 25%]
tests/test_health.py::test_root_endpoint PASSED                          [ 37%]
tests/test_health.py::test_direct_health_endpoint PASSED                 [ 50%]
tests/test_health.py::test_api_v1_health_endpoint PASSED                 [ 62%]
tests/test_health.py::test_api_v1_health_db_endpoint PASSED              [ 75%]
tests/test_health.py::test_liveness_and_readiness_probes PASSED          [ 87%]
tests/test_websocket.py::test_websocket_channel_echo PASSED              [100%]

========================= 8 passed, 1 warning in 0.19s =========================
```

---

## 8. Những lỗi còn tồn tại

- Không có lỗi mã nguồn hoặc lỗi biên dịch nào còn tồn tại trong codebase Phase 1.
- Toàn bộ TypeScript, FastAPI, PostgreSQL và Alembic vận hành ổn định.

---

## 9. Vấn đề môi trường và ghi chú quyền hạn

1. **Quyền hạn truy cập Docker Daemon (`/var/run/docker.sock`):**
   - User `nhlong` đã nằm trong nhóm `docker` (`gid=116:nhlong`).
   - Do shell/tiến trình nền kế thừa session ban đầu trước khi cập nhật group, các lệnh docker trực tiếp trong sub-shell có thể cần sử dụng `sg docker -c "<lệnh>"` hoặc người dùng chỉ cần đăng xuất (logout) rồi đăng nhập lại máy Ubuntu để nhóm `docker` có hiệu lực toàn hệ thống mà không cần dùng `sg` hay `sudo`.

---

## 10. Hướng dẫn chạy dự án trên Ubuntu

### Bước 1: Khởi động Cơ sở dữ liệu PostgreSQL
```bash
# Sử dụng nhóm docker (hoặc docker compose trực tiếp nếu đã relogin)
sg docker -c "docker compose -f infrastructure/compose.yaml --env-file .env up -d"
```

### Bước 2: Khởi động Backend FastAPI
```bash
cd /home/nhlong/Projects/sunmi-pos-development/backend

# Kích hoạt môi trường ảo
source .venv/bin/activate

# Chạy migration nếu có thay đổi
alembic upgrade head

# Khởi chạy server FastAPI
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Bước 3: Khởi động Frontend React
```bash
cd /home/nhlong/Projects/sunmi-pos-development/frontend

# Khởi chạy Vite Dev Server
npm run dev
```

---

## 11. Đường dẫn truy cập ứng dụng cục bộ

- **Giao diện người dùng Frontend (Desktop):** `http://localhost:5173/`
- **Giao diện qua mạng nội bộ LAN (Điện thoại / SUNMI POS):** `http://192.168.1.22:5173/`
- **Backend API Root:** `http://localhost:8000/`
- **Swagger UI API Documentation:** `http://localhost:8000/docs`
- **ReDoc API Documentation:** `http://localhost:8000/redoc`
- **API Health Check Endpoint:** `http://localhost:8000/api/v1/health`
- **PostgreSQL Database Direct Probe:** `http://localhost:8000/api/v1/health/db`
- **WebSocket Channel Probe:** `ws://localhost:8000/ws/floor`

---

## 12. Những nội dung chưa triển khai (Dành cho các Phase tiếp theo)

Theo quy định ranh giới nghiêm ngặt của Phase 1, các tính năng nghiệp vụ sau **chưa được xây dựng** và sẽ được thực hiện tuần tự trong các giai đoạn tiếp theo:

- **Phase 2:** Xác thực (Authentication), phân quyền 3 vai trò (Owner, Cashier, Waiter), quản lý tài khoản nhân viên.
- **Phase 3:** Khởi tạo dữ liệu mẫu 50 bàn (`floor`), danh mục thực đơn và trạng thái món ăn (`catalog`).
- **Phase 4:** Quản lý phiên phục vụ (`service sessions`), gọi món theo mẻ, ghi chú món, hủy món và sự kiện WebSocket đồng bộ giao diện hai chiều.
- **Phase 5:** Lịch sử ghép bàn, tách bàn, chuyển món giữa các bàn.
- **Phase 6:** Hóa đơn, chiết khấu phần trăm/số tiền, điều chỉnh sau thanh toán.
- **Phase 7:** Thanh toán tiền mặt, giả lập mã VietQR, xem trước hóa đơn và giả lập in hóa đơn.
- **Phase 8:** Báo cáo doanh thu theo bộ lọc ngày và hoàn thiện toàn bộ test suite tích hợp.
- **Phase 9:** Ứng dụng PWA / Tích hợp phần cứng máy in nhiệt ZYWELL và thiết bị SUNMI T1-G.
