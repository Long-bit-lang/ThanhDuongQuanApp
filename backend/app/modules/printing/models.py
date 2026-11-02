"""Data models for receipt generation, print jobs, and printer status."""

from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, Field


class ReceiptItem(BaseModel):
    name: str
    quantity: int
    unit_price: Decimal
    line_total: Decimal


class ReceiptPayment(BaseModel):
    method: str
    amount: Decimal
    status: str
    time: str


class ReceiptData(BaseModel):
    restaurant_name: str = "THANH DƯƠNG QUÁN"
    tagline: str = "Quán nhậu bình dân — Ẩm thực đậm vị"
    address: str = "Tháp Chăm, Phú Vinh, TP Huế"
    phone: str = "0975 776 376"
    invoice_number: str
    invoice_id: str
    date_time: str
    table_names: List[str]
    cashier_name: str
    items: List[ReceiptItem]
    subtotal: Decimal
    discount_total: Decimal
    total_after_discount: Decimal
    adjustment_total: Decimal
    final_total: Decimal
    payments: List[ReceiptPayment]
    total_paid: Decimal
    balance_due: Decimal
    difference: Decimal
    thank_you_note: str = "CẢM ƠN QUÝ KHÁCH — HẸN GẶP LẠI!"
    qr_code_url: Optional[str] = None
    qr_code_data: Optional[str] = None
    formatted_text: Optional[str] = None


class PrintJobResponse(BaseModel):
    job_id: str
    invoice_number: str
    status: str
    byte_count: int
    printer_model: str = "ZYWELL ZY-Q822 (80mm)"
    message: str


class PrinterStatusResponse(BaseModel):
    status: str
    model: str
    paper_width_mm: int
    connection_type: str
    is_ready: bool
    mock_mode: bool
