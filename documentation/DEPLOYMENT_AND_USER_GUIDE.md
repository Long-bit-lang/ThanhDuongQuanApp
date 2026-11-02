# HƯỚNG DẪN TRIỂN KHAI VÀ VẬN HÀNH TOÀN DIỆN — THANH ĐƯỜNG QUÁN POS

Tài liệu này hướng dẫn chi tiết từ A-Z cách triển khai hệ thống lên đám mây (Render & Neon PostgreSQL), cài đặt và sử dụng trên điện thoại nhân viên (PWA), cài đặt ứng dụng POS lên máy SUNMI T1-G và cấu hình in hóa đơn nhiệt qua máy in ZYWELL ZY-Q822 kết nối cổng USB.

---

## MỤC LỤC
1. [Kiến Trúc Hệ Thống](#1-kiến-trúc-hệ-thống)
2. [Triển Khai Online Lên Render (Miễn Phí 100%)](#2-triển-khai-online-lên-render-miễn-phí-100)
3. [Hướng Dẫn Sử Dụng Trên Điện Thoại Nhân Viên (Staff PWA)](#3-hướng-dẫn-sử-dụng-trên-điện-thoại-nhân-viên-staff-pwa)
4. [Hướng Dẫn Cài Đặt Trên Máy SUNMI T1-G & Máy In ZYWELL](#4-hướng-dẫn-cài-đặt-trên-máy-sunmi-t1-g--máy-in-zywell)
5. [Quy Trình Nghiệp Vụ Bán Hàng & Thu Ngân Hằng Ngày](#5-quy-trình-nghiệp-vụ-bán-hàng--thu-ngân-hằng-ngày)
6. [Bảo Trì, Sao Lưu Dữ Liệu & Xử Lý Sự Cố](#6-bảo-trì-sao-lưu-dữ-liệu--xử-lý-sự-cố)

---

## 1. KIẾN TRÚC HỆ THỐNG

```
                          ┌────────────────────────┐
                          │   NEON POSTGRESQL      │
                          │   (Database Cloud)     │
                          └───────────▲────────────┘
                                      │ (TLS / SSL)
                          ┌───────────▼────────────┐
                          │    RENDER WEB SERVICE  │
                          │ FastAPI + Vite SPA     │
                          │ (Single-Origin / Domain│
                          └──────┬───────────┬─────┘
                                 │           │
                 (HTTPS / WSS)   │           │   (HTTPS / WSS)
                                 │           │
             ┌───────────────────▼──┐     ┌──▼───────────────────┐
             │ ĐIỆN THOẠI NHÂN VIÊN │     │     SUNMI T1-G       │
             │ PWA (iOS Safari /    │     │ Android Kiosk App    │
             │ Android Chrome)      │     │ (ZywellPrinterBridge)│
             └──────────────────────┘     └──────────┬───────────┘
                                                     │ (USB-A to USB-B)
                                          ┌──────────▼───────────┐
                                          │ MÁY IN ZYWELL ZY-Q822│
                                          │ 80mm + Tự Động Cắt   │
                                          └──────────────────────┘
```

- **Mô hình Single-Origin**: Backend FastAPI đóng gói và phục vụ trực tiếp bản build frontend Vite SPA (`frontend/dist`) trên cùng một domain. Loại bỏ hoàn toàn lỗi CORS, chặn cookie bên thứ ba (Third-party Cookies) trên iOS/Android, và đơn giản hóa việc quản trị.
- **Neon PostgreSQL**: Lưu trữ dữ liệu lâu dài với 17 bảng nghiệp vụ, cơ chế kiểm toán (Audit Logs), xác thực phân quyền 3 cấp (`OWNER`, `CASHIER`, `WAITER`).
- **Hardware Native Bridge**: SUNMI T1-G (Android 6.0.1 Marshmallow, API 23) chạy ứng dụng Kiosk WebView tích hợp `PosPrinterSDK.jar` qua giao thức Android USB Host, điều khiển máy in nhiệt ZYWELL ZY-Q822 qua cổng USB với bộ cắt giấy tự động.

---

## 2. TRIỂN KHAI ONLINE LÊN RENDER (MIỄN PHÍ 100%)

Render cung cấp gói **Free Web Service** và Neon cung cấp **Free Serverless Postgres** với chi phí 0đ/tháng.

### Cách 1: Triển khai tự động qua Docker (Khuyến nghị)
Hệ thống đã có sẵn `Dockerfile` multi-stage tối ưu hóa dung lượng (Stage 1 build React SPA, Stage 2 chạy Python 3.12-slim).

1. Đăng ký/Đăng nhập [render.com](https://render.com).
2. Kết nối kho mã nguồn (GitHub / GitLab repo chứa dự án `sunmi-pos-development`).
3. Chọn **New +** -> **Web Service**.
4. Cấu hình các thông số:
   - **Name**: `thanh-duong-pos`
   - **Region**: `Singapore` (để độ trễ về Việt Nam thấp nhất, ~30-40ms).
   - **Branch**: `main` (hoặc branch bạn push code).
   - **Runtime**: `Docker`.
   - **Instance Type**: `Free`.
5. Trong mục **Environment Variables**, bấm **Add Environment Variable** và thêm các biến:
   - `ENVIRONMENT`: `production`
   - `DEBUG`: `false`
   - `DATABASE_URL`: *(Điền URL Neon Pooled của bạn: `postgresql+psycopg://...@...-pooler.region.neon.tech/neondb?sslmode=require`)*
   - `DATABASE_URL_UNPOOLED`: *(Điền URL Neon Direct của bạn: `postgresql+psycopg://...@....region.neon.tech/neondb?sslmode=require`)*
   - `SECRET_KEY`: *(Chuỗi ngẫu nhiên bí mật dài 64 ký tự)*
   - `JWT_SECRET_KEY`: *(Chuỗi ngẫu nhiên bí mật dài 64 ký tự)*
   - `COOKIE_SECURE`: `true`
   - `CORS_ALLOWED_ORIGINS`: `*`
6. Bấm **Create Web Service**.
7. Render sẽ tự động build frontend, cài backend và khởi chạy. Khi hoàn tất, bạn nhận được đường dẫn dạng:
   `https://thanh-duong-pos.onrender.com`

### Cách 2: Triển khai qua Blueprint (`render.yaml`)
Dự án đã có file `render.yaml`. Bạn chỉ cần:
1. Vào Render Dashboard -> **Blueprints** -> **New Blueprint Instance**.
2. Chọn repo `sunmi-pos-development`.
3. Điền các biến `DATABASE_URL` và `DATABASE_URL_UNPOOLED` khi được hỏi.
4. Render sẽ tự động tạo service theo đúng chuẩn.

---

## 3. HƯỚNG DẪN SỬ DỤNG TRÊN ĐIỆN THOẠI NHÂN VIÊN (STAFF PWA)

Hệ thống được thiết kế chuẩn **PWA (Progressive Web App)** với icon nhận diện, giao diện tối ưu chạm (touch-friendly) và lưu cache vỏ ứng dụng (App Shell).

### Dành cho iPhone / iPad (iOS Safari):
1. Mở trình duyệt **Safari** trên điện thoại.
2. Truy cập địa chỉ website (ví dụ: `https://thanh-duong-pos.onrender.com`).
3. Nhấn vào nút **Chia sẻ** (biểu tượng hình vuông có mũi tên chỉ lên ở thanh dưới cùng Safari).
4. Cuộn xuống và chọn **"Thêm vào MH chính"** (Add to Home Screen).
5. Đặt tên hiển thị: **Thanh Đường POS** -> Chọn **Thêm** (Add).
6. Ứng dụng sẽ xuất hiện như một App độc lập ngoài màn hình chính, mở không có thanh địa chỉ trình duyệt, full màn hình cực kỳ mượt mà.

### Dành cho điện thoại Android (Chrome / Cốc Cốc):
1. Mở trình duyệt **Google Chrome** trên điện thoại.
2. Truy cập địa chỉ website của quán.
3. Nhấn vào menu **3 chấm** ở góc trên bên phải màn hình.
4. Chọn **"Cài đặt ứng dụng"** (Install App) hoặc **"Thêm vào màn hình chính"**.
5. Chọn **Cài đặt**. Biểu tượng ứng dụng Thanh Đường POS sẽ được thêm ngay vào menu điện thoại.

---

## 4. HƯỚNG DẪN CÀI ĐẶT TRÊN MÁY SUNMI T1-G & MÁY IN ZYWELL

Máy SUNMI T1-G chạy hệ điều hành Android 6.0.1 Marshmallow (API 23), màn hình cảm ứng 14 inch Full HD. Để in hóa đơn nhiệt qua máy in ZYWELL ZY-Q822 kết nối cổng USB, chúng ta sử dụng ứng dụng chuyên dụng **Thanh Đường POS Kiosk Bridge** (`sunmi-printer-bridge`).

### Bước 1: Lấy file cài đặt APK
File APK sau khi build nằm tại đường dẫn:
```text
sunmi-printer-bridge/app/build/outputs/apk/debug/app-debug.apk
```
Bạn có thể copy file này vào **USB Flash Drive (thẻ nhớ/ổ USB)** hoặc cắm cáp kết nối SUNMI T1-G vào máy tính.

### Bước 2: Cài đặt lên máy SUNMI T1-G
1. Cắm USB chứa file `app-debug.apk` vào cổng USB của máy SUNMI T1-G.
2. Mở ứng dụng **Quản lý file** (File Manager) trên SUNMI T1-G.
3. Chọn file `app-debug.apk` -> Chọn **Cài đặt** (Install). *(Nếu máy hỏi cho phép cài từ nguồn không xác định, bấm Cho phép)*.
4. Hoặc cài đặt trực tiếp bằng lệnh ADB từ máy tính:
   ```bash
   adb install -r sunmi-printer-bridge/app/build/outputs/apk/debug/app-debug.apk
   ```

### Bước 3: Kết nối phần cứng máy in ZYWELL ZY-Q822
1. Đặt máy in ZYWELL ZY-Q822 cạnh máy SUNMI T1-G.
2. Lắp cuộn giấy in nhiệt khổ 80mm vào máy in (lưu ý mặt giấy nhiệt ngửa lên trên theo hướng dẫn của máy).
3. Cắm nguồn điện cho máy in ZYWELL và bật công tắc nguồn (đèn báo nguồn màu xanh sáng).
4. Cắm cáp USB (đầu USB-B vuông vào máy in, đầu USB-A dẹt cắm vào một trong các cổng USB dưới chân đế máy SUNMI T1-G).

### Bước 4: Khởi chạy và thiết lập ban đầu
1. Mở ứng dụng **Thanh Đường POS** trên màn hình chính của SUNMI T1-G.
2. Khi máy in cắm vào, màn hình SUNMI sẽ hiện thông báo:
   > *"Cho phép ứng dụng Thanh Đường POS truy cập thiết bị USB?"*
   -> Bạn tích chọn ô **"Luôn mở ứng dụng này khi thiết bị này được kết nối"** -> Bấm **OK**.
3. **Cấu hình URL hệ thống**:
   - Nếu bạn chạy trên Render: Bấm vào biểu tượng cấu hình (⚙️) ở góc trên, nhập địa chỉ website: `https://thanh-duong-pos.onrender.com` -> Bấm **Lưu**.
   - Nếu bạn chạy local trong quán cùng mạng Wi-Fi: Nhập `http://192.168.1.x:8000`.
4. Mở một hóa đơn bất kỳ -> Bấm **In hóa đơn**.
5. Màn hình hiển thị: `🟢 Máy in ZYWELL USB (Sẵn sàng)`.
6. Bấm **In hóa đơn (ZYWELL USB)**: Máy in sẽ ngay lập tức in hóa đơn tiếng Việt đầy đủ thông tin bàn, giờ vào, món ăn, số lượng, tổng tiền và tự động kích hoạt dao cắt giấy tách rời hóa đơn.

---

## 5. QUY TRÌNH NGHIỆP VỤ BÁN HÀNG & THU NGÂN HẰNG NGÀY

### Ca làm việc của Nhân viên (Waiter):
1. **Đăng nhập**: Mở ứng dụng trên điện thoại, đăng nhập tài khoản nhân viên được cấp.
2. **Mở bàn & Gọi món**:
   - Chạm vào bàn khách ngồi (ví dụ: `B08`). Bàn chuyển trạng thái `OPEN` (Đang phục vụ).
   - Chọn tab danh mục: `🍲 Món ăn` hoặc `🍺 Bia & Đồ uống`.
   - Bấm vào món ăn/đồ uống để thêm vào order. Bấm dấu `+` / `-` để chỉnh số lượng hoặc nhập ghi chú (ví dụ: "Không cay", "Ít đá").
   - Bấm **Gửi yêu cầu gọi món**. Dữ liệu được đồng bộ ngay lập tức về máy POS trung tâm và bếp qua WebSocket.
3. **Chuyển bàn / Ghép bàn**:
   - Khi khách muốn đổi chỗ: Bấm nút **Chuyển bàn**, chọn bàn đích. Toàn bộ danh sách món đã gọi được chuyển sang bàn mới tức thì.

### Ca làm việc của Thu ngân (Cashier / Owner) trên máy SUNMI:
1. **Kiểm tra hóa đơn**:
   - Khách gọi tính tiền: Chạm vào bàn trên màn hình sơ đồ bàn.
   - Bấm **Xem hóa đơn / Thanh toán**.
2. **Hình thức thanh toán**:
   - **Tiền mặt (CASH)**: Nhập số tiền khách đưa, hệ thống tự tính tiền thừa cần trả lại khách -> Bấm **Xác nhận thanh toán & In hóa đơn**.
   - **Chuyển khoản (VietQR)**: Hệ thống sinh mã QR động chứa đúng số tiền cần thanh toán và nội dung chuyển khoản. Khách quét mã chuyển tiền xong -> Thu ngân bấm **Xác nhận đã nhận tiền & In hóa đơn**.
3. **In hóa đơn**:
   - Máy in ZYWELL ZY-Q822 in phiếu thanh toán rõ nét, tự động cắt giấy, đưa khách.
   - Bàn tự động đóng và chuyển về trạng thái `VACANT` (Bàn trống) sẵn sàng đón lượt khách mới.
4. **Báo cáo doanh thu cuối ngày**:
   - Thu ngân hoặc Chủ quán mở tab **Báo cáo**.
   - Xem tổng doanh thu thực tế, số lượng hóa đơn, phân tích chi tiết tiền mặt thu được vs tiền chuyển khoản VietQR, tổng chiết khấu/giảm giá đã áp dụng.
   - Dữ liệu hoàn toàn chính xác theo chuẩn kế toán (chỉ tính các hóa đơn đã thanh toán thành công `PAID`).

---

## 6. BẢO TRÌ, SAO LƯU DỮ LIỆU & XỬ LÝ SỰ CỐ

### 1. Hiện tượng "Cold Start" trên Render Free Tier
- **Đặc điểm**: Trên gói Free của Render, nếu không có ai truy cập trong vòng 15 phút, máy chủ sẽ tạm ngủ (spin down). Khi có yêu cầu mới (ví dụ mở web), máy chủ mất khoảng 30–50 giây để khởi động lại.
- **Giải pháp**:
  - Dùng dịch vụ giữ kết nối miễn phí như [UptimeRobot](https://uptimerobot.com) hoặc [Cron-job.org](https://cron-job.org) ping vào endpoint `https://thanh-duong-pos.onrender.com/health` mỗi 10 phút một lần để máy chủ luôn thức 24/7 trong giờ quán mở cửa.
  - Nâng cấp lên gói Starter của Render ($7/tháng) nếu quán cần tốc độ tức thì không bao giờ ngủ.

### 2. Sự cố máy in nhiệt ZYWELL USB
- **Máy in không phản hồi / Đèn đỏ báo lỗi**:
  - Kiểm tra xem máy in có bị hết giấy không. Mở nắp máy in, kiểm tra cuộn giấy nhiệt 80mm đã được lắp đúng chiều chưa.
  - Kiểm tra cáp USB kết nối giữa SUNMI T1-G và máy in ZYWELL. Rút ra cắm lại vào cổng USB khác trên đế máy SUNMI.
  - Khi cắm lại cáp USB, ứng dụng Android Kiosk sẽ tự động bắt sự kiện `ACTION_USB_DEVICE_ATTACHED` và kết nối lại ngay trong 1 giây mà không cần khởi động lại máy.
- **Chữ in ra bị nhạt**:
  - Dùng cồn y tế lau nhẹ đầu in nhiệt bên trong nắp máy in.
  - Đảm bảo dùng đúng giấy in nhiệt chất lượng tốt khổ 80mm.

### 3. Sao lưu dữ liệu trên Neon PostgreSQL
- Neon tự động snapshot và lưu trữ lịch sử dữ liệu (Point-in-Time Recovery).
- Để trích xuất bản sao lưu thủ công (pg_dump) về máy tính:
  ```bash
  pg_dump "postgresql://[user]:[password]@[host]/neondb?sslmode=require" -f backup_thanh_duong_$(date +%Y%m%d).sql
  ```

---
*Tài liệu bàn giao hoàn thiện hệ thống POS Thanh Đường Quán — Sẵn sàng đưa vào hoạt động kinh doanh thực tế.*
