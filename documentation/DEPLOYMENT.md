# THANH ĐƯỜNG QUÁN POS - HƯỚNG DẪN TRIỂN KHAI (DEPLOYMENT GUIDE)

Tài liệu hướng dẫn triển khai hệ thống **Thanh Đường Quán POS** trên môi trường máy chủ cục bộ (Local Server) và mạng nội bộ Wi-Fi (Local LAN) phục vụ trực tiếp tại quán nhậu.

---

## 1. Yêu cầu môi trường (System Requirements)

- **Hệ điều hành**: Linux Ubuntu (24.04 LTS / 26.04 LTS) hoặc tương thích.
- **Tài nguyên**: Tối thiểu 4 GB RAM (Hệ thống đã được tối ưu hóa chạy mượt mà trên máy 7 GB RAM).
- **Phần mềm bắt buộc**:
  - Docker Engine >= 26.0 & Docker Compose >= 2.27
  - Python >= 3.12 (khuyên dùng Python 3.14 / 3.12 với virtualenv)
  - Node.js >= 20 & npm >= 10
- **Phần cứng POS ngoại vi**:
  - Máy tính tiền: **SUNMI T1-G** (Android 6.0.1, SUNMI OS, màn hình cảm ứng).
  - Máy in nhiệt: **ZYWELL ZY-Q822** (Khổ giấy 80mm, dao cắt tự động, cáp USB-A sang USB-B kết nối vào SUNMI T1-G).
  - Điện thoại thông minh của nhân viên phục vụ (kết nối cùng mạng Wi-Fi của quán).

---

## 2. Cấu hình biến môi trường

Sao chép tệp mẫu và cấu hình:

```bash
# Tại thư mục gốc dự án
cp .env.example .env
```

Các biến môi trường quan trọng:
```env
# Database PostgreSQL
POSTGRES_USER=thanh_duong_admin
POSTGRES_PASSWORD=thanh_duong_secure_password
POSTGRES_DB=thanh_duong_pos
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# Backend Security
SECRET_KEY=generate_a_very_strong_random_secret_key_here
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
COOKIE_SECURE=false  # Đặt false khi chạy mạng nội bộ HTTP; đặt true khi có HTTPS

# CORS Origins (Địa chỉ IP máy chủ LAN và cổng frontend)
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://192.168.1.50:5173
```

---

## 3. Khởi chạy từng bước (Step-by-Step Deployment)

### Bước 1: Khởi động Cơ sở dữ liệu PostgreSQL
```bash
# Khởi động container PostgreSQL từ thư mục infrastructure
docker compose -f infrastructure/compose.yaml up -d

# Kiểm tra trạng thái container thanh_duong_postgres
docker ps
```

### Bước 2: Nâng cấp Cơ sở dữ liệu (Database Migration)
Toàn bộ 16 bảng dữ liệu, ràng buộc và seed dữ liệu 50 bàn (`B01` - `B50`) cùng các vai trò được tự động khởi tạo thông qua Alembic:
```bash
# Kích hoạt virtual environment backend
cd backend
source .venv/bin/activate

# Chạy migration lên phiên bản mới nhất
alembic upgrade head
```

### Bước 3: Khởi tạo tài khoản Chủ quán (Bootstrap OWNER)
Lệnh CLI an toàn sử dụng `getpass` (không để lộ mật khẩu trong lịch sử terminal) và bảo vệ bằng PostgreSQL advisory lock:
```bash
# Chạy từ thư mục backend
PYTHONPATH=. python -m app.modules.identity.cli bootstrap-owner
```
*Hệ thống sẽ hỏi Username, Họ tên và Mật khẩu (yêu cầu chữ hoa, chữ thường, số, ký tự đặc biệt).*

### Bước 4: Khởi động Backend API & WebSocket Server
Để các thiết bị điện thoại và máy POS SUNMI trong cùng mạng Wi-Fi truy cập được, lắng nghe trên `0.0.0.0`:
```bash
# Chạy từ thư mục backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Bước 5: Khởi động Giao diện Frontend POS
```bash
# Di chuyển vào thư mục frontend
cd ../frontend

# Cài đặt dependency (nếu chưa cài)
npm install

# Khởi chạy frontend lắng nghe trên toàn bộ interface mạng LAN
npm run dev -- --host 0.0.0.0 --port 5173
```

---

## 4. Truy cập hệ thống trên các thiết bị tại quán

Giả sử địa chỉ IP mạng nội bộ của máy chủ POS là `192.168.1.50` (xem bằng lệnh `ip a` hoặc `hostname -I`):

1. **Trên máy thu ngân SUNMI T1-G / Máy tính để bàn**:
   Mở trình duyệt (Chrome/Brave):
   ```text
   http://192.168.1.50:5173
   ```
   Đăng nhập bằng tài khoản `CASHIER` hoặc `OWNER`. Màn hình sẽ hiển thị giao diện Desktop/Tablet với sơ đồ 50 bàn, giỏ hàng cố định, tính năng xuất hóa đơn, giảm giá, xác nhận tiền mặt, tạo mã VietQR và in hóa đơn nhiệt.

2. **Trên điện thoại của nhân viên phục vụ (iPhone / Android)**:
   Kết nối vào cùng mạng Wi-Fi quán, mở trình duyệt:
   ```text
   http://192.168.1.50:5173
   ```
   Đăng nhập bằng tài khoản `WAITER`. Màn hình tự động chuyển sang chế độ Mobile-First:
   - Chạm vào bàn để mở bàn hoặc xem chi tiết.
   - Thêm món ăn nhanh chóng từ thực đơn có tìm kiếm.
   - Hủy món trực tiếp từ danh sách các đợt gọi với ghi nhận lịch sử.
   - Gộp bàn, tách bàn và chuyển món ngay trên điện thoại khi khách đổi chỗ.
   - Các nút tạo hóa đơn, xác nhận thanh toán và báo cáo doanh thu được ẩn hoàn toàn và khóa chặt ở tầng backend.

---

## 5. Kiểm tra trạng thái hoạt động (Health Checks)

Hệ thống cung cấp các endpoint kiểm tra sức khỏe tự động:
- **API Health**: `GET http://localhost:8000/api/v1/health`
- **Database Connection**: `GET http://localhost:8000/api/v1/health/db`
- **Frontend System Diagnostic**: Tab `"Kiểm tra hệ thống"` trên giao diện ứng dụng hiển thị trực quan trạng thái kết nối Database, độ trễ Ping (ms) và trạng thái WebSocket thời gian thực.
