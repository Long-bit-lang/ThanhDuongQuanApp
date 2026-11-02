"""Receipt formatter for 80mm thermal printers with Vietnamese diacritics and ESC/POS commands."""

from decimal import Decimal
from typing import List
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from app.modules.printing.models import ReceiptData, ReceiptItem

VIETNAM_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


def format_vietnam_time(dt: datetime, fmt: str = "%d/%m/%Y %H:%M:%S") -> str:
    """Converts a database UTC datetime to Vietnam local timezone (Asia/Ho_Chi_Minh) and formats it."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(VIETNAM_TZ).strftime(fmt)


def format_quantity(qty: Decimal) -> str:
    """Formats decimal quantity e.g. 24, 0.5, 0.22 cleanly without unnecessary trailing zeroes."""
    if qty % 1 == 0:
        return str(int(qty))
    return f"{qty:.3f}".rstrip("0").rstrip(".")


def format_money(val: Decimal) -> str:
    """Formats decimal to Vietnamese currency string: e.g. 150.000đ."""
    return f"{int(val):,}".replace(",", ".") + "đ"


def pad_line(left: str, right: str, width: int = 48) -> str:
    """Pads a 2-column line to exact width with spaces in between."""
    space_count = max(1, width - len(left) - len(right))
    return left + (" " * space_count) + right


def generate_receipt_text(receipt: ReceiptData, width: int = 48) -> str:
    """Generates human-readable and thermal-printable 80mm receipt text."""
    divider = "-" * width
    double_divider = "=" * width

    lines: List[str] = []
    lines.append(receipt.restaurant_name.center(width))
    lines.append(receipt.tagline.center(width))
    lines.append(receipt.address.center(width))
    lines.append(f"ĐT: {receipt.phone}".center(width))
    lines.append(double_divider)
    lines.append("PHIẾU THANH TOÁN".center(width))
    lines.append(double_divider)

    clean_tables = [t.replace("Bàn ", "").replace("bàn ", "").strip() for t in receipt.table_names] if receipt.table_names else ["---"]
    tables_str = ", ".join(clean_tables)
    lines.append(pad_line(f"Bàn: {tables_str}", f"Giờ: {receipt.date_time}", width))
    lines.append(divider)

    # Table header: Món (left), SL (col), Đơn giá, Thành tiền (right)
    lines.append(pad_line("Tên món (SL x Giá)", "Thành tiền", width))
    lines.append(divider)

    for it in receipt.items:
        qty_price = f"{format_quantity(it.quantity)} x {format_money(it.unit_price)}"
        total_str = format_money(it.line_total)
        # Line 1: Item name
        lines.append(it.name)
        # Line 2: indentation + qty x price ... total
        subline = pad_line(f"   {qty_price}", total_str, width)
        lines.append(subline)

    lines.append(divider)
    lines.append(pad_line("Tổng tiền món:", format_money(receipt.subtotal), width))

    if receipt.discount_total > 0:
        lines.append(pad_line("Giảm giá:", f"-{format_money(receipt.discount_total)}", width))

    if receipt.adjustment_total != 0:
        sign = "+" if receipt.adjustment_total > 0 else ""
        lines.append(pad_line("Điều chỉnh hóa đơn:", f"{sign}{format_money(receipt.adjustment_total)}", width))

    lines.append(double_divider)
    lines.append(pad_line("TỔNG CỘNG THANH TOÁN:", format_money(receipt.final_total), width))
    lines.append(double_divider)

    if receipt.payments:
        for p in receipt.payments:
            method_label = "Tiền mặt" if p.method == "CASH" else "Chuyển khoản"
            lines.append(pad_line(f"Đã trả ({method_label}):", format_money(p.amount), width))

        if receipt.difference > 0:
            lines.append(pad_line("Chênh lệch sau điều chỉnh:", format_money(receipt.difference), width))
    else:
        lines.append(pad_line("Trạng thái:", "CHƯA THANH TOÁN", width))

    if receipt.qr_code_url:
        lines.append(divider)
        lines.append("[ MÃ QR THANH TOÁN ]".center(width))

    lines.append(divider)
    lines.append(receipt.thank_you_note.center(width))
    lines.append(f"In lúc: {receipt.date_time}".center(width))
    lines.append("\n\n\n")  # Feed lines for tear/cut

    return "\n".join(lines)


def generate_escpos_commands(receipt: ReceiptData) -> bytes:
    """Generates binary ESC/POS command stream for 80mm thermal receipt printer.
    
    Includes:
    - ESC @: Initialize printer
    - ESC a 1: Center align header
    - ESC ! 0x38: Double height & bold for restaurant title
    - GS ( k: Native ESC/POS 2D Barcode (QR Code) command
    - GS V 66 0: Feed paper and partial cut
    """
    buffer = bytearray()

    # 1. Initialize printer
    buffer.extend(b"\x1b\x40")

    # 2. Character code table UTF-8
    buffer.extend(b"\x1b\x74\x00")

    # 3. Center alignment
    buffer.extend(b"\x1b\x61\x01")
    # Bold + Double Height
    buffer.extend(b"\x1b\x21\x30")
    buffer.extend(receipt.restaurant_name.encode("utf-8") + b"\n")
    # Reset font
    buffer.extend(b"\x1b\x21\x00")
    buffer.extend(receipt.tagline.encode("utf-8") + b"\n")
    buffer.extend(f"ĐC: {receipt.address} - ĐT: {receipt.phone}\n".encode("utf-8"))
    buffer.extend(b"================================================\n")
    buffer.extend("PHIẾU THANH TOÁN\n".encode("utf-8"))
    buffer.extend(b"================================================\n")

    # 4. Left alignment for details
    buffer.extend(b"\x1b\x61\x00")
    raw_text = generate_receipt_text(receipt)
    buffer.extend(raw_text.encode("utf-8"))

    # 5. Print native ESC/POS QR Code if qr_code_url exists
    if receipt.qr_code_url:
        # Center align QR code
        buffer.extend(b"\x1b\x61\x01")
        buffer.extend("\n[ MA QR THANH TOAN ]\n".encode("utf-8"))

        # Official QR code payload for Thanh Dương Quán (Vietcombank 0161001729608)
        qr_content = "00020101021138570010A00000072701270006970436011301610017296080208QRIBFTTA53037045802VN6304B290"
        qr_bytes = qr_content.encode("utf-8")
        data_len = len(qr_bytes) + 3
        pL = data_len % 256
        pH = data_len // 256

        # Function 165: Select QR Model 2
        buffer.extend(b"\x1d\x28\x6b\x04\x00\x31\x41\x32\x00")
        # Function 167: Set module size (size 8 for large clear QR)
        buffer.extend(b"\x1d\x28\x6b\x03\x00\x31\x43\x08")
        # Function 169: Error correction level M (49)
        buffer.extend(b"\x1d\x28\x6b\x03\x00\x31\x45\x31")
        # Function 180: Store data
        buffer.extend(bytes([0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30]))
        buffer.extend(qr_bytes)
        # Function 181: Print QR symbol
        buffer.extend(b"\x1d\x28\x6b\x03\x00\x31\x51\x30")
        buffer.extend(b"\n\n")

    # 6. Feed and Auto-Cut (GS V 66 10)
    buffer.extend(b"\x1d\x56\x42\x0a")

    return bytes(buffer)
