# THANH ĐƯỜNG QUÁN POS - THIẾT KẾ CƠ SỞ DỮ LIỆU (DATABASE SCHEMA)

Hệ thống sử dụng cơ sở dữ liệu **PostgreSQL 16**. Toàn bộ cấu trúc được quản lý thông qua **Alembic migrations** (Revision: `f1a8c2d6e4b0_phase3_pos_core`).

---

## 1. Nguyên tắc cốt lõi về dữ liệu

1. **Không sử dụng kiểu số thực (`float`) cho tiền tệ**: Tất cả các trường tiền tệ đều sử dụng kiểu `NUMERIC(14, 2)` trong PostgreSQL và `Decimal` trong Python để triệt tiêu lỗi làm tròn dấu phẩy động.
2. **Snapshot lịch sử giá**: Giá bán và tên sản phẩm được lưu snapshot tại `order_items` và `invoice_items` tại thời điểm phát sinh giao dịch. Thay đổi giá món trong danh mục không làm ảnh hưởng đến các đơn hàng cũ.
3. **Bất biến lịch sử tài chính**: Bản ghi thanh toán (`payments`) và hóa đơn đã thanh toán (`invoices`) không bao giờ bị xóa hoặc sửa đè. Việc điều chỉnh sau thanh toán (ví dụ: hủy món sau khi đã trả tiền) được ghi nhận thông qua bảng `invoice_adjustments`.
4. **Không xóa vật lý (No hard delete)**: Món ăn, nhân viên, món đã gọi (order item) đều sử dụng cờ trạng thái (`is_active`, `is_archived`, `status = 'CANCELLED'`).

---

## 2. Danh sách 16 bảng dữ liệu

### 2.1. Phân hệ Phân quyền & Định danh (Identity)

#### `roles`
- `id` (VARCHAR(32), PK): Mã vai trò (`OWNER`, `CASHIER`, `WAITER`).
- `name` (VARCHAR(64), NOT NULL): Tên hiển thị của vai trò.
- `description` (TEXT): Mô tả quyền hạn.
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now()).

#### `users`
- `id` (UUID, PK): Khóa chính ngẫu nhiên UUIDv4.
- `username` (VARCHAR(32), UNIQUE, NOT NULL): Tên đăng nhập (3-30 ký tự, `^[a-z0-9_]+$`).
- `full_name` (VARCHAR(128), NOT NULL): Họ và tên nhân viên.
- `password_hash` (VARCHAR(255), NOT NULL): Chuỗi mã hóa mật khẩu Argon2id.
- `role` (VARCHAR(32), FK `roles.id`, NOT NULL): Vai trò duy nhất của người dùng.
- `is_active` (BOOLEAN, NOT NULL, DEFAULT true): Trạng thái tài khoản.
- `created_by_id` (UUID, FK `users.id`, NULLABLE): Người tạo tài khoản.
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now()).
- `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now()).

#### `refresh_tokens`
- `id` (UUID, PK): Mã phiên token.
- `family_id` (UUID, NOT NULL): Nhóm token phục vụ token rotation & reuse detection.
- `user_id` (UUID, FK `users.id`, NOT NULL).
- `token_hash` (VARCHAR(64), NOT NULL): SHA-256 hash của refresh token ngẫu nhiên.
- `csrf_token_hash` (VARCHAR(64), NOT NULL): SHA-256 hash của CSRF token đồng bộ.
- `expires_at` (TIMESTAMPTZ, NOT NULL): Hạn dùng (7 ngày).
- `is_revoked` (BOOLEAN, NOT NULL, DEFAULT false): Trạng thái thu hồi.
- `revoked_at` (TIMESTAMPTZ, NULLABLE): Thời điểm thu hồi.
- `replaced_by_token_id` (UUID, NULLABLE): Token thay thế trong rotation.
- `user_agent` (VARCHAR(512), NULLABLE).
- `ip_address` (VARCHAR(45), NULLABLE).
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now()).

#### `login_rate_limits`
- `id` (BIGSERIAL, PK).
- `key` (VARCHAR(128), NOT NULL, INDEX): Khóa theo `ip:username`.
- `attempted_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now()): Thời điểm đăng nhập thất bại.
*(Hỗ trợ rate limit 5 lần thất bại trong 15 phút, đồng bộ giữa nhiều backend workers).*

---

### 2.2. Phân hệ Kiểm toán (Audit)

#### `audit_logs`
- `id` (BIGSERIAL, PK).
- `actor_id` (UUID, FK `users.id`, NULLABLE): Người thực hiện hành động.
- `actor_username` (VARCHAR(64), NOT NULL): Tên tài khoản thực hiện.
- `action` (VARCHAR(64), NOT NULL): Hành động (`BOOTSTRAP_OWNER`, `LOGIN`, `CANCEL_ORDER_ITEM`, v.v.).
- `entity_type` (VARCHAR(64), NOT NULL): Loại thực thể (`USER`, `ORDER_ITEM`, `SESSION`, v.v.).
- `entity_id` (VARCHAR(64), NOT NULL): ID của thực thể.
- `details` (JSONB, NOT NULL, DEFAULT '{}'): Dữ liệu chi tiết trước/sau thao tác.
- `ip_address` (VARCHAR(45), NULLABLE): Địa chỉ IP client.
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now()).
*(Bảng chỉ thêm - append only, không có API update/delete).*

---

### 2.3. Phân hệ Danh mục (Catalog)

#### `products`
- `id` (UUID, PK).
- `name` (VARCHAR(128), NOT NULL): Tên món ăn / đồ uống.
- `description` (TEXT, NULLABLE): Mô tả chi tiết món.
- `sale_price` (NUMERIC(14, 2), NOT NULL): Đơn giá bán (duy nhất 1 mức giá).
- `is_available` (BOOLEAN, NOT NULL, DEFAULT true): Trạng thái còn hàng / hết món.
- `is_archived` (BOOLEAN, NOT NULL, DEFAULT false): Trạng thái ngừng kinh doanh.
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now()).
- `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now()).

---

### 2.4. Phân hệ Sơ đồ bàn & Phiên phục vụ (Floor & Service)

#### `dining_tables`
- `id` (UUID, PK).
- `code` (VARCHAR(16), UNIQUE, NOT NULL): Mã bàn (50 bàn được tạo sẵn: `B01` đến `B50`).
- `display_name` (VARCHAR(64), NOT NULL): Tên hiển thị (ví dụ: "Bàn 01").
- `status` (VARCHAR(20), NOT NULL, DEFAULT 'AVAILABLE'): `AVAILABLE` hoặc `OCCUPIED`.
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now()).
- `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now()).

#### `service_sessions`
- `id` (UUID, PK).
- `status` (VARCHAR(20), NOT NULL, DEFAULT 'OPEN'): `OPEN` hoặc `CLOSED`.
- `opened_by_id` (UUID, FK `users.id`, NOT NULL).
- `opened_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now()).
- `closed_by_id` (UUID, FK `users.id`, NULLABLE).
- `closed_at` (TIMESTAMPTZ, NULLABLE).
- `notes` (TEXT, NULLABLE).

#### `session_tables`
- `session_id` (UUID, FK `service_sessions.id`, PK).
- `table_id` (UUID, FK `dining_tables.id`, PK).
- `is_primary` (BOOLEAN, NOT NULL, DEFAULT true): Đánh dấu bàn chính khi gộp bàn.
- `joined_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now()).
*(Một phiên có thể gồm nhiều bàn khi gộp bàn; một bàn chỉ thuộc 1 phiên `OPEN` tại một thời điểm).*

#### `orders`
- `id` (UUID, PK).
- `session_id` (UUID, FK `service_sessions.id`, NOT NULL): Phiên phục vụ.
- `round_number` (INTEGER, NOT NULL, DEFAULT 1): Thứ tự đợt gọi món.
- `created_by_id` (UUID, FK `users.id`, NOT NULL): Nhân viên ghi nhận đợt gọi.
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now()).

#### `order_items`
- `id` (UUID, PK).
- `order_id` (UUID, FK `orders.id`, NOT NULL).
- `product_id` (UUID, FK `products.id`, NOT NULL).
- `product_name_snapshot` (VARCHAR(128), NOT NULL): Tên món lúc gọi.
- `unit_price_snapshot` (NUMERIC(14, 2), NOT NULL): Đơn giá lúc gọi.
- `quantity` (INTEGER, NOT NULL, CHECK `quantity > 0`): Số lượng gọi.
- `note` (VARCHAR(255), NULLABLE): Ghi chú của khách (ví dụ: "không ớt", "ít đá").
- `status` (VARCHAR(20), NOT NULL, DEFAULT 'ACTIVE'): `ACTIVE` hoặc `CANCELLED`.
- `cancelled_by_id` (UUID, FK `users.id`, NULLABLE): Nhân viên thực hiện hủy.
- `cancelled_at` (TIMESTAMPTZ, NULLABLE): Thời điểm hủy.
- `cancel_reason` (VARCHAR(255), NULLABLE): Lý do hủy món nếu có.
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now()).

---

### 2.5. Phân hệ Tính tiền & Thanh toán (Billing & Payments)

#### `invoices`
- `id` (UUID, PK).
- `invoice_code` (VARCHAR(32), UNIQUE, NOT NULL): Mã hóa đơn (ví dụ: `HD-20261101-ABCD`).
- `session_id` (UUID, FK `service_sessions.id`, UNIQUE, NOT NULL): Mỗi phiên chỉ có tối đa 1 hóa đơn chính thức.
- `subtotal` (NUMERIC(14, 2), NOT NULL): Tổng tiền trước giảm giá.
- `discount_total` (NUMERIC(14, 2), NOT NULL, DEFAULT 0): Tổng số tiền được giảm giá.
- `adjustment_total` (NUMERIC(14, 2), NOT NULL, DEFAULT 0): Tổng số tiền điều chỉnh sau thanh toán.
- `final_total` (NUMERIC(14, 2), NOT NULL): Số tiền khách cần thanh toán (`subtotal - discount_total + adjustment_total`).
- `status` (VARCHAR(20), NOT NULL, DEFAULT 'PENDING'): `PENDING`, `PAID`, `ADJUSTED`.
- `created_by_id` (UUID, FK `users.id`, NOT NULL).
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now()).
- `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now()).

#### `invoice_items`
- `id` (UUID, PK).
- `invoice_id` (UUID, FK `invoices.id`, NOT NULL).
- `order_item_id` (UUID, FK `order_items.id`, NOT NULL).
- `product_name` (VARCHAR(128), NOT NULL): Snapshot tên món.
- `unit_price` (NUMERIC(14, 2), NOT NULL): Snapshot đơn giá.
- `quantity` (INTEGER, NOT NULL): Số lượng món tính tiền.
- `line_total` (NUMERIC(14, 2), NOT NULL): Thành tiền (`quantity * unit_price`).

#### `discounts`
- `id` (UUID, PK).
- `invoice_id` (UUID, FK `invoices.id`, NOT NULL).
- `invoice_item_id` (UUID, FK `invoice_items.id`, NULLABLE): Null nếu giảm toàn hóa đơn; có giá trị nếu giảm trên từng món.
- `discount_type` (VARCHAR(20), NOT NULL): `PERCENTAGE` hoặc `FIXED_AMOUNT`.
- `discount_value` (NUMERIC(14, 2), NOT NULL): Giá trị phần trăm (ví dụ: 10%) hoặc số tiền (ví dụ: 50.000đ).
- `applied_amount` (NUMERIC(14, 2), NOT NULL): Số tiền thực tế được giảm trừ.
- `reason` (VARCHAR(255), NULLABLE): Lý do áp dụng giảm giá.
- `applied_by_id` (UUID, FK `users.id`, NOT NULL).
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now()).

#### `invoice_adjustments`
- `id` (UUID, PK).
- `invoice_id` (UUID, FK `invoices.id`, NOT NULL).
- `amount` (NUMERIC(14, 2), NOT NULL): Số tiền chênh lệch (thường là số âm khi hủy món sau thanh toán).
- `reason` (VARCHAR(255), NOT NULL): Nguyên nhân điều chỉnh.
- `adjusted_by_id` (UUID, FK `users.id`, NOT NULL).
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now()).

#### `payments`
- `id` (UUID, PK).
- `invoice_id` (UUID, FK `invoices.id`, UNIQUE, NOT NULL): Một hóa đơn chỉ được thanh toán một lần duy nhất.
- `idempotency_key` (VARCHAR(64), UNIQUE, NOT NULL): Khóa chống trùng lặp request từ frontend.
- `method` (VARCHAR(20), NOT NULL): `CASH` hoặc `VIETQR_MOCK`.
- `amount_paid` (NUMERIC(14, 2), NOT NULL): Số tiền đã thanh toán (bất biến).
- `cashier_id` (UUID, FK `users.id`, NOT NULL): Thu ngân xác nhận thu tiền.
- `transaction_reference` (VARCHAR(64), NULLABLE): Mã giao dịch tham chiếu.
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now()).

---

## 3. Ràng buộc toàn vẹn & Concurrency Control

1. **Khóa Advisory Lock toàn hệ thống (`8472910384720192`)**:
   Mọi thao tác thay đổi trạng thái hoặc vai trò tài khoản `OWNER` (tạo mới, kích hoạt, vô hiệu hóa, đổi role) bắt buộc phải giành được khóa này trong transaction trước khi thực hiện đếm hoặc cập nhật bảng `users`, ngăn chặn tuyệt đối tình huống race condition làm mất tài khoản chủ quán duy nhất.
2. **Khóa bản ghi theo hàng (`SELECT ... FOR UPDATE`)**:
   Được áp dụng khi thực hiện gộp bàn, tách bàn, chuyển món và tính tiền để ngăn hai nhân viên thao tác đồng thời trên cùng một phiên bàn.
3. **Idempotency Key Engine**:
   Mọi yêu cầu gửi thanh toán phải kèm theo `idempotency_key`. Nếu cùng một khóa được gửi lại, hệ thống trả về kết quả thanh toán trước đó (HTTP 200 OK) thay vì tạo bản ghi thanh toán mới hoặc ném lỗi xung đột.
