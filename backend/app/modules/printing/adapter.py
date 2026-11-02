"""ZYWELL POS80 SDK Adapter & SUNMI T1-G Device Layer Integration."""

import logging
from typing import Dict, Any
from app.modules.printing.models import ReceiptData
from app.modules.printing.formatter import generate_receipt_text, generate_escpos_commands

logger = logging.getLogger(__name__)


class ZywellPos80Adapter:
    """Adapter defining translation between Thanh Đường Quán POS receipts
    and the native ZYWELL Android SDK (net.posprinter.utils.DataForSendToPrinterPos80).
    
    Target Device: SUNMI T1-G POS (Android 6.0.1, SUNMI OS 2.7.15)
    Printer Model: ZYWELL ZY-Q822 (80mm Thermal, USB Interface, Auto-Cutter)
    """

    PORT_TYPE = "USB"  # PosPrinterDev.PortType.USB
    CHARSET = "UTF-8"

    @classmethod
    def get_device_info(cls) -> Dict[str, Any]:
        return {
            "device_model": "SUNMI T1-G",
            "android_version": "6.0.1",
            "sunmi_os": "2.7.15",
            "printer_model": "ZYWELL ZY-Q822",
            "paper_width_mm": 80,
            "columns": 48,
            "connection": "USB-A to USB-B OTG",
            "auto_cutter": True,
            "sdk_package": "net.posprinter.utils.DataForSendToPrinterPos80",
        }

    @classmethod
    def build_sdk_payload(cls, receipt: ReceiptData) -> Dict[str, Any]:
        """Prepares receipt payload for transmission to Android SUNMI native service."""
        raw_text = generate_receipt_text(receipt)
        escpos_bytes = generate_escpos_commands(receipt)
        return {
            "invoice_number": receipt.invoice_number,
            "port_type": cls.PORT_TYPE,
            "raw_text": raw_text,
            "escpos_base64": escpos_bytes.hex(),
            "cut_paper": True,
            "cut_mode": 66,  # selectCutPagerModerAndCutPager(66, 1)
        }

    @classmethod
    def get_android_java_integration_snippet(cls) -> str:
        """Verified Android Java code snippet to be used in SUNMI T1-G native app."""
        return """
// Java Integration snippet for SUNMI T1-G with ZYWELL PosPrinterSDK
import net.posprinter.posprinterface.IMyBinder;
import net.posprinter.posprinterface.TaskCallback;
import net.posprinter.service.PosprinterService;
import net.posprinter.utils.DataForSendToPrinterPos80;
import net.posprinter.utils.PosPrinterDev;
import net.posprinter.utils.StringUtils;

public void printReceiptOnZywell(IMyBinder myBinder, String receiptText) {
    // 1. Initialize printer
    myBinder.WriteSendData(new TaskCallback() {
        @Override public void OnSucceed() {}
        @Override public void OnFailed() {}
    }, new ProcessData() {
        @Override public List<byte[]> processDataBeforeSend() {
            List<byte[]> list = new ArrayList<>();
            // Init
            list.add(DataForSendToPrinterPos80.initializePrinter());
            // Align Left
            list.add(DataForSendToPrinterPos80.selectAlignment(0));
            // Content bytes encoded in UTF-8
            list.add(StringUtils.strTobytes(receiptText, "UTF-8"));
            // Feed lines
            list.add(DataForSendToPrinterPos80.printAndFeedForward(4));
            // Partial paper cut
            list.add(DataForSendToPrinterPos80.selectCutPagerModerAndCutPager(66, 1));
            return list;
        }
    });
}
"""
