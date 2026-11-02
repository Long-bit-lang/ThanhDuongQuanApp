package com.thanhduong.pos;

import android.content.Context;
import android.graphics.Bitmap;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;

import net.posprinter.posprinterface.IMyBinder;
import net.posprinter.posprinterface.ProcessData;
import net.posprinter.posprinterface.TaskCallback;
import net.posprinter.utils.BitmapToByteData;
import net.posprinter.utils.DataForSendToPrinterPos80;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.nio.charset.Charset;
import java.text.DecimalFormat;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/**
 * JavaScript Interface Bridge between Web POS and ZYWELL ZY-Q822 USB thermal printer.
 * Exposed to WebView as 'window.ZywellBridge'.
 */
public class ZywellPrinterBridge {
    private static final String TAG = "ZywellBridge";
    private final Context context;
    private final MainActivity activity;

    public ZywellPrinterBridge(MainActivity activity) {
        this.activity = activity;
        this.context = activity.getApplicationContext();
    }

    @JavascriptInterface
    public boolean isPrinterReady() {
        return MainActivity.IS_CONNECTED && MainActivity.myBinder != null;
    }

    @JavascriptInterface
    public String getPrinterStatus() {
        JSONObject res = new JSONObject();
        try {
            res.put("ready", isPrinterReady());
            res.put("connected", MainActivity.IS_CONNECTED);
            res.put("usbAddress", MainActivity.CURRENT_USB_PATH);
        } catch (Exception e) {
            Log.e(TAG, "getPrinterStatus error", e);
        }
        return res.toString();
    }

    @JavascriptInterface
    public String printReceipt(String receiptJson) {
        Log.i(TAG, "Received print request: " + receiptJson);
        if (!isPrinterReady()) {
            return errorResponse("Máy in ZYWELL chưa kết nối hoặc chưa cấp quyền USB.");
        }

        try {
            JSONObject json = new JSONObject(receiptJson);
            // Render high-clarity 80mm monochrome bitmap with native Vietnamese font and QR code
            Bitmap receiptBitmap = ReceiptBitmapBuilder.buildReceiptBitmap(context, json);
            byte[] rasterBmp = DataForSendToPrinterPos80.printRasterBmp(
                0,
                receiptBitmap,
                BitmapToByteData.BmpType.Threshold,
                BitmapToByteData.AlignType.Center,
                576
            );
            return executeUsbPrint(rasterBmp);
        } catch (Exception e) {
            Log.e(TAG, "Error formatting receipt", e);
            return errorResponse("Lỗi định dạng hóa đơn: " + e.getMessage());
        }
    }

    @JavascriptInterface
    public String printReceiptEscPos(String base64) {
        if (!isPrinterReady()) {
            return errorResponse("Máy in ZYWELL chưa kết nối hoặc chưa cấp quyền USB.");
        }
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            return executeUsbPrint(bytes);
        } catch (Exception e) {
            return errorResponse("Lỗi dữ liệu ESC/POS: " + e.getMessage());
        }
    }

    @JavascriptInterface
    public String printTestReceipt() {
        if (!isPrinterReady()) {
            return errorResponse("Máy in chưa kết nối.");
        }

        try {
            Bitmap testBitmap = ReceiptBitmapBuilder.buildTestReceiptBitmap(context);
            byte[] rasterBmp = DataForSendToPrinterPos80.printRasterBmp(
                0,
                testBitmap,
                BitmapToByteData.BmpType.Threshold,
                BitmapToByteData.AlignType.Center,
                576
            );
            return executeUsbPrint(rasterBmp);
        } catch (Exception e) {
            Log.e(TAG, "Lỗi in thử", e);
            return errorResponse("Lỗi in thử: " + e.getMessage());
        }
    }

    private String executeUsbPrint(final byte[] printData) {
        final CountDownLatch latch = new CountDownLatch(1);
        final AtomicBoolean success = new AtomicBoolean(false);
        final AtomicReference<String> errorMsg = new AtomicReference<>("");

        MainActivity.myBinder.WriteDataByUSB(new TaskCallback() {
            @Override
            public void OnSucceed() {
                Log.i(TAG, "WriteDataByUSB OnSucceed");
                success.set(true);
                latch.countDown();
            }

            @Override
            public void OnFailed() {
                Log.e(TAG, "WriteDataByUSB OnFailed");
                success.set(false);
                errorMsg.set("Không thể gửi dữ liệu tới máy in qua cổng USB.");
                latch.countDown();
            }
        }, new ProcessData() {
            @Override
            public List<byte[]> processDataBeforeSend() {
                List<byte[]> list = new ArrayList<>();
                // 1. Initialize printer (ESC @)
                list.add(new byte[]{0x1B, 0x40});

                // 2. Chunk data to avoid USB bulkTransfer buffer overflow
                final int CHUNK_SIZE = 4096;
                int offset = 0;
                while (offset < printData.length) {
                    int len = Math.min(CHUNK_SIZE, printData.length - offset);
                    byte[] chunk = new byte[len];
                    System.arraycopy(printData, offset, chunk, 0, len);
                    list.add(chunk);
                    offset += len;
                }

                // 3. Feed 4 lines & Perform Auto Cut (GS V 66 1)
                list.add(new byte[]{0x1B, 0x64, 0x04});
                list.add(DataForSendToPrinterPos80.selectCutPagerModerAndCutPager(66, 1));
                return list;
            }
        }, 15000);

        try {
            boolean done = latch.await(16, TimeUnit.SECONDS);
            if (!done) {
                return errorResponse("Hết thời gian chờ phản hồi từ máy in (Timeout 16s).");
            }
        } catch (InterruptedException e) {
            return errorResponse("Tiến trình in bị gián đoạn.");
        }

        if (success.get()) {
            JSONObject res = new JSONObject();
            try {
                res.put("success", true);
                res.put("message", "In hóa đơn tiếng Việt và mã VietQR thành công (đã cắt giấy)!");
            } catch (Exception ignored) {}
            return res.toString();
        } else {
            return errorResponse(errorMsg.get());
        }
    }

    private byte[] buildReceiptBytes(JSONObject r) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        DecimalFormat df = new DecimalFormat("#,###");

        String restName = r.optString("restaurant_name", "THANH DƯƠNG QUÁN");
        String tagline = r.optString("tagline", "Đậm Đà Hương Vị Quán Nhậu Việt");
        String address = r.optString("address", "123 Đường Bờ Kè, Quận 1, TP.HCM");
        String phone = r.optString("phone", "0909 123 456");
        String dateTime = r.optString("date_time", "");
        String note = r.optString("thank_you_note", "CẢM ƠN QUÝ KHÁCH VÀ HẸN GẶP LẠI!");

        double subtotal = r.optDouble("subtotal", 0);
        double discountTotal = r.optDouble("discount_total", 0);
        double adjustmentTotal = r.optDouble("adjustment_total", 0);
        double finalTotal = r.optDouble("final_total", 0);

        // 1. Init printer (ESC @)
        out.write(new byte[]{0x1B, 0x40});

        // 2. Center header
        out.write(new byte[]{0x1B, 0x61, 0x01});
        out.write(new byte[]{0x1B, 0x21, 0x30}); // Double height + bold
        out.write((restName + "\n").getBytes("UTF-8"));
        out.write(new byte[]{0x1B, 0x21, 0x00}); // Normal
        out.write((tagline + "\n").getBytes("UTF-8"));
        out.write((address + "\n").getBytes("UTF-8"));
        out.write(("Hotline: " + phone + "\n").getBytes("UTF-8"));
        out.write("================================================\n".getBytes("UTF-8"));
        out.write(new byte[]{0x1B, 0x21, 0x10}); // Bold
        out.write("PHIẾU THANH TOÁN\n".getBytes("UTF-8"));
        out.write(new byte[]{0x1B, 0x21, 0x00}); // Normal
        out.write("================================================\n".getBytes("UTF-8"));

        // 3. Tables & Time (Left align)
        out.write(new byte[]{0x1B, 0x61, 0x00});
        JSONArray tables = r.optJSONArray("table_names");
        String tablesStr = "---";
        if (tables != null && tables.length() > 0) {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < tables.length(); i++) {
                if (i > 0) sb.append(", ");
                sb.append(tables.getString(i));
            }
            tablesStr = sb.toString();
        }
        out.write(padLine("Bàn: " + tablesStr, "Giờ: " + dateTime, 48).getBytes("UTF-8"));
        out.write("\n------------------------------------------------\n".getBytes("UTF-8"));
        out.write(padLine("Tên món (SL x Đơn giá)", "Thành tiền", 48).getBytes("UTF-8"));
        out.write("\n------------------------------------------------\n".getBytes("UTF-8"));

        // 4. Line items
        JSONArray items = r.optJSONArray("items");
        if (items != null) {
            for (int i = 0; i < items.length(); i++) {
                JSONObject it = items.getJSONObject(i);
                String name = it.optString("name", "");
                int qty = it.optInt("quantity", 1);
                double price = it.optDouble("unit_price", 0);
                double total = it.optDouble("line_total", 0);

                out.write((name + "\n").getBytes("UTF-8"));
                String left = "   " + qty + " x " + df.format(price) + "đ";
                String right = df.format(total) + "đ";
                out.write(padLine(left, right, 48).getBytes("UTF-8"));
                out.write("\n".getBytes("UTF-8"));
            }
        }

        // 5. Totals
        out.write("------------------------------------------------\n".getBytes("UTF-8"));
        out.write(padLine("Tổng tiền món:", df.format(subtotal) + "đ", 48).getBytes("UTF-8"));
        out.write("\n".getBytes("UTF-8"));

        if (discountTotal > 0) {
            out.write(padLine("Giảm giá ưu đãi:", "-" + df.format(discountTotal) + "đ", 48).getBytes("UTF-8"));
            out.write("\n".getBytes("UTF-8"));
        }
        if (adjustmentTotal != 0) {
            String sign = adjustmentTotal > 0 ? "+" : "";
            out.write(padLine("Điều chỉnh hóa đơn:", sign + df.format(adjustmentTotal) + "đ", 48).getBytes("UTF-8"));
            out.write("\n".getBytes("UTF-8"));
        }

        out.write("================================================\n".getBytes("UTF-8"));
        out.write(new byte[]{0x1B, 0x21, 0x10}); // Bold
        out.write(padLine("TỔNG THANH TOÁN:", df.format(finalTotal) + "đ", 48).getBytes("UTF-8"));
        out.write("\n".getBytes("UTF-8"));
        out.write(new byte[]{0x1B, 0x21, 0x00}); // Normal
        out.write("================================================\n".getBytes("UTF-8"));

        // 6. Payments
        JSONArray payments = r.optJSONArray("payments");
        if (payments != null && payments.length() > 0) {
            for (int i = 0; i < payments.length(); i++) {
                JSONObject p = payments.getJSONObject(i);
                String method = p.optString("method", "CASH");
                double amt = p.optDouble("amount", 0);
                String label = "CASH".equals(method) ? "Tiền mặt" : "Chuyển khoản VietQR";
                out.write(padLine("Đã thanh toán (" + label + "):", df.format(amt) + "đ", 48).getBytes("UTF-8"));
                out.write("\n".getBytes("UTF-8"));
            }
        } else {
            out.write(padLine("Trạng thái:", "CHƯA THANH TOÁN", 48).getBytes("UTF-8"));
            out.write("\n".getBytes("UTF-8"));
        }

        // 7. Footer
        out.write("------------------------------------------------\n".getBytes("UTF-8"));
        out.write(new byte[]{0x1B, 0x61, 0x01}); // Center
        out.write((note + "\n").getBytes("UTF-8"));
        out.write(("In lúc: " + dateTime + "\n\n\n").getBytes("UTF-8"));

        return out.toByteArray();
    }

    private String padLine(String left, String right, int width) {
        int space = width - left.length() - right.length();
        if (space < 1) space = 1;
        StringBuilder sb = new StringBuilder(left);
        for (int i = 0; i < space; i++) {
            sb.append(' ');
        }
        sb.append(right);
        return sb.toString();
    }

    private String errorResponse(String msg) {
        JSONObject res = new JSONObject();
        try {
            res.put("success", false);
            res.put("message", msg);
        } catch (Exception ignored) {}
        return res.toString();
    }
}
