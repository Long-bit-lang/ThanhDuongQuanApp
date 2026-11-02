# THANH ĐƯỜNG QUÁN POS - BÁO CÁO KIỂM THỬ TỰ ĐỘNG (AUTOMATED TEST REPORT)

Báo cáo chi tiết kết quả thực thi toàn bộ bộ kiểm thử tự động (Automated Test Suite) cho hệ thống **Thanh Đường Quán POS**.

---

## 1. Tổng kết thực thi (Executive Test Summary)

| Phân hệ kiểm thử | Công cụ / Môi trường | Tổng số test | Kết quả | Thời gian |
|---|---|:---:|:---:|:---:|
| **Backend Unit & Integration Tests** | `pytest 9.2.0`, `asyncio`, PostgreSQL 16 | **43** | **43 PASSED / 0 FAILED** | **9.98s** |
| **Frontend TypeScript Type Checking** | `tsc -b` (TypeScript 7.0.2) | 12 files | **0 ERRORS** | **~2.1s** |
| **Frontend Production Build** | Vite 8.3.5 / React 19.3.1 | 2068 modules | **BUILD SUCCESS** | **528ms** |
| **Database Migrations** | Alembic 1.15.1 | 16 tables | **UP TO HEAD** | **~1.5s** |

---

## 2. Chi tiết 43 bài test Backend (`backend/tests/`)

### 2.1. Phân hệ Xác thực & Quản lý phiên (`test_auth.py` - 11/11 PASSED)
- `test_login_success`: Đăng nhập thành công với tài khoản active, nhận access token và CSRF token.
- `test_login_invalid_password`: Đăng nhập sai mật khẩu bị từ chối với thông báo chung an toàn.
- `test_login_nonexistent_user`: Đăng nhập tài khoản không tồn tại bị từ chối với thông báo chung.
- `test_login_inactive_user`: Tài khoản đã bị vô hiệu hóa (is_active = False) không thể đăng nhập.
- `test_login_rate_limiting`: Thử sai liên tiếp 5 lần trong 15 phút kích hoạt HTTP 429 Too Many Requests từ PostgreSQL rate limit.
- `test_refresh_token_rotation_success`: Đổi refresh token cũ lấy token mới trong cùng family_id.
- `test_csrf_mismatch_returns_403`: Header CSRF không khớp với bản ghi DB bị chặn HTTP 403 Forbidden.
- `test_refresh_token_reuse_persists_revocation`: Phát hiện sử dụng lại token cũ đã rotate -> thu hồi ngay lập tức toàn bộ family_id.
- `test_logout_revokes_token`: Đăng xuất thu hồi phiên trong database và xóa cookie.
- `test_get_me_endpoint`: Trích xuất chính xác thông tin người dùng từ JWT claims.
- `test_concurrent_refresh_family_revocation`: Hai request refresh đồng thời trên cùng token kích hoạt cơ chế bảo vệ thu hồi cả family.

### 2.2. Kiểm tra Kết nối & Probe Cơ sở dữ liệu (`test_db_connection.py`, `test_health.py` - 7/7 PASSED)
- `test_database_direct_query`: Truy vấn trực tiếp PostgreSQL `SELECT 1` thành công.
- `test_check_db_connection_function`: Hàm kiểm tra kết nối trả về trạng thái healthy.
- `test_root_endpoint`: Kiểm tra endpoint `/`.
- `test_direct_health_endpoint`: Kiểm tra endpoint `/health`.
- `test_api_v1_health_endpoint`: Kiểm tra `/api/v1/health`.
- `test_api_v1_health_db_endpoint`: Kiểm tra `/api/v1/health/db`.
- `test_liveness_and_readiness_probes`: Kiểm tra liveness và readiness probes cho Kubernetes / Docker container.

### 2.3. Quy tắc Nghiệp vụ POS Cốt lõi (`test_pos_business.py` - 8/8 PASSED)
- `test_catalog_crud_and_permissions`:
  - OWNER/CASHIER tạo món, sửa giá, ẩn món, lưu trữ thành công.
  - WAITER chỉ được đọc danh mục; bị chặn HTTP 403 khi cố gắng tạo hoặc sửa món.
- `test_floor_tables_and_sessions`:
  - Hệ thống tải đầy đủ 50 bàn (`B01` - `B50`).
  - Mở bàn thành công chuyển trạng thái bàn sang `OCCUPIED`.
  - Mở trùng bàn đang có khách bị từ chối với HTTP 409 Conflict.
- `test_order_rounds_and_cancellation`:
  - Gọi món lần 1 và lần 2 lưu snapshot tên món và đơn giá tại thời điểm gọi.
  - Hủy món thành công, chuyển sang `CANCELLED`, ghi nhận người hủy và lý do; món hủy không bị tính vào tổng tiền bàn.
- `test_session_merge_split_and_transfer`:
  - Gộp bàn B01 và B02 thành một phiên duy nhất, hiển thị đúng mã bàn gộp.
  - Tách các món cụ thể từ một phiên sang bàn trống mới trong transaction.
  - Chuyển món từ bàn này sang bàn khác đảm bảo tính bảo toàn tổng tiền.
- `test_billing_discounts_and_payments`:
  - Xuất hóa đơn tính tiền cho phiên.
  - Áp dụng giảm giá phần trăm (ví dụ: 10%) và số tiền cố định.
  - Thanh toán thành công bằng `CASH` và `VIETQR_MOCK`.
  - Kiểm tra `idempotency_key`: gửi lặp lại request thanh toán nhận HTTP 200 OK với cùng kết quả, ngăn chặn double-click.
- `test_post_payment_cancellation_and_adjustment`:
  - Sau khi hóa đơn đã thanh toán, hủy 1 món ăn phát sinh bản ghi điều chỉnh `invoice_adjustments` âm.
  - Bản ghi `Payment` gốc giữ nguyên bất biến, không sửa đè lịch sử tiền khách đã trả.
- `test_revenue_reporting_permissions`:
  - OWNER và CASHIER truy cập báo cáo tổng quan và theo ngày thành công.
  - WAITER bị từ chối ở tầng backend với HTTP 403 Forbidden.
- `test_printing_and_receipt_formatting`:
  - Tạo cấu trúc DTO hóa đơn in 80mm chuẩn Tiếng Việt.
  - Xuất chuỗi byte ESC/POS UTF-8 với mã điều khiển cắt giấy.
  - Dịch vụ Mock Printer ghi nhận lệnh in thành công.

### 2.4. Phân hệ Bảo mật & Băm dữ liệu (`test_security.py` - 6/6 PASSED)
- `test_argon2id_hashing_and_verification`: Mã hóa và kiểm tra mật khẩu chính xác với Argon2id.
- `test_password_strength_policy`: Từ chối mật khẩu yếu (thiếu hoa, thường, số, ký tự đặc biệt).
- `test_username_validation`: Chỉ chấp nhận username chữ thường, số, dấu gạch dưới (3-30 ký tự).
- `test_jwt_access_token_claims`: Kiểm tra đầy đủ 7 claims bắt buộc của JWT.
- `test_jwt_invalid_token`: Từ chối token sai chữ ký, hết hạn hoặc sai audience/issuer.
- `test_token_hashing`: Băm SHA-256 an toàn cho refresh token và CSRF token.

### 2.5. Phân hệ Quản lý Người dùng & OWNER Invariant (`test_users.py` - 10/10 PASSED)
- `test_owner_can_create_staff_user`: OWNER tạo tài khoản nhân viên thành công.
- `test_cashier_and_waiter_cannot_create_user`: CASHIER và WAITER bị chặn HTTP 403 khi tạo nhân viên.
- `test_owner_can_list_users`: OWNER xem danh sách toàn bộ nhân sự.
- `test_non_owner_cannot_list_users`: CASHIER/WAITER bị chặn khi xem danh sách nhân sự.
- `test_user_self_access_profile`: Nhân viên tự xem thông tin cá nhân.
- `test_protect_last_active_owner_invariant`: Chặn thao tác vô hiệu hóa hoặc hạ quyền tài khoản OWNER cuối cùng.
- `test_deactivate_user_revokes_sessions`: Khóa tài khoản nhân viên tự động thu hồi toàn bộ token phiên đăng nhập của người đó.
- `test_reset_password_revokes_sessions`: Reset mật khẩu nhân viên tự động thu hồi toàn bộ phiên đăng nhập cũ.
- `test_protect_last_owner_concurrent_race`: PostgreSQL advisory lock `8472910384720192` ngăn chặn race condition khi nhiều admin cùng thao tác.
- `test_bootstrap_owner_cli_idempotency`: Lệnh CLI chỉ khởi tạo khi chưa có active OWNER; từ chối tạo trùng khi đã có OWNER.

### 2.6. Phân hệ Realtime WebSocket (`test_websocket.py` - 1/1 PASSED)
- `test_websocket_channel_echo`: Kết nối WebSocket, gửi nhận message và broadcast sự kiện thành công.

---

## 3. Kiểm tra Build Frontend (Vite & TypeScript)

```text
> frontend@0.0.0 build
> tsc -b && vite build

vite v8.3.5 building client environment for production...
✓ 2068 modules transformed.
rendering chunks (1)...computing gzip size...
dist/index.html                   1.09 kB │ gzip:  0.64 kB
dist/assets/index-DRbVKBFP.css    5.02 kB │ gzip:  1.70 kB
dist/assets/index-DmuuDW_b.js   354.19 kB │ gzip: 96.74 kB

✓ built in 528ms
```
- **Không có bất kỳ cảnh báo hoặc lỗi TypeScript (0 errors)**.
- Đã kiểm tra tương thích `verbatimModuleSyntax` và `noUnusedLocals`.
- Bundle nén gzip chỉ ~98 kB, tải siêu nhanh trên kết nối mạng Wi-Fi di động.
