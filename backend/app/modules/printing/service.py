"""Mock Printer Service for simulating receipt printing during development and automated tests."""

import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional
from app.modules.printing.models import ReceiptData, PrintJobResponse, PrinterStatusResponse
from app.modules.printing.formatter import generate_escpos_commands, generate_receipt_text


class MockPrinterService:
    def __init__(self) -> None:
        self.jobs: List[PrintJobResponse] = []
        self.is_online: bool = True

    def get_status(self) -> PrinterStatusResponse:
        return PrinterStatusResponse(
            status="READY" if self.is_online else "OFFLINE",
            model="ZYWELL ZY-Q822",
            paper_width_mm=80,
            connection_type="USB",
            is_ready=self.is_online,
            mock_mode=True,
        )

    def execute_print(self, receipt: ReceiptData) -> PrintJobResponse:
        esc_bytes = generate_escpos_commands(receipt)
        job_id = f"PJ-{uuid.uuid4().hex[:8].upper()}"
        job = PrintJobResponse(
            job_id=job_id,
            invoice_number=receipt.invoice_number,
            status="SUCCESS",
            byte_count=len(esc_bytes),
            printer_model="ZYWELL ZY-Q822 (80mm)",
            message=f"In hóa đơn {receipt.invoice_number} thành công trên máy in mô phỏng 80mm",
        )
        self.jobs.append(job)
        return job


printer_service = MockPrinterService()
