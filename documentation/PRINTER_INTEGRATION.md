# THANH ĐƯỜNG QUÁN POS - TÍCH HỢP MÁY IN NHIỆT (PRINTER INTEGRATION)

Tài liệu đặc tả kiến trúc tích hợp máy in nhiệt cho máy tính tiền POS tại quán nhậu **Thanh Đường Quán**.

---

## 1. Thông số phần cứng & Môi trường thực tế

- **Thiết bị POS chính**: **SUNMI T1-G**
  - Hệ điều hành: **Android 6.0.1**
  - Phiên bản hệ thống: **SUNMI OS 2.7.15**
  - SUNMI SDK Version: **1.2.0**
  - Cổng kết nối: Cổng USB Type-A trên thân máy SUNMI.
- **Máy in hóa đơn nhiệt**: **ZYWELL ZY-Q822**
  - Khổ giấy in: **80mm** (độ rộng khoảng 48 ký tự tiêu chuẩn / 24 ký tự in đậm).
  - Tốc độ in: 260 mm/giây.
  - Cắt giấy: Dao cắt tự động (**Auto Cutter**).
  - Kết nối: Cáp chuyển đổi **USB-A to USB-B** (cắm từ cổng USB máy SUNMI vào cổng USB-B máy in ZYWELL).
  - Đã xác minh thực tế: Ứng dụng ZYWELL Demo APK cài đặt và in thử nghiệm thành công trên SUNMI T1-G.

---

## 2. Kiến trúc tích hợp phân tách (Decoupled Printing Architecture)

Để đảm bảo tính độc lập và khả năng bảo trì cao:
1. **FastAPI Backend tuyệt đối không kết nối trực tiếp vào phần cứng USB**:
   Backend chạy trên môi trường Linux server hoặc container không có quyền truy cập trực tiếp cổng USB vật lý của máy khách. Thay vào đó, backend đóng vai trò là **Bộ định dạng dữ liệu (Receipt Formatter & ESC/POS Generator)**.
2. **Android / SUNMI Device Layer làm cầu nối in vật lý**:
   Màn hình thu ngân trên máy SUNMI (chạy web hoặc ứng dụng wrapper Android) tiếp nhận dữ liệu hóa đơn từ backend và điều khiển máy in thông qua Android USB Host API hoặc ZYWELL Android SDK.
3. **Bảo vệ tài nguyên Vendor SDK (`zywell-sdk/`)**:
   Thư mục `zywell-sdk/` chứa mã nguồn và file nhị phân của nhà sản xuất ZYWELL được giữ nguyên tuyệt đối, không chỉnh sửa, không format và không thêm bớt file.

```text
┌────────────────────────────────────────────────────────┐
│                   FASTAPI BACKEND                      │
│  - GET /invoices/{id}/receipt                          │
│  - Module printing: Formatter (80mm & ESC/POS UTF-8)   │
│  - MockPrinterService (Kiểm thử tự động trên CI/CD)    │
└───────────────────────────┬────────────────────────────┘
                            │ JSON DTO / Raw ESC/POS Bytes
                            ▼
┌────────────────────────────────────────────────────────┐
│           SUNMI T1-G (ANDROID 6.0.1 / WEB CLIENT)      │
│  - ReceiptModal: Xem trước hóa đơn trên màn hình       │
│  - Trình điều khiển in Android / Web Browser Print     │
│  - Giao tiếp máy in qua USB Host                       │
└───────────────────────────┬────────────────────────────┘
                            │ USB-A to USB-B Cable
                            ▼
┌────────────────────────────────────────────────────────┐
│           MÁY IN NHIỆT ZYWELL ZY-Q822 (80MM)           │
│  - In Tiếng Việt có dấu UTF-8                          │
│  - Cắt giấy tự động                                    │
└────────────────────────────────────────────────────────┘
```

---

## 3. Cấu trúc Hóa đơn in nhiệt 80mm

Hóa đơn được căn chỉnh chuẩn khổ giấy 80mm với đầy đủ thông tin:
```text
================================================
               THANH ĐƯỜNG QUÁN
        Đ/c: 123 Đường Bờ Kè, Quận 1, TP.HCM
              Hotline: 0909 123 456
================================================
              HÓA ĐƠN THANH TOÁN
Mã HĐ: HD-20261101-ABCD
Bàn: Bàn 05 (B05)
Thu ngân: Thu Ngân 01
Thời gian: 01/11/2026 20:30
------------------------------------------------
Tên món                  SL     Đơn giá     T.Tiền
------------------------------------------------
Bò lúc lắc khoai tây      2     145.000    290.000
Bia Sài Gòn Special      10      25.000    250.000
Mực một nắng nướng sa tế  1     180.000    180.000
------------------------------------------------
Tổng tiền món:                         720.000 đ
Giảm giá (Ưu đãi 10%):                 -72.000 đ
------------------------------------------------
TỔNG CỘNG THANH TOÁN:                  648.000 đ
------------------------------------------------
Hình thức: VIETQR MOCK (Đã thanh toán)
Số tiền khách trả:                     648.000 đ
================================================
       CẢM ƠN QUÝ KHÁCH VÀ HẸN GẶP LẠI!
================================================
```

---

## 4. Đặc tả lệnh ESC/POS cho ZYWELL ZY-Q822

Module `backend/app/modules/printing/formatter.py` tự động xuất chuỗi byte ESC/POS chuẩn:
- **Khởi tạo máy in**: `ESC @` (`\x1b\x40`)
- **Căn giữa (Center align)**: `ESC a 1` (`\x1b\x61\x01`)
- **Căn trái (Left align)**: `ESC a 0` (`\x1b\x61\x00`)
- **Chữ in đậm (Bold on/off)**: `ESC E 1` / `ESC E 0`
- **Chữ phóng to gấp đôi**: `GS ! \x11` (Chiều rộng x2, chiều cao x2 cho tiêu đề quán và tổng tiền)
- **Ký tự Tiếng Việt**: Chuỗi văn bản được mã hóa sang `UTF-8` bytes (`text.encode('utf-8')`).
- **Lệnh cắt giấy tự động (Auto-Cut)**:
  ```text
  ESC d 3  (\x1b\x64\x03) - Đẩy giấy lên 3 dòng
  GS V 66 0 (\x1d\x56\x42\x00) - Cắt một phần giấy (Partial Cut)
  ```

---

## 5. Mẫu cầu nối Android (Java Bridge Snippet cho SUNMI T1-G)

Nếu đóng gói ứng dụng Android chuyên dụng bằng WebView kết nối ZYWELL SDK (`PosPrinterSDK.jar` từ `zywell-sdk/`):

```java
package com.thanhduongquan.pos.printer;

import android.content.Context;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;
import net.posprinter.posprinterface.ProcessData;
import net.posprinter.posprinterface.UiExecute;
import net.posprinter.utils.PosPrinter;

public class ZywellPrinterBridge {
    private Context context;
    private PosPrinter printer;

    public ZywellPrinterBridge(Context context) {
        this.context = context;
        this.printer = new PosPrinter(context);
    }

    public void printReceiptBytes(final byte[] escPosBytes) {
        printer.connectUsbPort(context, new UiExecute() {
            @Override
            public void onsucess() {
                // Gửi trực tiếp mảng byte ESC/POS từ Backend đã định dạng sẵn
                printer.sendData(escPosBytes);
                // Lệnh cắt giấy tự động
                printer.cutPaper(66, 0);
            }

            @Override
            public void onfailed() {
                // Xử lý khi cổng USB chưa cắm hoặc chưa cấp quyền USB
            }
        });
    }
}
```

---

## 6. Quy trình nghiệm thu máy in trên phần cứng thật (Manual Hardware Acceptance)

1. Cắm cáp USB-B vào cổng sau máy in ZYWELL ZY-Q822, đầu USB-A cắm vào cổng USB trên đế máy SUNMI T1-G.
2. Bật nguồn máy in (đảm bảo đèn nguồn màu xanh dương, đã nạp cuộn giấy nhiệt 80mm).
3. Mở ứng dụng POS trên trình duyệt SUNMI T1-G.
4. Chọn một bàn đang có khách, nhấn **"Tính tiền"** -> Áp dụng giảm giá (nếu có) -> Nhấn **"Thanh toán"**.
5. Chọn **"Tiền mặt"** hoặc **"VietQR MOCK"** -> Nhấn **"Xác nhận thanh toán"**.
6. Sau khi thanh toán thành công, nhấn **"Xem / In hóa đơn"**.
7. Màn hình hiển thị bản xem trước hóa đơn chuẩn 80mm:
   - Nhấn nút **"Mô phỏng gửi lệnh in"** để kiểm tra API gửi lệnh ESC/POS thành công tới backend.
   - Nhấn nút **"In trình duyệt (Print)"** để xuất lệnh in trực tiếp từ trình duyệt của máy SUNMI tới máy in nhiệt đã cấu hình trong hệ thống Android.
8. Kiểm tra giấy in: Tiếng Việt hiển thị rõ ràng, không bị lỗi font dấu, các cột thẳng hàng và dao cắt tự động kích hoạt cắt giấy.
