"""Billing operations: invoices, discounts, adjustments, and formatted receipt preview."""

import uuid
from decimal import Decimal
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import dispatch_pos_event
from app.db.session import get_db
from app.modules.identity.dependencies import require_roles
from app.modules.identity.models import User
from app.modules.audit.models import AuditLog
from app.modules.floor.models import ServiceSession, SessionTable, DiningTable
from app.modules.service.models import OrderItem
from app.modules.billing.models import Invoice, InvoiceItem, Discount, InvoiceAdjustment
from app.modules.billing.schemas import DiscountRequest, AdjustmentRequest
from app.modules.payments.models import Payment
from app.modules.printing.models import ReceiptData, ReceiptItem, ReceiptPayment
from app.modules.printing.formatter import generate_receipt_text, format_vietnam_time, VIETNAM_TZ
from app.modules.billing.services import recompute_invoice_totals, sync_invoice_with_session

router = APIRouter(tags=["Billing"])
ROLES = ("OWNER", "CASHIER")


@router.post("/sessions/{session_id}/invoice", status_code=status.HTTP_201_CREATED)
async def create_invoice(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(*ROLES)),
):
    """Creates or returns the single finalized invoice for a service session."""
    session = await db.scalar(select(ServiceSession).where(ServiceSession.id == session_id).with_for_update())
    if not session:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên phục vụ")

    existing = await db.scalar(select(Invoice).where(Invoice.session_id == session_id).with_for_update())
    if existing:
        if existing.status != "PAID":
            await sync_invoice_with_session(existing, db)
        return {"id": existing.id, "invoice_number": existing.invoice_number, "status": existing.status}

    active_items = list(
        (await db.scalars(
            select(OrderItem).where(OrderItem.session_id == session_id, OrderItem.status == "ACTIVE")
        )).all()
    )
    if not active_items:
        raise HTTPException(status_code=409, detail="Không có món hợp lệ (chưa bị hủy) để lập hóa đơn")

    invoice_number = f"TDQ-{datetime.now(VIETNAM_TZ).strftime('%y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    invoice = Invoice(
        invoice_number=invoice_number,
        session_id=session_id,
        created_by_id=user.id,
    )
    db.add(invoice)
    await db.flush()

    for item in active_items:
        db.add(
            InvoiceItem(
                invoice_id=invoice.id,
                order_item_id=item.id,
                product_name_snapshot=item.product_name_snapshot,
                unit_price_snapshot=item.unit_price_snapshot,
                quantity=item.quantity,
                line_total=item.unit_price_snapshot * item.quantity,
            )
        )
    await db.flush()
    await recompute_invoice_totals(invoice, db)

    # Audit log
    db.add(AuditLog(
        actor_id=user.id,
        actor_username=user.username,
        action="INVOICE_CREATED",
        entity_type="invoice",
        entity_id=str(invoice.id),
        details={"invoice_number": invoice.invoice_number, "subtotal": float(invoice.subtotal)},
    ))
    await db.flush()

    dispatch_pos_event("INVOICE_CREATED", {
        "invoice_id": str(invoice.id),
        "invoice_number": invoice.invoice_number,
        "session_id": str(session_id),
        "total": float(invoice.total_after_discount),
    })

    return {"id": invoice.id, "invoice_number": invoice.invoice_number, "status": invoice.status}


@router.get("/invoices")
async def list_invoices(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(*ROLES)),
):
    """Lists all invoices ordered by newest created first."""
    invoices = list((await db.scalars(select(Invoice).order_by(Invoice.created_at.desc()))).all())
    return [
        {
            "id": inv.id,
            "invoice_number": inv.invoice_number,
            "session_id": inv.session_id,
            "status": inv.status,
            "subtotal": inv.subtotal,
            "discount_total": inv.discount_total,
            "total_after_discount": inv.total_after_discount,
            "adjustment_total": inv.adjustment_total,
            "final_total": inv.total_after_discount + inv.adjustment_total,
            "created_at": inv.created_at,
        }
        for inv in invoices
    ]


@router.get("/invoices/{invoice_id}")
async def get_invoice(
    invoice_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(*ROLES)),
):
    """Returns invoice details with line items, discounts, adjustments, and payments."""
    invoice = await db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Không tìm thấy hóa đơn")

    if invoice.status != "PAID":
        await sync_invoice_with_session(invoice, db)

    items = list((await db.scalars(select(InvoiceItem).where(InvoiceItem.invoice_id == invoice.id))).all())
    discounts = list((await db.scalars(select(Discount).where(Discount.invoice_id == invoice.id))).all())
    adjustments = list((await db.scalars(select(InvoiceAdjustment).where(InvoiceAdjustment.invoice_id == invoice.id))).all())
    payments = list((await db.scalars(select(Payment).where(Payment.invoice_id == invoice.id))).all())

    return {
        "id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "session_id": invoice.session_id,
        "status": invoice.status,
        "subtotal": invoice.subtotal,
        "discount_total": invoice.discount_total,
        "total_after_discount": invoice.total_after_discount,
        "adjustment_total": invoice.adjustment_total,
        "final_total": invoice.total_after_discount + invoice.adjustment_total,
        "created_at": invoice.created_at,
        "items": [
            {
                "id": it.id,
                "product_name": it.product_name_snapshot,
                "unit_price": it.unit_price_snapshot,
                "quantity": it.quantity,
                "line_total": it.line_total,
            }
            for it in items
        ],
        "discounts": [
            {
                "id": d.id,
                "type": d.discount_type,
                "value": d.value,
                "amount": d.amount,
                "invoice_item_id": d.invoice_item_id,
            }
            for d in discounts
        ],
        "adjustments": [
            {
                "id": a.id,
                "amount": a.amount,
                "reason": a.reason,
                "created_at": a.created_at,
            }
            for a in adjustments
        ],
        "payments": [
            {
                "id": p.id,
                "method": p.method,
                "amount": p.amount,
                "status": p.status,
                "created_at": p.created_at,
            }
            for p in payments
        ],
    }


@router.post("/invoices/{invoice_id}/discounts")
async def add_discount(
    invoice_id: uuid.UUID,
    payload: DiscountRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(*ROLES)),
):
    """Applies a discount (percentage or fixed amount) to an item or entire invoice."""
    invoice = await db.scalar(select(Invoice).where(Invoice.id == invoice_id).with_for_update())
    if not invoice:
        raise HTTPException(status_code=404, detail="Không tìm thấy hóa đơn")
    if invoice.status == "PAID":
        raise HTTPException(status_code=409, detail="Không thể áp dụng giảm giá cho hóa đơn đã thanh toán")

    base = invoice.subtotal
    line_id = uuid.UUID(payload.invoice_item_id) if payload.invoice_item_id else None
    if line_id:
        line = await db.get(InvoiceItem, line_id)
        if not line or line.invoice_id != invoice.id:
            raise HTTPException(status_code=422, detail="Món được giảm giá không thuộc hóa đơn này")
        base = line.line_total

    if payload.discount_type == "PERCENT":
        if payload.value > Decimal("100"):
            raise HTTPException(status_code=422, detail="Phần trăm giảm giá không được vượt quá 100%")
        amount = (base * payload.value / Decimal("100")).quantize(Decimal("1.00"))
    else:
        amount = payload.value

    if amount > base:
        raise HTTPException(status_code=422, detail="Số tiền giảm giá vượt quá giá trị của đối tượng áp dụng")

    discount = Discount(
        invoice_id=invoice.id,
        invoice_item_id=line_id,
        discount_type=payload.discount_type,
        value=payload.value,
        amount=amount,
        applied_by_id=user.id,
    )
    db.add(discount)
    await db.flush()
    await recompute_invoice_totals(invoice, db)

    # Audit log
    db.add(AuditLog(
        actor_id=user.id,
        actor_username=user.username,
        action="DISCOUNT_APPLIED",
        entity_type="invoice",
        entity_id=str(invoice.id),
        details={
            "discount_type": payload.discount_type,
            "value": float(payload.value),
            "amount": float(amount),
            "target": str(line_id) if line_id else "WHOLE_INVOICE",
        },
    ))
    await db.flush()

    return {
        "discount_amount": amount,
        "total_after_discount": invoice.total_after_discount,
        "final_total": invoice.total_after_discount + invoice.adjustment_total,
    }


@router.post("/invoices/{invoice_id}/adjustments")
async def add_adjustment(
    invoice_id: uuid.UUID,
    payload: AdjustmentRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(*ROLES)),
):
    """Records an adjustment on an invoice."""
    invoice = await db.scalar(select(Invoice).where(Invoice.id == invoice_id).with_for_update())
    if not invoice:
        raise HTTPException(status_code=404, detail="Không tìm thấy hóa đơn")

    adj = InvoiceAdjustment(
        invoice_id=invoice.id,
        amount=payload.amount,
        reason=payload.reason,
        created_by_id=user.id,
    )
    db.add(adj)
    await db.flush()
    await recompute_invoice_totals(invoice, db)

    # Audit log
    db.add(AuditLog(
        actor_id=user.id,
        actor_username=user.username,
        action="INVOICE_ADJUSTED",
        entity_type="invoice",
        entity_id=str(invoice.id),
        details={"amount": float(payload.amount), "reason": payload.reason},
    ))
    await db.flush()

    return {
        "adjustment_total": invoice.adjustment_total,
        "final_total": invoice.total_after_discount + invoice.adjustment_total,
    }


@router.get("/invoices/{invoice_id}/receipt", response_model=ReceiptData)
async def get_receipt(
    invoice_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(*ROLES)),
):
    """Generates complete structured and formatted receipt data for 80mm thermal preview or print."""
    invoice = await db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Không tìm thấy hóa đơn")

    if invoice.status != "PAID":
        await sync_invoice_with_session(invoice, db)

    # Get table names
    memberships = list(
        (await db.scalars(
            select(SessionTable).where(SessionTable.session_id == invoice.session_id)
        )).all()
    )
    table_ids = [m.table_id for m in memberships]
    tables = list((await db.scalars(select(DiningTable).where(DiningTable.id.in_(table_ids)))).all()) if table_ids else []
    table_names = [t.display_name for t in tables]

    # Get items and consolidate identical products (e.g. from merged tables)
    invoice_items = list((await db.scalars(select(InvoiceItem).where(InvoiceItem.invoice_id == invoice.id))).all())
    consolidated: dict[tuple[str, Decimal], ReceiptItem] = {}
    for it in invoice_items:
        key = (it.product_name_snapshot, it.unit_price_snapshot)
        if key in consolidated:
            consolidated[key].quantity += it.quantity
            consolidated[key].line_total += it.line_total
        else:
            consolidated[key] = ReceiptItem(
                name=it.product_name_snapshot,
                quantity=it.quantity,
                unit_price=it.unit_price_snapshot,
                line_total=it.line_total,
            )
    receipt_items = list(consolidated.values())

    # Get payments
    payments = list((await db.scalars(select(Payment).where(Payment.invoice_id == invoice.id))).all())
    receipt_payments = [
        ReceiptPayment(
            method=p.method,
            amount=p.amount,
            status=p.status,
            time=format_vietnam_time(p.created_at),
        )
        for p in payments
    ]

    total_paid = sum(p.amount for p in payments)
    final_total = invoice.total_after_discount + invoice.adjustment_total
    balance_due = max(Decimal("0"), final_total - total_paid)
    difference = total_paid - final_total if total_paid > final_total else Decimal("0")

    creator = await db.get(User, invoice.created_by_id)
    cashier_name = creator.full_name if creator else current_user.full_name

    # Official QR code URL and EMVCo payload for Thanh Dương Quán (Vietcombank 0161001729608)
    qr_code_url = "/qr/official_qr.png"
    qr_code_data = "00020101021138570010A00000072701270006970436011301610017296080208QRIBFTTA53037045802VN6304B290"

    receipt = ReceiptData(
        invoice_number=invoice.invoice_number,
        invoice_id=str(invoice.id),
        date_time=format_vietnam_time(invoice.created_at),
        table_names=table_names,
        cashier_name=cashier_name,
        items=receipt_items,
        subtotal=invoice.subtotal,
        discount_total=invoice.discount_total,
        total_after_discount=invoice.total_after_discount,
        adjustment_total=invoice.adjustment_total,
        final_total=final_total,
        payments=receipt_payments,
        total_paid=total_paid,
        balance_due=balance_due,
        difference=difference,
        qr_code_url=qr_code_url,
        qr_code_data=qr_code_data,
    )
    receipt.formatted_text = generate_receipt_text(receipt)
    return receipt
