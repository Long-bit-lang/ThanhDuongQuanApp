"""Payment operations: Cash, VietQR mock, idempotency protection, and immutable records."""

import uuid
from typing import Literal
from decimal import Decimal
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import dispatch_pos_event
from app.db.session import get_db
from app.modules.identity.dependencies import require_roles
from app.modules.identity.models import User
from app.modules.audit.models import AuditLog
from app.modules.billing.models import Invoice
from app.modules.payments.models import Payment

router = APIRouter(tags=["Payments"])
ROLES = ("OWNER", "CASHIER")


class PaymentRequest(BaseModel):
    method: Literal["CASH", "VIETQR_MOCK"]
    idempotency_key: str = Field(min_length=8, max_length=128, description="Khóa chống thanh toán lặp")


@router.get("/invoices/{invoice_id}/vietqr-mock")
async def get_vietqr_mock_payload(
    invoice_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(*ROLES)),
):
    """Generates mock VietQR payload and display string for cashier screen."""
    invoice = await db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Không tìm thấy hóa đơn")

    payable_amount = invoice.total_after_discount + invoice.adjustment_total
    content = f"TDQ {invoice.invoice_number}"
    # Official QR code URL for Thanh Dương Quán
    mock_qr_url = "/qr/official_qr.png"

    return {
        "invoice_id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "amount": payable_amount,
        "bank_name": "Vietcombank",
        "account_no": "0161001729608",
        "account_name": "THANH DƯƠNG QUÁN",
        "transfer_content": content,
        "mock_qr_url": mock_qr_url,
        "status": "WAITING_CONFIRMATION",
    }


@router.post("/invoices/{invoice_id}/payments", status_code=status.HTTP_201_CREATED)
async def process_payment(
    invoice_id: uuid.UUID,
    payload: PaymentRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(*ROLES)),
):
    """Processes payment for an invoice with strict idempotency and immutability."""
    # 1. Check idempotency key first
    existing_key = await db.scalar(select(Payment).where(Payment.idempotency_key == payload.idempotency_key))
    if existing_key:
        if existing_key.invoice_id != invoice_id:
            raise HTTPException(status_code=409, detail="Idempotency key này đã được sử dụng cho một hóa đơn khác")
        response.status_code = status.HTTP_200_OK
        return {
            "id": existing_key.id,
            "status": existing_key.status,
            "method": existing_key.method,
            "amount": existing_key.amount,
            "idempotent": True,
        }

    # 2. Lock invoice
    invoice = await db.scalar(select(Invoice).where(Invoice.id == invoice_id).with_for_update())
    if not invoice:
        raise HTTPException(status_code=404, detail="Không tìm thấy hóa đơn")
    if invoice.status == "PAID":
        raise HTTPException(status_code=409, detail="Hóa đơn này đã được thanh toán trước đó")

    payable_amount = invoice.total_after_discount + invoice.adjustment_total
    if payable_amount < Decimal("0"):
        payable_amount = Decimal("0")

    payment = Payment(
        invoice_id=invoice.id,
        method=payload.method,
        amount=payable_amount,
        idempotency_key=payload.idempotency_key,
        confirmed_by_id=user.id,
    )
    db.add(payment)
    invoice.status = "PAID"
    await db.flush()

    # 3. Audit log
    db.add(AuditLog(
        actor_id=user.id,
        actor_username=user.username,
        action="PAYMENT_CONFIRMED",
        entity_type="payment",
        entity_id=str(payment.id),
        details={
            "invoice_id": str(invoice.id),
            "invoice_number": invoice.invoice_number,
            "method": payload.method,
            "amount": float(payment.amount),
            "idempotency_key": payload.idempotency_key,
        },
    ))
    await db.flush()

    dispatch_pos_event("PAYMENT_CONFIRMED", {
        "payment_id": str(payment.id),
        "invoice_id": str(invoice.id),
        "invoice_number": invoice.invoice_number,
        "amount": float(payment.amount),
        "method": payment.method,
    })

    return {
        "id": payment.id,
        "status": payment.status,
        "method": payment.method,
        "amount": payment.amount,
        "vietqr_mock": payload.method == "VIETQR_MOCK",
        "idempotent": False,
    }


@router.get("/invoices/{invoice_id}/payments")
async def get_invoice_payments(
    invoice_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(*ROLES)),
):
    """Returns payment history for an invoice."""
    return list((await db.scalars(select(Payment).where(Payment.invoice_id == invoice_id))).all())


@router.get("/payments/{payment_id}")
async def get_payment(
    payment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(*ROLES)),
):
    """Returns details of a specific payment transaction."""
    payment = await db.get(Payment, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Không tìm thấy giao dịch thanh toán")
    return payment
