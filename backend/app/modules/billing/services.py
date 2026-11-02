"""Billing services for syncing invoice snapshots with live order items and recalculating totals."""

import uuid
from decimal import Decimal
from typing import Optional
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import dispatch_pos_event
from app.modules.service.models import OrderItem
from app.modules.billing.models import Invoice, InvoiceItem, Discount, InvoiceAdjustment


async def recompute_invoice_totals(invoice: Invoice, db: AsyncSession) -> None:
    """Recomputes subtotal, percentage discounts, and total_after_discount for an invoice."""
    # 1. Calculate subtotal from current line items
    subtotal = await db.scalar(
        select(func.coalesce(func.sum(InvoiceItem.line_total), 0)).where(InvoiceItem.invoice_id == invoice.id)
    )
    invoice.subtotal = Decimal(subtotal)

    # 2. Re-evaluate any percentage discounts based on updated subtotal / line item total
    discounts = list((await db.scalars(select(Discount).where(Discount.invoice_id == invoice.id))).all())
    for d in discounts:
        if d.discount_type == "PERCENT":
            base = invoice.subtotal
            if d.invoice_item_id:
                line = await db.get(InvoiceItem, d.invoice_item_id)
                base = line.line_total if line else Decimal("0")
            d.amount = min(base, (base * d.value / Decimal("100")).quantize(Decimal("1.00")))

    discounts_sum = sum((d.amount for d in discounts), Decimal("0"))
    adjustments = await db.scalar(
        select(func.coalesce(func.sum(InvoiceAdjustment.amount), 0)).where(InvoiceAdjustment.invoice_id == invoice.id)
    )
    invoice.discount_total = Decimal(discounts_sum)
    invoice.total_after_discount = max(Decimal("0"), invoice.subtotal - invoice.discount_total)
    invoice.adjustment_total = Decimal(adjustments)


async def sync_invoice_with_session(invoice: Invoice, db: AsyncSession) -> bool:
    """Synchronizes an unpaid/draft invoice with the live active order items in its session.

    Ensures that when items are added, incremented, or cancelled after the invoice
    was initially drafted, the invoice items and totals immediately reflect the live order state.
    """
    if invoice.status == "PAID":
        return False

    # 1. Fetch current active items in the session
    active_items = list(
        (await db.scalars(
            select(OrderItem).where(
                OrderItem.session_id == invoice.session_id,
                OrderItem.status == "ACTIVE"
            )
        )).all()
    )

    # 2. Fetch existing invoice items
    existing_items = list(
        (await db.scalars(
            select(InvoiceItem).where(InvoiceItem.invoice_id == invoice.id)
        )).all()
    )
    by_order_item_id = {it.order_item_id: it for it in existing_items}
    active_order_item_ids = {it.id for it in active_items}

    # 3. Synchronize active order items into invoice items
    for item in active_items:
        line_total = (item.unit_price_snapshot * item.quantity).quantize(Decimal("1.00"))
        if item.id in by_order_item_id:
            inv_item = by_order_item_id[item.id]
            inv_item.quantity = item.quantity
            inv_item.unit_price_snapshot = item.unit_price_snapshot
            inv_item.product_name_snapshot = item.product_name_snapshot
            inv_item.line_total = line_total
        else:
            db.add(
                InvoiceItem(
                    invoice_id=invoice.id,
                    order_item_id=item.id,
                    product_name_snapshot=item.product_name_snapshot,
                    unit_price_snapshot=item.unit_price_snapshot,
                    quantity=item.quantity,
                    line_total=line_total,
                )
            )

    # 4. Remove invoice items that were cancelled or removed from session
    for inv_item in existing_items:
        if inv_item.order_item_id not in active_order_item_ids:
            # Delete any discount specifically attached to this removed line item
            orphaned_discounts = list(
                (await db.scalars(
                    select(Discount).where(Discount.invoice_item_id == inv_item.id)
                )).all()
            )
            for d in orphaned_discounts:
                await db.delete(d)
            await db.delete(inv_item)

    await db.flush()
    await recompute_invoice_totals(invoice, db)
    await db.flush()

    dispatch_pos_event("INVOICE_UPDATED", {
        "invoice_id": str(invoice.id),
        "session_id": str(invoice.session_id),
        "subtotal": float(invoice.subtotal),
        "total": float(invoice.total_after_discount + invoice.adjustment_total),
    })
    return True


async def sync_session_invoice(session_id: uuid.UUID, db: AsyncSession) -> Optional[Invoice]:
    """Finds any draft/unpaid invoice for the session and synchronizes it with current active order items."""
    invoice = await db.scalar(
        select(Invoice)
        .where(Invoice.session_id == session_id, Invoice.status != "PAID")
        .with_for_update()
    )
    if not invoice:
        return None

    await sync_invoice_with_session(invoice, db)
    return invoice
