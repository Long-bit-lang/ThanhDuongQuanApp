"""Service order operations: rounds, line items, cancellations, and timeline history."""

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import dispatch_pos_event
from app.db.session import get_db
from app.modules.identity.dependencies import get_current_user
from app.modules.identity.models import User
from app.modules.audit.models import AuditLog
from app.modules.catalog.models import Product
from app.modules.floor.models import DiningTable, ServiceSession, SessionTable
from app.modules.service.models import Order, OrderItem
from app.modules.service.schemas import CreateOrder, AddItem, CancelItem, TransferItems
from app.modules.billing.models import Invoice, InvoiceAdjustment
from app.modules.billing.services import sync_session_invoice

router = APIRouter(tags=["Service"])


async def get_active_session(session_id: UUID, db: AsyncSession) -> ServiceSession:
    session = await db.scalar(select(ServiceSession).where(ServiceSession.id == session_id).with_for_update())
    if not session:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên phục vụ")
    if session.status != "OPEN":
        raise HTTPException(status_code=409, detail="Phiên phục vụ đã đóng")
    return session


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Returns session details including attached tables, active and cancelled items, and running subtotal."""
    session = await db.get(ServiceSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên phục vụ")

    # Get attached tables
    memberships = list(
        (await db.scalars(
            select(SessionTable).where(SessionTable.session_id == session_id, SessionTable.left_at.is_(None))
        )).all()
    )
    table_ids = [m.table_id for m in memberships]
    tables = list((await db.scalars(select(DiningTable).where(DiningTable.id.in_(table_ids)))).all()) if table_ids else []

    # Get items
    all_items = list(
        (await db.scalars(
            select(OrderItem).where(OrderItem.session_id == session_id).order_by(OrderItem.created_at)
        )).all()
    )
    active_items = [it for it in all_items if it.status == "ACTIVE"]
    cancelled_items = [it for it in all_items if it.status == "CANCELLED"]
    running_subtotal = sum(it.unit_price_snapshot * it.quantity for it in active_items)

    return {
        "id": session.id,
        "status": session.status,
        "opened_by_id": session.opened_by_id,
        "created_at": session.created_at,
        "tables": [{"id": t.id, "code": t.code, "display_name": t.display_name} for t in tables],
        "active_items": [
            {
                "id": it.id,
                "order_id": it.order_id,
                "product_id": it.product_id,
                "product_name": it.product_name_snapshot,
                "unit_price": it.unit_price_snapshot,
                "quantity": it.quantity,
                "line_total": it.unit_price_snapshot * it.quantity,
                "note": it.note,
                "status": it.status,
                "created_at": it.created_at,
            }
            for it in active_items
        ],
        "cancelled_items": [
            {
                "id": it.id,
                "product_name": it.product_name_snapshot,
                "unit_price": it.unit_price_snapshot,
                "quantity": it.quantity,
                "cancelled_at": it.cancelled_at,
                "cancellation_reason": it.cancellation_reason,
            }
            for it in cancelled_items
        ],
        "running_subtotal": running_subtotal,
    }


@router.get("/sessions/{session_id}/orders")
async def get_orders(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Returns order rounds for a session with their respective items."""
    orders = list(
        (await db.scalars(
            select(Order).where(Order.session_id == session_id).order_by(Order.created_at)
        )).all()
    )
    order_ids = [o.id for o in orders]
    items_by_order: dict[UUID, list[OrderItem]] = {}
    if order_ids:
        items = list(
            (await db.scalars(
                select(OrderItem).where(OrderItem.order_id.in_(order_ids)).order_by(OrderItem.created_at)
            )).all()
        )
        for item in items:
            items_by_order.setdefault(item.order_id, []).append(item)

    return [
        {
            "id": o.id,
            "session_id": o.session_id,
            "created_by_id": o.created_by_id,
            "created_at": o.created_at,
            "items": [
                {
                    "id": it.id,
                    "product_id": it.product_id,
                    "product_name": it.product_name_snapshot,
                    "unit_price": it.unit_price_snapshot,
                    "quantity": it.quantity,
                    "line_total": it.unit_price_snapshot * it.quantity,
                    "note": it.note,
                    "status": it.status,
                    "created_at": it.created_at,
                    "cancelled_at": it.cancelled_at,
                    "cancellation_reason": it.cancellation_reason,
                }
                for it in items_by_order.get(o.id, [])
            ],
        }
        for o in orders
    ]


@router.post("/sessions/{session_id}/orders", status_code=status.HTTP_201_CREATED)
async def create_order(
    session_id: UUID,
    payload: CreateOrder,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Creates a new order round with one or more order items."""
    await get_active_session(session_id, db)

    product_ids = [line.product_id for line in payload.items]
    products = {
        p.id: p
        for p in (await db.scalars(select(Product).where(Product.id.in_(product_ids)).with_for_update())).all()
    }
    if len(products) != len(set(product_ids)):
        raise HTTPException(status_code=404, detail="Một hoặc nhiều món không tìm thấy trong thực đơn")
    if any(p.is_archived or not p.is_available for p in products.values()):
        raise HTTPException(status_code=409, detail="Một hoặc nhiều món đã hết hàng hoặc không còn bán")

    order = Order(session_id=session_id, created_by_id=user.id)
    db.add(order)
    await db.flush()

    added_items_details = []
    for line in payload.items:
        p = products[line.product_id]
        # Check if active item for this product already exists in this session to accumulate
        existing_active = await db.scalar(
            select(OrderItem)
            .where(
                OrderItem.session_id == session_id,
                OrderItem.product_id == p.id,
                OrderItem.status == "ACTIVE",
            )
            .order_by(OrderItem.created_at.asc())
            .with_for_update()
        )
        if existing_active:
            existing_active.quantity += line.quantity
            if line.note:
                if existing_active.note:
                    existing_active.note = f"{existing_active.note}, {line.note}"
                else:
                    existing_active.note = line.note
            added_items_details.append({
                "name": p.name,
                "quantity": line.quantity,
                "price": float(p.sale_price),
                "accumulated": True,
                "total_quantity": existing_active.quantity,
            })
        else:
            item = OrderItem(
                order_id=order.id,
                session_id=session_id,
                product_id=p.id,
                product_name_snapshot=p.name,
                unit_price_snapshot=p.sale_price,
                quantity=line.quantity,
                note=line.note,
            )
            db.add(item)
            added_items_details.append({"name": p.name, "quantity": line.quantity, "price": float(p.sale_price)})

    # Audit log
    db.add(AuditLog(
        actor_id=user.id,
        actor_username=user.username,
        action="ORDER_CREATED",
        entity_type="order",
        entity_id=str(order.id),
        details={"session_id": str(session_id), "items": added_items_details},
    ))
    await db.flush()
    await sync_session_invoice(session_id, db)

    dispatch_pos_event("ORDER_CREATED", {
        "order_id": str(order.id),
        "session_id": str(session_id),
        "item_count": len(payload.items),
    })
    dispatch_pos_event("ORDER_ITEM_ADDED", {
        "session_id": str(session_id),
        "items": added_items_details,
    })

    return {"id": order.id, "item_count": len(payload.items)}


@router.post("/orders/{order_id}/items", status_code=status.HTTP_201_CREATED)
async def add_item_to_order(
    order_id: UUID,
    payload: AddItem,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Adds a single item to an existing order round, accumulating if duplicate."""
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Không tìm thấy lượt gọi món")
    await get_active_session(order.session_id, db)

    product = await db.get(Product, payload.product_id)
    if not product or product.is_archived or not product.is_available:
        raise HTTPException(status_code=409, detail="Món đã hết hàng hoặc không còn bán")

    existing_active = await db.scalar(
        select(OrderItem)
        .where(
            OrderItem.session_id == order.session_id,
            OrderItem.product_id == product.id,
            OrderItem.status == "ACTIVE",
        )
        .order_by(OrderItem.created_at.asc())
        .with_for_update()
    )
    if existing_active:
        existing_active.quantity += payload.quantity
        if payload.note:
            if existing_active.note:
                existing_active.note = f"{existing_active.note}, {payload.note}"
            else:
                existing_active.note = payload.note
        item = existing_active
    else:
        item = OrderItem(
            order_id=order.id,
            session_id=order.session_id,
            product_id=product.id,
            product_name_snapshot=product.name,
            unit_price_snapshot=product.sale_price,
            quantity=payload.quantity,
            note=payload.note,
        )
        db.add(item)
    await db.flush()

    # Audit log
    db.add(AuditLog(
        actor_id=user.id,
        actor_username=user.username,
        action="ORDER_ITEM_ADDED",
        entity_type="order_item",
        entity_id=str(item.id),
        details={
            "session_id": str(order.session_id),
            "product_name": product.name,
            "quantity": payload.quantity,
            "unit_price": float(product.sale_price),
        },
    ))
    await db.flush()
    await sync_session_invoice(order.session_id, db)

    dispatch_pos_event("ORDER_ITEM_ADDED", {
        "session_id": str(order.session_id),
        "item_id": str(item.id),
        "product_name": product.name,
        "quantity": payload.quantity,
    })

    return {"id": item.id, "product_name": item.product_name_snapshot, "quantity": item.quantity}


@router.post("/order-items/{item_id}/cancel")
async def cancel_item(
    item_id: UUID,
    payload: CancelItem,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Cancels an order item, preserving snapshot and cancellation audit log."""
    item = await db.scalar(select(OrderItem).where(OrderItem.id == item_id).with_for_update())
    if not item:
        raise HTTPException(status_code=404, detail="Không tìm thấy món gọi")
    if item.status == "CANCELLED":
        raise HTTPException(status_code=409, detail="Món đã được hủy trước đó")

    item.status = "CANCELLED"
    item.cancelled_by_id = user.id
    item.cancelled_at = datetime.now(timezone.utc)
    item.cancellation_reason = payload.reason

    # Check if there is an invoice for this session
    invoice = await db.scalar(select(Invoice).where(Invoice.session_id == item.session_id).with_for_update())
    post_payment = False
    adjustment_amount = Decimal("0")
    if invoice:
        item_val = item.unit_price_snapshot * item.quantity
        if invoice.status == "PAID":
            post_payment = True
            adjustment_amount = -item_val
            # Record invoice adjustment for post-payment difference
            adj = InvoiceAdjustment(
                invoice_id=invoice.id,
                amount=adjustment_amount,
                reason=f"Hủy món sau thanh toán: {item.product_name_snapshot} x{item.quantity} ({payload.reason or 'Không có lý do'})",
                created_by_id=user.id,
            )
            db.add(adj)
            await db.flush()
            # Recompute adjustments
            adj_sum = await db.scalar(select(func.coalesce(func.sum(InvoiceAdjustment.amount), 0)).where(InvoiceAdjustment.invoice_id == invoice.id))
            invoice.adjustment_total = Decimal(adj_sum)

    # Audit log
    db.add(AuditLog(
        actor_id=user.id,
        actor_username=user.username,
        action="ORDER_ITEM_CANCELLED_POST_PAYMENT" if post_payment else "ORDER_ITEM_CANCELLED",
        entity_type="order_item",
        entity_id=str(item.id),
        details={
            "session_id": str(item.session_id),
            "product_name": item.product_name_snapshot,
            "quantity": item.quantity,
            "reason": payload.reason,
            "post_payment_adjustment": float(adjustment_amount) if post_payment else 0,
        },
    ))
    await db.flush()
    await sync_session_invoice(item.session_id, db)

    dispatch_pos_event("ORDER_ITEM_CANCELLED", {
        "item_id": str(item.id),
        "session_id": str(item.session_id),
        "product_name": item.product_name_snapshot,
        "quantity": item.quantity,
        "post_payment": post_payment,
    })

    return {
        "id": item.id,
        "status": item.status,
        "post_payment_adjusted": post_payment,
        "adjustment_amount": float(adjustment_amount) if post_payment else 0,
    }


@router.get("/sessions/{session_id}/history")
async def get_session_history(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Returns complete event timeline of the service session from audit records."""
    logs = list(
        (await db.scalars(
            select(AuditLog).where(
                AuditLog.details["session_id"].astext == str(session_id)
            ).order_by(AuditLog.created_at)
        )).all()
    )
    # Also fetch logs where entity_id == session_id
    session_logs = list(
        (await db.scalars(
            select(AuditLog).where(
                AuditLog.entity_type == "session",
                AuditLog.entity_id == str(session_id),
            ).order_by(AuditLog.created_at)
        )).all()
    )
    combined = {log.id: log for log in logs + session_logs}
    sorted_logs = sorted(combined.values(), key=lambda l: l.created_at)

    return [
        {
            "id": log.id,
            "action": log.action,
            "actor_username": log.actor_username,
            "created_at": log.created_at,
            "details": log.details,
        }
        for log in sorted_logs
    ]
