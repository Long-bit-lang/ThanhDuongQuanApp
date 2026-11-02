# THANH ĐƯỜNG QUÁN POS - TÀI LIỆU API (API REFERENCE)

Tất cả các endpoint nghiệp vụ đều được tổ chức dưới prefix `/api/v1`. Toàn bộ dữ liệu trao đổi sử dụng định dạng JSON UTF-8.

---

## 1. Authentication & Identity (`/api/v1/auth`, `/api/v1/users`)

### `POST /api/v1/auth/login`
- **Mô tả**: Đăng nhập hệ thống, cấp Access Token trong memory và HttpOnly Refresh Cookie.
- **Request Body**:
  ```json
  {
    "username": "owner",
    "password": "Password123!"
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "access_token": "eyJhbGciOi...",
    "token_type": "bearer",
    "expires_in": 900,
    "csrf_token": "a1b2c3d4...",
    "user": {
      "id": "uuid",
      "username": "owner",
      "full_name": "Chủ quán",
      "role": "OWNER",
      "is_active": true
    }
  }
  ```
- **Bảo mật**: Rate limit 5 lần thử sai trong 15 phút theo IP và username (trả về `429 Too Many Requests`).

### `POST /api/v1/auth/refresh`
- **Mô tả**: Quay vòng refresh token (Single-flight token rotation), cấp access token và CSRF token mới.
- **Headers**: `X-CSRF-Token: <raw_csrf_token>`
- **Cookies**: `thanh_duong_refresh=<refresh_token>`
- **Response** (`200 OK`): Access token & CSRF token mới.

### `POST /api/v1/auth/logout`
- **Mô tả**: Thu hồi toàn bộ refresh token family của phiên hiện tại và xóa cookie.

### `GET /api/v1/auth/me`
- **Mô tả**: Lấy thông tin tài khoản đang đăng nhập từ JWT claims.
- **Yêu cầu**: Bearer Token hợp lệ.

### `POST /api/v1/users`
- **Quyền**: Chỉ `OWNER`.
- **Request Body**:
  ```json
  {
    "username": "waiter01",
    "full_name": "Nguyễn Văn Phục Vụ",
    "password": "Password123!",
    "role": "WAITER"
  }
  ```

### `GET /api/v1/users`
- **Quyền**: Chỉ `OWNER`.
- **Response**: Danh sách tất cả tài khoản nhân viên.

### `PATCH /api/v1/users/{id}/deactivate`
- **Quyền**: Chỉ `OWNER`.
- **Ràng buộc**: Khóa advisory lock ngăn chặn vô hiệu hóa tài khoản `OWNER` duy nhất. Thu hồi toàn bộ refresh token của tài khoản bị vô hiệu hóa.

### `POST /api/v1/users/{id}/reset-password`
- **Quyền**: Chỉ `OWNER`.
- **Ràng buộc**: Cập nhật mật khẩu mới bằng Argon2id và thu hồi toàn bộ phiên đăng nhập cũ.

---

## 2. Catalog & Thực đơn (`/api/v1/products`)

### `GET /api/v1/products`
- **Quyền**: `OWNER`, `CASHIER`, `WAITER`.
- **Query Params**: `include_archived=false` (mặc định chỉ trả về món đang kinh doanh).

### `POST /api/v1/products`
- **Quyền**: `OWNER`, `CASHIER`.
- **Request Body**:
  ```json
  {
    "name": "Bò lúc lắc khoai tây",
    "description": "Thịt bò mềm xào rau củ kèm khoai tây chiên giòn",
    "sale_price": "145000.00"
  }
  ```

### `PATCH /api/v1/products/{id}`
- **Quyền**: `OWNER`, `CASHIER`.
- **Request Body**: Cập nhật tên, mô tả hoặc giá bán.

### `POST /api/v1/products/{id}/toggle-availability`
- **Quyền**: `OWNER`, `CASHIER`.
- **Mô tả**: Bật/tắt trạng thái hết món (`is_available`). Broadcast event `PRODUCT_AVAILABILITY_CHANGED` tới toàn bộ thiết bị.

### `POST /api/v1/products/{id}/archive`
- **Quyền**: `OWNER`, `CASHIER`.
- **Mô tả**: Đưa món vào lưu trữ (soft delete). Không xóa vật lý dữ liệu.

---

## 3. Floor & Bàn ăn (`/api/v1/tables`, `/api/v1/sessions`)

### `GET /api/v1/tables`
- **Quyền**: Tất cả vai trò.
- **Response**: Danh sách 50 bàn (`B01` - `B50`), trạng thái (`AVAILABLE`, `OCCUPIED`), tổng tiền tạm tính (`running_subtotal`), số đợt gọi món (`order_count`), danh sách mã bàn gộp (`active_table_codes`).

### `POST /api/v1/tables/{id}/open-session`
- **Quyền**: Tất cả vai trò.
- **Mô tả**: Bắt đầu phiên phục vụ mới cho bàn. Trả về `409 Conflict` nếu bàn đang có khách.

### `POST /api/v1/sessions/merge`
- **Quyền**: Tất cả vai trò.
- **Mô tả**: Gộp nhiều bàn thành 1 phiên phục vụ duy nhất.
- **Request Body**:
  ```json
  {
    "target_session_id": "uuid-phien-chinh",
    "source_session_ids": ["uuid-phien-phu-1", "uuid-phien-phu-2"]
  }
  ```

### `POST /api/v1/sessions/split`
- **Quyền**: Tất cả vai trò.
- **Mô tả**: Tách một số món sang bàn trống mới.
- **Request Body**:
  ```json
  {
    "source_session_id": "uuid-phien-hien-tai",
    "target_table_id": "uuid-ban-trong",
    "order_item_ids": ["uuid-item-1", "uuid-item-2"]
  }
  ```

### `POST /api/v1/sessions/transfer-items`
- **Quyền**: Tất cả vai trò.
- **Mô tả**: Chuyển các món cụ thể sang một phiên đang hoạt động khác.

---

## 4. Service & Đặt món (`/api/v1/sessions/{id}/orders`, `/api/v1/order-items`)

### `GET /api/v1/sessions/{id}`
- **Quyền**: Tất cả vai trò.
- **Response**: Chi tiết phiên, danh sách bàn liên kết, tất cả các đợt gọi món (`rounds`), các món đã gọi, tổng tiền tạm tính.

### `POST /api/v1/sessions/{id}/orders`
- **Quyền**: Tất cả vai trò.
- **Mô tả**: Gửi đợt gọi món mới từ nhân viên phục vụ.
- **Request Body**:
  ```json
  {
    "items": [
      {
        "product_id": "uuid-bia-sai-gon",
        "quantity": 10,
        "note": "Ướp lạnh, mang trước 5 chai"
      },
      {
        "product_id": "uuid-muc-nuong",
        "quantity": 2,
        "note": "Cay vừa"
      }
    ]
  }
  ```

### `POST /api/v1/order-items/{id}/cancel`
- **Quyền**: Tất cả vai trò.
- **Mô tả**: Hủy một món đã gọi. Giữ nguyên bản ghi với cờ `CANCELLED`, ghi nhận người hủy, thời gian và lý do.
- **Xử lý sau thanh toán**: Nếu hóa đơn của phiên đã thanh toán trước đó, hệ thống tự động tạo một khoản `invoice_adjustments` âm, giữ nguyên thanh toán cũ và phát sinh audit log.

---

## 5. Billing & Hóa đơn (`/api/v1/sessions/{id}/invoice`, `/api/v1/invoices`)

### `POST /api/v1/sessions/{id}/invoice`
- **Quyền**: `OWNER`, `CASHIER`.
- **Mô tả**: Xuất hóa đơn thanh toán cho phiên phục vụ. Tổng hợp toàn bộ các món `ACTIVE` trong các đợt gọi.

### `GET /api/v1/invoices/{id}`
- **Quyền**: `OWNER`, `CASHIER`.
- **Response**: Chi tiết hóa đơn, các món tính tiền, giảm giá đã áp dụng, điều chỉnh sau thanh toán, thông tin thanh toán nếu có.

### `POST /api/v1/invoices/{id}/discounts`
- **Quyền**: `OWNER`, `CASHIER`.
- **Request Body**:
  ```json
  {
    "invoice_item_id": null,
    "discount_type": "PERCENTAGE",
    "discount_value": "10.00",
    "reason": "Ưu đãi khách quen"
  }
  ```

### `GET /api/v1/invoices/{id}/receipt`
- **Quyền**: `OWNER`, `CASHIER`.
- **Mô tả**: Lấy dữ liệu DTO chuẩn hóa để in hóa đơn khổ 80mm cho máy in nhiệt ZYWELL ZY-Q822 hoặc xem trước trên giao diện.

---

## 6. Payments & Thanh toán (`/api/v1/invoices/{id}/payments`)

### `GET /api/v1/invoices/{id}/vietqr-mock`
- **Quyền**: `OWNER`, `CASHIER`.
- **Mô tả**: Tạo dữ liệu mã VietQR thanh toán mô phỏng (tên ngân hàng, số tài khoản, số tiền, nội dung thanh toán).

### `POST /api/v1/invoices/{id}/payments`
- **Quyền**: `OWNER`, `CASHIER`.
- **Request Body**:
  ```json
  {
    "idempotency_key": "pay_hd123_random_string",
    "method": "CASH",
    "amount_paid": "450000.00",
    "transaction_reference": null
  }
  ```
- **Phản hồi**:
  - `201 Created`: Thanh toán thành công lần đầu.
  - `200 OK`: Trả lại kết quả thanh toán trước đó nếu `idempotency_key` bị gửi lặp lại (double-click safe).
  - `409 Conflict`: Nếu hóa đơn đã được thanh toán bởi một transaction khác.

---

## 7. Reporting & Báo cáo Doanh thu (`/api/v1/reports`)

### `GET /api/v1/reports/revenue/summary`
- **Quyền**: `OWNER`, `CASHIER` (WAITER bị chặn HTTP `403 Forbidden`).
- **Query Params**: `start_date=2026-11-01&end_date=2026-11-01`.
- **Response**:
  ```json
  {
    "total_invoices": 15,
    "paid_invoices": 14,
    "total_billed": "18450000.00",
    "total_discounted": "650000.00",
    "total_adjusted": "-120000.00",
    "total_collected": "17800000.00"
  }
  ```

### `GET /api/v1/reports/revenue/daily`
- **Quyền**: `OWNER`, `CASHIER`.
- **Response**: Danh sách tổng hợp doanh thu theo từng ngày trong khoảng thời gian.

---

## 8. Printing & Thiết bị in nhiệt (`/api/v1/printing`)

### `GET /api/v1/printing/status`
- **Mô tả**: Kiểm tra trạng thái máy in (sẵn sàng, khổ giấy 80mm, loại kết nối USB/ESC-POS).

### `POST /api/v1/printing/mock-print`
- **Mô tả**: Tiếp nhận `receipt_data`, định dạng chuỗi byte ESC/POS tiếng Việt UTF-8 và ghi nhật ký in mô phỏng (mock print job).

---

## 9. Audit Logs (`/api/v1/audit-logs`)

### `GET /api/v1/audit-logs`
- **Quyền**: Chỉ `OWNER`.
- **Mô tả**: Tra cứu lịch sử kiểm toán toàn hệ thống (50-100 bản ghi gần nhất).
