"""Printing API endpoints for printer status and mock print jobs."""

from fastapi import APIRouter, Depends, HTTPException
from app.modules.identity.dependencies import require_roles
from app.modules.identity.models import User
from app.modules.printing.models import PrintJobResponse, PrinterStatusResponse, ReceiptData
from app.modules.printing.service import printer_service
from app.modules.printing.adapter import ZywellPos80Adapter

router = APIRouter(prefix="/printing", tags=["Printing"])
STAFF_ROLES = ("OWNER", "CASHIER")


@router.get("/status", response_model=PrinterStatusResponse)
async def get_printer_status(
    _: User = Depends(require_roles(*STAFF_ROLES)),
):
    """Returns status of the 80mm ZYWELL receipt printer."""
    return printer_service.get_status()


@router.get("/device-info")
async def get_device_info(
    _: User = Depends(require_roles(*STAFF_ROLES)),
):
    """Returns hardware profile and Android SDK specifications."""
    return ZywellPos80Adapter.get_device_info()


@router.post("/mock-print", response_model=PrintJobResponse)
async def mock_print_receipt(
    receipt: ReceiptData,
    _: User = Depends(require_roles(*STAFF_ROLES)),
):
    """Simulates sending a print job to the ZYWELL printer."""
    return printer_service.execute_print(receipt)
