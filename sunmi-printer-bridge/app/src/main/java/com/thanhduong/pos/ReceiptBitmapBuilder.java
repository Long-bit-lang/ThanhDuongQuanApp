package com.thanhduong.pos;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.DashPathEffect;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;
import android.util.Base64;
import android.util.Log;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.MultiFormatWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.EnumMap;
import java.util.Locale;
import java.util.Map;

/**
 * Builds high-resolution, monochrome 80mm thermal receipt bitmaps.
 *
 * Designed specifically for 80mm ESC/POS thermal printers (ZYWELL ZY-Q822).
 * Width: 576 dots (203 DPI, 72mm printable area).
 * Uses Android's native Canvas & font engine for 100% pixel-perfect Vietnamese
 * diacritic rendering and includes high-clarity VietQR payment barcode.
 */
public class ReceiptBitmapBuilder {
    private static final String TAG = "ReceiptBitmapBuilder";

    public static final int RECEIPT_WIDTH = 576;
    private static final int LEFT_MARGIN = 16;
    private static final int RIGHT_MARGIN = 560;
    private static final int USABLE_WIDTH = RIGHT_MARGIN - LEFT_MARGIN; // 544px
    private static final float CENTER_X = RECEIPT_WIDTH / 2f;

    // Default official VietQR payload for Thanh Dương Quán (Vietcombank 0161001729608)
    public static final String DEFAULT_VIETQR_DATA =
            "00020101021138570010A00000072701270006970436011301610017296080208QRIBFTTA53037045802VN6304B290";

    /**
     * Builds a complete receipt Bitmap from JSON.
     */
    public static Bitmap buildReceiptBitmap(Context context, JSONObject json) {
        // Pass 1: Measure exact height required
        float measuredHeight = drawReceiptContent(null, context, json);
        int totalHeight = (int) Math.ceil(measuredHeight);
        if (totalHeight < 100) totalHeight = 100;

        // Pass 2: Allocate bitmap and render content
        Bitmap bitmap = Bitmap.createBitmap(RECEIPT_WIDTH, totalHeight, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.drawColor(Color.WHITE); // Thermal paper is white

        drawReceiptContent(canvas, context, json);
        return bitmap;
    }

    /**
     * Builds a test receipt Bitmap to verify printer hardware, Vietnamese font, and QR code.
     */
    public static Bitmap buildTestReceiptBitmap(Context context) {
        JSONObject testJson = new JSONObject();
        try {
            testJson.put("restaurant_name", "THANH DƯƠNG QUÁN");
            testJson.put("tagline", "Đậm Đà Hương Vị Quán Nhậu Việt");
            testJson.put("address", "Tháp Chăm, Phú Vinh, TP Huế");
            testJson.put("phone", "0975 776 376");
            testJson.put("invoice_number", "TEST-" + System.currentTimeMillis() % 100000);
            testJson.put("date_time", new SimpleDateFormat("dd/MM/yyyy HH:mm:ss", Locale.getDefault()).format(new Date()));
            testJson.put("cashier_name", "Thu Ngân Test");

            JSONArray tables = new JSONArray();
            tables.put("Bàn 01 (In Thử)");
            testJson.put("table_names", tables);

            JSONArray items = new JSONArray();
            JSONObject item1 = new JSONObject();
            item1.put("name", "Kiểm tra tiếng Việt: Ắ Ằ Ẳ Ẵ Ặ Ế Ề Ể Ễ Ệ Ố Ồ Ổ Ỗ Ộ Ư Ứ Ừ Ử Ữ Ự Đ");
            item1.put("quantity", 1);
            item1.put("unit_price", 120000);
            item1.put("line_total", 120000);
            items.put(item1);

            JSONObject item2 = new JSONObject();
            item2.put("name", "Bia Huda Huế (Thùng 24 lon)");
            item2.put("quantity", 1);
            item2.put("unit_price", 320000);
            item2.put("line_total", 320000);
            items.put(item2);

            testJson.put("items", items);
            testJson.put("subtotal", 440000);
            testJson.put("discount_total", 40000);
            testJson.put("adjustment_total", 0);
            testJson.put("final_total", 400000);

            JSONArray payments = new JSONArray();
            JSONObject p = new JSONObject();
            p.put("method", "VIETQR");
            p.put("amount", 400000);
            payments.put(p);
            testJson.put("payments", payments);

            testJson.put("thank_you_note", "MÁY IN ZYWELL ZY-Q822 HOẠT ĐỘNG HOÀN HẢO!");
            testJson.put("qr_code_data", DEFAULT_VIETQR_DATA);
        } catch (Exception ignored) {}

        return buildReceiptBitmap(context, testJson);
    }

    /**
     * Unified measurement & rendering loop.
     * When canvas is null, it computes and returns the total required height.
     * When canvas is provided, it draws all elements at the exact computed coordinates.
     */
    private static float drawReceiptContent(Canvas canvas, Context context, JSONObject r) {
        float y = 28f;

        DecimalFormatSymbols symbols = new DecimalFormatSymbols(new Locale("vi", "VN"));
        symbols.setGroupingSeparator('.');
        DecimalFormat df = new DecimalFormat("#,###", symbols);

        // Paints setup
        Paint pText = new Paint(Paint.ANTI_ALIAS_FLAG);
        pText.setColor(Color.BLACK);

        Paint pSolid = new Paint(Paint.ANTI_ALIAS_FLAG);
        pSolid.setColor(Color.BLACK);
        pSolid.setStrokeWidth(2f);

        Paint pDashed = new Paint(Paint.ANTI_ALIAS_FLAG);
        pDashed.setColor(Color.BLACK);
        pDashed.setStrokeWidth(2f);
        pDashed.setStyle(Paint.Style.STROKE);
        pDashed.setPathEffect(new DashPathEffect(new float[]{8, 5}, 0));

        TextPaint tpBold = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        tpBold.setColor(Color.BLACK);
        tpBold.setTextSize(22f);
        tpBold.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));

        // 1. Header Information
        String restName = r.optString("restaurant_name", "THANH DƯƠNG QUÁN");
        String tagline = r.optString("tagline", "Đậm Đà Hương Vị Quán Nhậu Việt");
        String address = r.optString("address", "Tháp Chăm, Phú Vinh, TP Huế");
        String phone = r.optString("phone", "0975 776 376");
        String invNum = r.optString("invoice_number", "");
        String dateTime = r.optString("date_time", "");
        String cashier = r.optString("cashier_name", "");
        String note = r.optString("thank_you_note", "CẢM ƠN QUÝ KHÁCH — HẸN GẶP LẠI!");

        // Restaurant Name (Title)
        pText.setTextSize(34f);
        pText.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        pText.setTextAlign(Paint.Align.CENTER);
        if (canvas != null) canvas.drawText(restName, CENTER_X, y + 30f, pText);
        y += 44f;

        // Tagline
        pText.setTextSize(20f);
        pText.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.NORMAL));
        if (canvas != null) canvas.drawText(tagline, CENTER_X, y + 18f, pText);
        y += 28f;

        // Address
        pText.setTextSize(18f);
        if (canvas != null) canvas.drawText(address, CENTER_X, y + 16f, pText);
        y += 26f;

        // Phone Hotline
        if (canvas != null) canvas.drawText("Hotline: " + phone, CENTER_X, y + 16f, pText);
        y += 32f;

        // Double Divider Line
        y = drawDoubleLine(canvas, y, pSolid);

        // Receipt Title
        pText.setTextSize(28f);
        pText.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        if (canvas != null) canvas.drawText("PHIẾU THANH TOÁN", CENTER_X, y + 25f, pText);
        y += 36f;

        if (!invNum.isEmpty()) {
            pText.setTextSize(18f);
            pText.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.NORMAL));
            if (canvas != null) canvas.drawText("Số HĐ: " + invNum, CENTER_X, y + 16f, pText);
            y += 26f;
        }

        // Double Divider Line
        y = drawDoubleLine(canvas, y, pSolid);

        // 2. Table and Time Info
        JSONArray tables = r.optJSONArray("table_names");
        StringBuilder sbTables = new StringBuilder();
        if (tables != null && tables.length() > 0) {
            for (int i = 0; i < tables.length(); i++) {
                if (i > 0) sbTables.append(", ");
                String tName = tables.optString(i, "").replaceAll("(?i)^bàn\\s*", "").trim();
                sbTables.append(tName.isEmpty() ? tables.optString(i) : tName);
            }
        } else {
            sbTables.append("---");
        }

        y = drawTwoColumnText(canvas, "Bàn: " + sbTables.toString(), "Giờ: " + dateTime, y, 20f, true, false, pText);

        if (!cashier.isEmpty()) {
            y = drawTwoColumnText(canvas, "Thu ngân: " + cashier, "", y, 19f, false, false, pText);
        }

        // Dashed line
        y = drawDashedLine(canvas, y, pDashed);

        // 3. Table Column Header
        y = drawTwoColumnText(canvas, "Tên món (SL x Đơn giá)", "Thành tiền", y, 20f, true, true, pText);
        y = drawDashedLine(canvas, y, pDashed);

        // 4. Line Items
        JSONArray items = r.optJSONArray("items");
        if (items != null && items.length() > 0) {
            for (int i = 0; i < items.length(); i++) {
                JSONObject it = items.optJSONObject(i);
                if (it == null) continue;

                String name = it.optString("name", "");
                double qty = it.optDouble("quantity", 1);
                double unitPrice = it.optDouble("unit_price", 0);
                double lineTotal = it.optDouble("line_total", 0);

                // Dish Name (wrap text cleanly)
                StaticLayout sl = new StaticLayout(name, tpBold, USABLE_WIDTH, Layout.Alignment.ALIGN_NORMAL, 1.0f, 0.0f, false);
                if (canvas != null) {
                    canvas.save();
                    canvas.translate(LEFT_MARGIN, y);
                    sl.draw(canvas);
                    canvas.restore();
                }
                y += sl.getHeight() + 4f;

                // Subline: Qty x Unit price and Line total
                String qtyStr = (qty == (long) qty) ? String.format("%d", (long) qty) : new DecimalFormat("#.###").format(qty);
                String leftDetail = "   " + qtyStr + " x " + df.format(unitPrice) + "đ";
                String rightTotal = df.format(lineTotal) + "đ";
                y = drawTwoColumnText(canvas, leftDetail, rightTotal, y, 20f, false, true, pText);
                y += 6f; // Spacing to next item
            }
        }

        // Dashed line
        y = drawDashedLine(canvas, y, pDashed);

        // 5. Subtotals & Discounts
        double subtotal = r.optDouble("subtotal", 0);
        double discountTotal = r.optDouble("discount_total", 0);
        double adjustmentTotal = r.optDouble("adjustment_total", 0);
        double finalTotal = r.optDouble("final_total", 0);

        y = drawTwoColumnText(canvas, "Tổng tiền món:", df.format(subtotal) + "đ", y, 21f, false, false, pText);

        if (discountTotal > 0) {
            y = drawTwoColumnText(canvas, "Giảm giá ưu đãi:", "-" + df.format(discountTotal) + "đ", y, 21f, false, false, pText);
        }

        if (adjustmentTotal != 0) {
            String sign = adjustmentTotal > 0 ? "+" : "";
            y = drawTwoColumnText(canvas, "Điều chỉnh hóa đơn:", sign + df.format(adjustmentTotal) + "đ", y, 21f, false, false, pText);
        }

        // Double Divider Line
        y = drawDoubleLine(canvas, y, pSolid);

        // Final Total (Large bold)
        pText.setTextSize(28f);
        pText.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        pText.setTextAlign(Paint.Align.LEFT);
        if (canvas != null) canvas.drawText("TỔNG THANH TOÁN:", LEFT_MARGIN, y + 25f, pText);

        pText.setTextSize(30f);
        pText.setTextAlign(Paint.Align.RIGHT);
        if (canvas != null) canvas.drawText(df.format(finalTotal) + "đ", RIGHT_MARGIN, y + 25f, pText);
        y += 38f;

        // Double Divider Line
        y = drawDoubleLine(canvas, y, pSolid);

        // 6. Payments
        JSONArray payments = r.optJSONArray("payments");
        if (payments != null && payments.length() > 0) {
            for (int i = 0; i < payments.length(); i++) {
                JSONObject p = payments.optJSONObject(i);
                if (p == null) continue;

                String method = p.optString("method", "CASH");
                double amt = p.optDouble("amount", 0);
                String label = "CASH".equalsIgnoreCase(method) ? "Tiền mặt" : "Chuyển khoản";
                y = drawTwoColumnText(canvas, "Đã thanh toán (" + label + "):", df.format(amt) + "đ", y, 20f, false, true, pText);
            }
        } else {
            y = drawTwoColumnText(canvas, "Trạng thái:", "CHƯA THANH TOÁN", y, 20f, false, true, pText);
        }

        double diff = r.optDouble("difference", 0);
        if (diff > 0) {
            y = drawTwoColumnText(canvas, "Tiền thừa trả khách:", df.format(diff) + "đ", y, 20f, false, true, pText);
        }

        // 7. QR CODE PAYMENT SECTION
        y = drawDashedLine(canvas, y, pDashed);

        pText.setTextSize(21f);
        pText.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        pText.setTextAlign(Paint.Align.CENTER);
        if (canvas != null) canvas.drawText("QUÉT MÃ THANH TOÁN VIETQR", CENTER_X, y + 20f, pText);
        y += 30f;

        int qrPixelSize = 270;
        float qrLeft = CENTER_X - (qrPixelSize / 2f);

        if (canvas != null) {
            Bitmap qrBitmap = loadOrGenerateQr(context, r, qrPixelSize);
            if (qrBitmap != null) {
                Rect srcRect = new Rect(0, 0, qrBitmap.getWidth(), qrBitmap.getHeight());
                Rect dstRect = new Rect((int) qrLeft, (int) y, (int) (qrLeft + qrPixelSize), (int) (y + qrPixelSize));
                canvas.drawBitmap(qrBitmap, srcRect, dstRect, null);
            }
        }
        y += qrPixelSize + 10f;

        // Bank details under QR
        pText.setTextSize(20f);
        pText.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.NORMAL));
        pText.setTextAlign(Paint.Align.CENTER);
        if (canvas != null) canvas.drawText("Chủ TK: THANH DƯƠNG QUÁN", CENTER_X, y + 18f, pText);
        y += 28f;

        pText.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        if (canvas != null) canvas.drawText("STK: 0161001729608 - Vietcombank", CENTER_X, y + 18f, pText);
        y += 32f;

        // 8. Footer
        y = drawDashedLine(canvas, y, pDashed);

        pText.setTextSize(22f);
        pText.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        pText.setTextAlign(Paint.Align.CENTER);
        if (canvas != null) canvas.drawText(note, CENTER_X, y + 20f, pText);
        y += 34f;

        pText.setTextSize(17f);
        pText.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.NORMAL));
        if (canvas != null) canvas.drawText("Thanh Dương Quán POS • Máy in ZYWELL 80mm", CENTER_X, y + 16f, pText);
        y += 65f; // Generous bottom whitespace for safe cutting without touching text

        return y;
    }

    private static float drawTwoColumnText(Canvas canvas, String left, String right, float y, float size, boolean boldLeft, boolean boldRight, Paint p) {
        p.setTextSize(size);
        p.setTextAlign(Paint.Align.LEFT);
        p.setTypeface(boldLeft ? Typeface.create(Typeface.DEFAULT, Typeface.BOLD) : Typeface.DEFAULT);
        if (canvas != null) canvas.drawText(left, LEFT_MARGIN, y + size, p);

        p.setTextAlign(Paint.Align.RIGHT);
        p.setTypeface(boldRight ? Typeface.create(Typeface.DEFAULT, Typeface.BOLD) : Typeface.DEFAULT);
        if (canvas != null) canvas.drawText(right, RIGHT_MARGIN, y + size, p);

        return y + size + 10f;
    }

    private static float drawDoubleLine(Canvas canvas, float y, Paint paint) {
        if (canvas != null) {
            canvas.drawLine(LEFT_MARGIN, y + 2f, RIGHT_MARGIN, y + 2f, paint);
            canvas.drawLine(LEFT_MARGIN, y + 7f, RIGHT_MARGIN, y + 7f, paint);
        }
        return y + 16f;
    }

    private static float drawDashedLine(Canvas canvas, float y, Paint paint) {
        if (canvas != null) {
            Path path = new Path();
            path.moveTo(LEFT_MARGIN, y + 3f);
            path.lineTo(RIGHT_MARGIN, y + 3f);
            canvas.drawPath(path, paint);
        }
        return y + 14f;
    }

    /**
     * Obtains or dynamically generates the QR Code bitmap:
     * 1. If base64 provided, decodes base64.
     * 2. If qr_code_data provided (or default VietQR string), generates crisp vector QR via ZXing.
     * 3. Fallback to bundled official_qr drawable.
     */
    public static Bitmap loadOrGenerateQr(Context context, JSONObject r, int size) {
        // 1. Check if base64 provided
        String base64 = r.optString("qr_code_base64", "");
        if (!base64.isEmpty()) {
            try {
                if (base64.contains(",")) {
                    base64 = base64.substring(base64.indexOf(",") + 1);
                }
                byte[] decoded = Base64.decode(base64, Base64.DEFAULT);
                Bitmap b = BitmapFactory.decodeByteArray(decoded, 0, decoded.length);
                if (b != null) return b;
            } catch (Exception e) {
                Log.w(TAG, "Failed to decode qr_code_base64", e);
            }
        }

        // 2. Generate via ZXing using qr_code_data or DEFAULT_VIETQR_DATA
        String qrData = r.optString("qr_code_data", "");
        if (qrData.isEmpty()) {
            qrData = DEFAULT_VIETQR_DATA;
        }

        try {
            Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
            hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");
            hints.put(EncodeHintType.MARGIN, 1);
            hints.put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M);

            BitMatrix matrix = new MultiFormatWriter().encode(qrData, BarcodeFormat.QR_CODE, size, size, hints);
            int w = matrix.getWidth();
            int h = matrix.getHeight();
            int[] pixels = new int[w * h];
            for (int y = 0; y < h; y++) {
                int offset = y * w;
                for (int x = 0; x < w; x++) {
                    pixels[offset + x] = matrix.get(x, y) ? Color.BLACK : Color.WHITE;
                }
            }
            Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            bmp.setPixels(pixels, 0, w, 0, 0, w, h);
            return bmp;
        } catch (Exception e) {
            Log.w(TAG, "ZXing QR generation failed, falling back to drawable", e);
        }

        // 3. Fallback to bundled drawable
        try {
            return BitmapFactory.decodeResource(context.getResources(), R.drawable.official_qr);
        } catch (Exception e) {
            Log.e(TAG, "Failed to load official_qr from drawable resources", e);
            return null;
        }
    }
}
