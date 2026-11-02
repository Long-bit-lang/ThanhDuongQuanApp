# THANH ĐƯỜNG QUÁN POS - KIẾN TRÚC HỆ THỐNG (SYSTEM ARCHITECTURE)

## 1. Tổng quan kiến trúc (High-Level Overview)

Hệ thống **Thanh Đường Quán POS** được thiết kế theo kiến trúc **Modular Monolith** kết hợp với **Event-Driven WebSocket Broadcast** và **API-First RESTful Backend**, tối ưu hóa cho quy mô quán nhậu 50 bàn, 5–10 nhân viên (tối đa 5 nhân viên thao tác đồng thời trên di động và máy tính tiền POS chuyên dụng).

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND CLIENT TIER                            │
│  - Phục vụ (Waiters): Mobile Web PWA (iPhone / Android)                │
│  - Thu ngân (Cashiers): SUNMI T1-G Desktop / Tablet View               │
│  - Chủ quán (Owner): Full Management & Financial Control               │
└───────────────────▲───────────────────────────────▲────────────────────┘
                    │ REST API (JSON)               │ WebSocket Events
                    │ HttpOnly Refresh Cookie       │ (State Synchronization)
                    │ In-Memory Access & CSRF       │
┌───────────────────▼───────────────────────────────▼────────────────────┐
│                       BACKEND API & SECURITY TIER                      │
│                    FastAPI (Python 3.14 / 3.12+)                       │
│  - Security Engine: Argon2id, JWT (HS256), Synchronizer Token CSRF    │
│  - Invariant Guard: PostgreSQL Transaction Advisory Lock (Owner Guard) │
│  - Concurrency Controller: SELECT FOR UPDATE & Idempotency Key Engine  │
│  - WebSocket Connection & Broadcast Hub                                │
└───────────────────▲───────────────────────────────▲────────────────────┘
                    │                               │
                    ▼ Domain Operations             ▼ Printing Commands
┌──────────────────────────────────────┐  ┌──────────────────────────────┐
│        MODULAR MONOLITH CORES        │  │     PRINTING SUBSYSTEM       │
│  - Identity (RBAC: OWNER, CASHIER,   │  │  - Receipt DTO Builder       │
│    WAITER)                           │  │  - ESC/POS Formatter (80mm)  │
│  - Catalog (Menu & Availability)     │  │  - ZywellPos80Adapter        │
│  - Floor (50 Tables B01-B50)         │  │  - MockPrinterService        │
│  - Service (Rounds, Items, History)  │  │  - SUNMI T1-G Bridge Spec    │
│  - Billing (Invoices, Discounts)     │  └──────────────┬───────────────┘
│  - Payments (Cash & VietQR Mock)     │                 │ (Hardware USB-A/B)
│  - Reporting (Financial Breakdown)   │                 ▼
│  - Audit (Append-Only Event Ledger)  │  ┌──────────────────────────────┐
└───────────────────▲──────────────────┘  │ ZYWELL ZY-Q822 USB (80mm)    │
                    │ SQLAlchemy 2.x Async└──────────────────────────────┘
                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        PERSISTENCE TIER                                │
│                   PostgreSQL 16 (Docker Container)                     │
│  - 16 Core Normalized Tables with NUMERIC Currency                     │
│  - Strict Check Constraints & Foreign Keys                             │
│  - Advisory Locks & Distributed Login Rate Limiting                    │
│  - Alembic Migration Engine                                            │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Phân ranh giới các module Backend (`backend/app/modules/`)

| Module | Nhiệm vụ chính | Quy tắc nghiệp vụ then chốt |
|---|---|---|
| **`identity`** | Quản lý người dùng, phân quyền (OWNER, CASHIER, WAITER), xác thực Argon2id, JWT, refresh rotation, CSRF token. | Khóa advisory lock `8472910384720192` bảo đảm tối thiểu 1 active OWNER. Rate limit 5 lần/15 phút trên DB. |
| **`audit`** | Ghi nhận nhật ký kiểm toán bất biến (append-only audit log). | Không có API cập nhật hoặc xóa nhật ký kiểm toán. |
| **`catalog`** | Quản lý thực đơn, giá bán, mô tả, trạng thái còn/hết món và lưu trữ (archive). | Không xóa vật lý món đã có lịch sử giao dịch; món hết hàng không cho phép đặt mới. |
| **`floor`** | Quản lý sơ đồ 50 bàn (`B01` - `B50`), trạng thái `AVAILABLE`/`OCCUPIED`, mở/đóng phiên, gộp bàn, tách bàn, chuyển món. | Một bàn chỉ có tối đa 1 phiên active; gộp/tách bàn thực thi nguyên tử trong transaction. |
| **`service`** | Quản lý các lượt gọi món (order rounds) và chi tiết món (`order_items`). | Lưu snapshot tên món và đơn giá tại thời điểm gọi; hủy món giữ nguyên lịch sử, không xóa bản ghi. |
| **`billing`** | Tổng hợp hóa đơn cuối cùng của phiên, áp dụng giảm giá (phần trăm/cố định, theo món/hóa đơn), ghi nhận điều chỉnh sau thanh toán. | Tiền tệ sử dụng `NUMERIC(14, 2)` / `Decimal`; chỉ 1 hóa đơn chính thức cho 1 phiên. |
| **`payments`** | Xác nhận thanh toán Tiền mặt (CASH) và VietQR MOCK; chống thanh toán trùng lặp. | Idempotency key bắt buộc; không tự ý tạo refund; giữ nguyên payment gốc khi hủy món sau thanh toán. |
| **`reporting`** | Báo cáo doanh thu thuần, tổng hóa đơn, tổng thanh toán và chênh lệch điều chỉnh. | Chỉ OWNER và CASHIER được truy cập; WAITER bị chặn ở backend. |
| **`printing`** | Chuyển đổi hóa đơn sang định dạng in nhiệt 80mm, tạo chuỗi byte ESC/POS tiếng Việt, cung cấp adapter cho máy in ZYWELL ZY-Q822 và SUNMI T1-G. | Không gọi SDK native trực tiếp từ backend Python; backend cung cấp dữ liệu định dạng chuẩn và mock test. |

---

## 3. Kiến trúc Realtime & Đồng bộ hóa Thiết bị (WebSocket)

- **Hub quản lý**: `ConnectionManager` trong `backend/app/core/events.py` quản lý danh sách WebSocket kết nối từ các thiết bị phục vụ và thu ngân.
- **Xác thực kết nối**: WebSocket client truyền token xác thực; backend kiểm tra trạng thái active và danh tính người dùng.
- **Các sự kiện broadcast tự động**:
  - `TABLE_STATUS_CHANGED`: Bàn đổi trạng thái (trống/có khách/tổng tiền cập nhật).
  - `SESSION_OPENED` / `SESSION_CLOSED`: Phiên phục vụ bắt đầu hoặc kết thúc.
  - `ORDER_CREATED` / `ORDER_ITEM_CANCELLED`: Có món mới gọi từ nhân viên hoặc món bị hủy.
  - `SESSION_MERGED` / `SESSION_SPLIT` / `ITEM_TRANSFERRED`: Thay đổi cơ cấu bàn hoặc chuyển món giữa các bàn.
  - `INVOICE_CREATED` / `PAYMENT_CONFIRMED`: Hóa đơn được xuất hoặc thanh toán thành công.
  - `PRODUCT_AVAILABILITY_CHANGED`: Món được đánh dấu hết hàng hoặc mở bán lại.
- **Khả năng chịu lỗi (Resilience)**:
  - Frontend tự động reconnect khi mất kết nối mạng.
  - Không phụ thuộc WebSocket để bảo toàn dữ liệu: REST API và Database luôn là nguồn chân lý (Source of Truth). Sau khi reconnect, frontend tự động tải lại dữ liệu phiên hiện tại.

---

## 4. Kiến trúc Frontend (React 19 + TypeScript + Vite)

- **Cấu trúc Feature-Driven**:
  - `src/features/auth`: State quản lý phiên đăng nhập trong bộ nhớ (in-memory access token & CSRF token), cơ chế single-flight refresh token.
  - `src/features/pos`: Sơ đồ 50 bàn, giỏ hàng cảm ứng, đặt món, thanh toán, xem trước hóa đơn in.
  - `src/features/menu`: Quản lý thực đơn cho Thu ngân & Chủ quán.
  - `src/features/staff`: Quản lý nhân viên dành riêng cho Chủ quán.
  - `src/features/reports`: Báo cáo tài chính doanh thu quán.
  - `src/features/audit`: Tra cứu audit log kiểm toán hệ thống.
  - `src/features/health` & `src/features/dashboard`: Bảng điều khiển kiểm tra hệ thống Phase 1 (được bảo tồn đầy đủ).
- **Responsive Layout**:
  - Giao diện Phục vụ: Tối ưu cảm ứng trên điện thoại di động (iPhone / Android) với nút bấm lớn, giỏ hàng dạng trượt.
  - Giao diện Thu ngân: Tối ưu cho màn hình cảm ứng POS SUNMI T1-G (14-inch) và máy tính để bàn.
