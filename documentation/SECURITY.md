# THANH ĐƯỜNG QUÁN POS - BẢO MẬT HỆ THỐNG (SECURITY ARCHITECTURE)

Hệ thống được thiết kế theo các tiêu chuẩn bảo mật ngân hàng và an ninh ứng dụng web khắt khe, tuân thủ mô hình phòng thủ theo chiều sâu (Defense in Depth).

---

## 1. Lưu trữ & Băm mật khẩu (Password Hashing)

- **Thuật toán**: **Argon2id** (thuật toán đoạt giải Password Hashing Competition, chống tấn công ASIC/GPU và side-channel).
- **Chính sách mật khẩu**:
  - Độ dài: 8 - 128 ký tự.
  - Bắt buộc chứa chữ hoa, chữ thường, chữ số và ký tự đặc biệt.
  - Xác minh mật khẩu thời gian hằng định (`constant-time verification`) chống lại tấn công đo thời gian (timing attacks).
  - Phản hồi đăng nhập không làm lộ username có tồn tại hay không trong database (thông báo chung: "Tài khoản hoặc mật khẩu không chính xác").

---

## 2. Quản lý Phiên & Token (JWT & Refresh Token Rotation)

### 2.1. Access Token
- **Thuật toán ký**: `HS256` (HMAC with SHA-256).
- **Thời hạn sống**: 15 phút (ngắn hạn).
- **Claims bắt buộc**:
  - `iss`: `thanh-duong-pos`
  - `aud`: `thanh-duong-pos-client`
  - `sub`: User ID (UUID)
  - `type`: `access`
  - `jti`: UUID ngẫu nhiên cho mỗi token
  - `iat`, `exp`
- **Vị trí lưu trữ**: **CHỈ LƯU TRONG BỘ NHỚ RAM (IN-MEMORY)** của ứng dụng React. Tuyệt đối **không** lưu Access Token vào `localStorage` hoặc `sessionStorage` để triệt tiêu nguy cơ bị đánh cắp bởi mã độc XSS.

### 2.2. Refresh Token & Cookie
- **Sinh mã**: Sinh chuỗi ngẫu nhiên bằng `secrets.token_urlsafe(48)`.
- **Lưu trữ database**: Chỉ lưu chuỗi băm **SHA-256** của token, không bao giờ lưu raw token vào cơ sở dữ liệu.
- **Thời hạn sống**: 7 ngày.
- **Cơ chế truyền tải**: `HttpOnly Cookie`:
  - `Cookie Name`: `thanh_duong_refresh`
  - `Path`: `/api/v1/auth`
  - `SameSite`: `Lax`
  - `Secure`: `True` trong môi trường Production; `False` trong môi trường Development nội bộ.
  - JavaScript trong trình duyệt hoàn toàn không thể đọc hoặc can thiệp vào cookie này.

### 2.3. Token Rotation & Reuse Detection
- Mỗi lần gọi `POST /api/v1/auth/refresh`, refresh token cũ sẽ bị thu hồi và một refresh token mới được cấp phát trong cùng một `family_id`.
- **Phát hiện tái sử dụng (Reuse Detection)**: Nếu một refresh token đã bị thu hồi trước đó được gửi lên lại, hệ thống nhận diện đây là hành vi đánh cắp phiên và sẽ ngay lập tức **thu hồi toàn bộ các token thuộc token family đó**, ép buộc kẻ tấn công và nạn nhân phải đăng nhập lại từ đầu. Thao tác revoke được commit trước khi trả HTTP 401.

---

## 3. Chống tấn công giả mạo yêu cầu (CSRF Protection)

- Hệ thống sử dụng mẫu thiết kế **Synchronizer Token Pattern**.
- Khi đăng nhập hoặc làm mới token thành công, backend sinh một mã CSRF ngẫu nhiên, lưu mã băm SHA-256 vào database cùng bản ghi refresh token và trả về raw CSRF token trong response body JSON.
- Frontend lưu CSRF token này trong memory và tự động đính kèm vào header `X-CSRF-Token` trong các yêu cầu gửi đến `/api/v1/auth/refresh` và `/api/v1/auth/logout`.
- Backend băm chuỗi trong header và so khớp với bản ghi token trong database. Nếu không trùng khớp, yêu cầu bị từ chối với mã lỗi `403 Forbidden`.

---

## 4. Chống vét cạn mật khẩu (Login Rate Limiting)

- Hệ thống áp dụng cơ chế giới hạn tần suất đăng nhập thất bại: **Tối đa 5 lần thử sai trong 15 phút** cho mỗi cặp `(ip_address, username)`.
- Dữ liệu lượt thử sai được lưu trữ trực tiếp trong bảng PostgreSQL `login_rate_limits`, bảo đảm khả năng kiểm soát rate limit nhất quán tuyệt đối giữa nhiều backend worker processes hoặc containers.
- Khi vượt ngưỡng, hệ thống từ chối ngay lập tức với mã lỗi `HTTP 429 Too Many Requests`.

---

## 5. Bảo vệ bất biến Chủ quán duy nhất (OWNER Invariant)

- **Quy tắc bất biến cốt lõi**: `COUNT(active OWNER) >= 1`. Hệ thống không bao giờ được phép rơi vào trạng thái không còn tài khoản `OWNER` nào hoạt động.
- **Cơ chế bảo vệ**: Sử dụng **PostgreSQL Transaction-Level Advisory Lock** với định danh cố định:
  ```text
  Lock ID: 8472910384720192
  ```
- **Quy trình thực thi**:
  Mọi thao tác làm thay đổi tập hợp `active OWNER` (Bootstrap OWNER, tạo tài khoản OWNER mới, đổi vai trò của OWNER, vô hiệu hóa tài khoản OWNER) đều phải thực hiện theo thứ tự nghiêm ngặt:
  1. Giành khóa advisory lock `pg_advisory_xact_lock(8472910384720192)`.
  2. Truy vấn lại tài khoản mục tiêu từ database trong transaction hiện tại.
  3. Đếm số lượng active OWNER hiện hữu.
  4. Nếu thao tác dẫn đến số active OWNER < 1, rollback và ném lỗi `400 Bad Request`.
  5. Cập nhật tài khoản, ghi nhật ký kiểm toán `audit_logs` và commit transaction.

---

## 6. Phân quyền dựa trên vai trò (Role-Based Access Control - RBAC)

Hệ thống có đúng 3 vai trò độc lập: `OWNER`, `CASHIER`, `WAITER`. Mỗi tài khoản chỉ thuộc duy nhất một vai trò:

| Phân hệ / Thao tác | OWNER (Chủ quán) | CASHIER (Thu ngân) | WAITER (Phục vụ) |
|---|:---:|:---:|:---:|
| Xem sơ đồ 50 bàn | Có | Có | Có |
| Mở bàn & gọi món | Có | Có | Có |
| Hủy món đã gọi | Có | Có | Có |
| Gộp bàn, tách bàn, chuyển món | Có | Có | Có |
| Quản lý thực đơn (Thêm/Sửa/Hết món/Lưu trữ) | Có | Có | Không (HTTP 403) |
| Xuất hóa đơn tính tiền | Có | Có | Không (HTTP 403) |
| Áp dụng giảm giá (Món / Hóa đơn) | Có | Có | Không (HTTP 403) |
| Xác nhận thanh toán (Tiền mặt / VietQR) | Có | Có | Không (HTTP 403) |
| In hóa đơn tính tiền | Có | Có | Không (HTTP 403) |
| Xem báo cáo doanh thu tài chính | Có | Có | Không (HTTP 403) |
| Quản lý nhân viên (Tạo/Khóa/Reset pass) | Có | Không (HTTP 403) | Không (HTTP 403) |
| Xem nhật ký kiểm toán hệ thống (Audit Logs) | Có | Không (HTTP 403) | Không (HTTP 403) |

---

## 7. Nhật ký kiểm toán bất biến (Append-Only Audit Logging)

- Bảng `audit_logs` lưu trữ mọi hành động quản trị và nhạy cảm (Đăng nhập, Thay đổi tài khoản, Hủy món, Giảm giá, Thanh toán, Điều chỉnh sau thanh toán, Gộp/tách bàn).
- Lưu đầy đủ: `actor_id`, `actor_username`, `action`, `entity_type`, `entity_id`, `details` (JSONB) và `ip_address`.
- **Tính bất biến**: Backend hoàn toàn không cung cấp bất kỳ API nào để cập nhật (UPDATE) hoặc xóa (DELETE) các bản ghi kiểm toán.
