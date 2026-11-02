# THANH ĐƯỜNG QUÁN POS - HƯỚNG DẪN SỬ DỤNG (OPERATIONS MANUAL)

Tài liệu hướng dẫn vận hành chi tiết dành cho các vai trò: **Nhân viên Phục vụ (WAITER)**, **Thu ngân (CASHIER)** và **Chủ quán (OWNER)**.

---

## 1. Dành cho Nhân viên Phục vụ (WAITER) - Thao tác trên Điện thoại

Nhân viên phục vụ sử dụng trình duyệt trên điện thoại cá nhân (iPhone / Android) kết nối vào mạng Wi-Fi quán và truy cập địa chỉ IP POS (ví dụ: `http://192.168.1.50:5173`).

### 1.1. Mở bàn & Đặt món cho khách
1. Tại tab **"Sơ đồ bàn"**, màn hình hiển thị danh sách 50 bàn (`B01` - `B50`):
   - Bàn xanh lá: Bàn trống (`Trống`).
   - Bàn xanh tím viền vàng: Bàn đang có khách (`Có khách`).
2. Chạm vào một bàn trống (ví dụ: **Bàn 05**).
3. Hộp thoại thông báo: *"Bàn 05 đang trống. Bạn có muốn mở bàn mới để phục vụ khách không?"* -> Nhấn **"Mở bàn ngay"**.
4. Màn hình đặt món xuất hiện:
   - Sử dụng thanh tìm kiếm để gõ tên món (ví dụ: *"Bia"*, *"Bò"*).
   - Chạm vào món ăn để thêm vào giỏ hàng.
   - Nhấn dấu `+` / `-` để tăng giảm số lượng.
   - Nhập ghi chú nếu khách yêu cầu đặc biệt (ví dụ: *"ướp lạnh"*, *"không cay"*).
5. Nhấn nút **"Gửi order đợt 1"**.
6. Hệ thống lưu món, cập nhật tổng tiền tạm tính của bàn và gửi thông báo tức thì (realtime) tới màn hình Thu ngân.

### 1.2. Gọi thêm món (Đợt 2, 3...)
1. Khi khách gọi thêm đồ, chạm vào bàn đang có khách.
2. Thêm các món mới vào giỏ hàng.
3. Nhấn **"Gửi order đợt tiếp theo"**.

### 1.3. Hủy món đã gọi
1. Chạm vào bàn cần hủy món -> Chọn tab **"Món đã gọi"**.
2. Danh sách các món ăn kèm số lượng và thời gian gọi hiển thị theo từng đợt.
3. Tại món khách muốn hủy, nhấn biểu tượng **Thùng rác đỏ (Hủy món)**.
4. Nhập lý do nếu có (ví dụ: *"Khách đổi ý sang món khác"*) -> Nhấn **"Xác nhận hủy món"**.
5. Món hủy chuyển sang trạng thái `ĐÃ HỦY`, tự động trừ khỏi tổng tiền bàn và ghi nhận vào nhật ký kiểm toán.

### 1.4. Gộp bàn & Tách bàn & Chuyển món
- **Gộp bàn**: Nhấn nút **"Gộp bàn"** trên thanh công cụ -> Chọn bàn chính và các bàn phụ cần gộp -> Nhấn **"Xác nhận gộp bàn"**. Toàn bộ món và phiên phục vụ được gộp chung.
- **Tách bàn / Chuyển món**: Trong chi tiết bàn, nhấn **"Tách bàn / Chuyển món"** -> Chọn các món cụ thể cần chuyển sang bàn trống mới -> Nhấn **"Xác nhận tách bàn"**.

---

## 2. Dành cho Thu ngân (CASHIER) - Thao tác trên Máy SUNMI T1-G

Thu ngân làm việc trên màn hình cảm ứng chuyên dụng của máy tính tiền POS.

### 2.1. Tính tiền & Giảm giá
1. Nhấp vào bàn khách yêu cầu thanh toán -> Nhấn nút **"Tính tiền (Billing)"**.
2. Hóa đơn chi tiết xuất hiện với danh sách các món, số lượng, đơn giá và tổng phụ.
3. **Áp dụng giảm giá (nếu có)**:
   - Chọn loại giảm giá: **Phần trăm (%)** hoặc **Số tiền cố định (đ)**.
   - Chọn đối tượng: Giảm trên toàn hóa đơn hoặc giảm riêng trên từng món.
   - Nhập lý do (ví dụ: *"Khách quen"*, *"Voucher khai trương"*).
   - Nhấn **"Áp dụng giảm giá"**. Tổng tiền thanh toán sẽ tự động cập nhật.
4. Nhấn **"Chuyển sang thanh toán"**.

### 2.2. Xác nhận Thanh toán
Màn hình thanh toán hỗ trợ 2 phương thức:
1. **Tiền mặt (CASH)**:
   - Nhập số tiền khách đưa (hoặc bấm các nút gợi ý nhanh: 100k, 200k, 500k).
   - Hệ thống tự động tính toán chính xác số tiền thừa cần trả lại khách.
   - Nhấn **"Xác nhận thanh toán tiền mặt"**.
2. **VietQR MOCK**:
   - Hệ thống hiển thị mã QR mô phỏng kèm thông tin chuyển khoản (Ngân hàng, Số tài khoản, Số tiền, Nội dung).
   - Khách quét mã chuyển tiền qua App ngân hàng.
   - Thu ngân kiểm tra điện thoại nhận được tiền -> Nhấn **"Xác nhận đã nhận chuyển khoản"**.

### 2.3. Xem & In Hóa đơn nhiệt (Print Receipt)
1. Sau khi thanh toán, nhấn **"Xem / In hóa đơn"**.
2. Bản xem trước hóa đơn chuẩn 80mm xuất hiện.
3. Nhấn **"In hóa đơn (Print)"** để máy in ZYWELL ZY-Q822 in phiếu thanh toán và tự động cắt giấy đưa cho khách.

### 2.4. Quản lý Món ăn (Menu)
1. Truy cập tab **"Thực đơn"**:
   - Thêm món mới: Nhấn **"+ Thêm món mới"**, nhập tên, mô tả, giá bán và nhấn Lưu.
   - Đánh dấu hết món: Khi bếp thông báo hết nguyên liệu, nhấn nút chuyển đổi (Toggle) **"Hết món"**. Món này sẽ chuyển sang trạng thái xám trên điện thoại của nhân viên phục vụ và không thể đặt mới.
   - Cập nhật giá bán: Nhấn biểu tượng Bút sửa để thay đổi giá.
   - Ngừng kinh doanh: Nhấn **"Lưu trữ (Archive)"** để ẩn món khỏi danh sách chọn mà vẫn bảo toàn lịch sử các đơn hàng cũ.

### 2.5. Báo cáo Doanh thu trong ca
1. Truy cập tab **"Doanh thu"**:
   - Xem tổng số hóa đơn đã thanh toán.
   - Tổng tiền thu thực tế.
   - Tổng tiền đã giảm giá.
   - Chênh lệch điều chỉnh (nếu có hủy món sau thanh toán).

---

## 3. Dành cho Chủ quán (OWNER) - Quản trị Toàn quyền

Chủ quán có toàn bộ quyền của Thu ngân, đồng thời quản lý nhân sự và an toàn hệ thống:

### 3.1. Quản lý Tài khoản Nhân viên
1. Truy cập tab **"Nhân viên"**:
   - Danh sách toàn bộ nhân viên kèm vai trò (`CASHIER`, `WAITER`) và trạng thái (`Đang hoạt động` / `Đã khóa`).
2. **Tạo tài khoản mới**:
   - Nhấn **"+ Tạo nhân viên"**.
   - Nhập Username (chữ thường, số, dấu gạch dưới), Họ tên, Mật khẩu và chọn Vai trò (`CASHIER` hoặc `WAITER`).
   - Nhấn **"Tạo tài khoản"**.
3. **Khóa / Mở khóa tài khoản**:
   - Nhấn nút **"Khóa"** khi nhân viên nghỉ việc hoặc tạm dừng ca. Toàn bộ phiên đăng nhập của nhân viên trên điện thoại sẽ bị hủy bỏ ngay lập tức.
4. **Reset Mật khẩu**:
   - Nhấn **"Đổi mật khẩu"**, nhập mật khẩu mới và xác nhận.

### 3.2. Tra cứu Nhật ký Kiểm toán (Audit Logs)
1. Truy cập tab **"Nhật ký kiểm toán"**:
   - Theo dõi từng hành động nhạy cảm trong quán: ai mở bàn, ai gọi món, ai hủy món, ai giảm giá, ai thanh toán.
   - Hiển thị rõ IP thiết bị, thời gian chính xác tới từng giây và chi tiết thay đổi (JSON).
   - Dữ liệu hoàn toàn bất biến (không ai có thể can thiệp hoặc xóa sửa).
