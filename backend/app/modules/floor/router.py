"""Floor management endpoints: Tables, Sessions, Merge, Split, and Transfer."""

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
from app.modules.floor.models import DiningTable, ServiceSession, SessionTable
from app.modules.service.models import Order, OrderItem
from app.modules.billing.models import Invoice
from app.modules.billing.services import sync_session_invoice
from app.modules.floor.schemas import (
    TableResponse,
    OpenSessionResponse,
    MergeRequest,
    SplitRequest,
    TransferItemsRequest,
)

router = APIRouter(tags=["Floor"])


@router.get("/tables", response_model=list[TableResponse])
async def list_tables(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Lists all dining tables with active session status and calculated totals."""
    tables = list((await db.scalars(select(DiningTable).order_by(DiningTable.sort_order))).all())
    
    # Fetch all active session-table memberships
    active_memberships = list(
        (await db.scalars(
            select(SessionTable).where(SessionTable.left_at.is_(None))
        )).all()
    )
    table_to_session = {m.table_id: m.session_id for m in active_memberships}
    
    # If there are active sessions, calculate running subtotals and orders
    session_ids = list(set(table_to_session.values()))
    session_subtotals: dict[UUID, Decimal] = {}
    session_order_counts: dict[UUID, int] = {}
    session_opened_ats: dict[UUID, datetime] = {}
    session_table_codes: dict[UUID, list[str]] = {}
    session_invoices: dict[UUID, Invoice] = {}

    if session_ids:
        sessions = list((await db.scalars(select(ServiceSession).where(ServiceSession.id.in_(session_ids)))).all())
        for s in sessions:
            session_opened_ats[s.id] = s.created_at

        # Calculate subtotals for active items
        active_items = list(
            (await db.scalars(
                select(OrderItem).where(
                    OrderItem.session_id.in_(session_ids),
                    OrderItem.status == "ACTIVE",
                )
            )).all()
        )
        for item in active_items:
            current = session_subtotals.get(item.session_id, Decimal("0"))
            session_subtotals[item.session_id] = current + (item.unit_price_snapshot * item.quantity)

        # Count orders
        orders = list(
            (await db.scalars(
                select(Order).where(Order.session_id.in_(session_ids))
            )).all()
        )
        for order in orders:
            session_order_counts[order.session_id] = session_order_counts.get(order.session_id, 0) + 1

        # Fetch active invoices for sessions
        invoices = list(
            (await db.scalars(
                select(Invoice).where(Invoice.session_id.in_(session_ids))
            )).all()
        )
        for inv in invoices:
            session_invoices[inv.session_id] = inv

        # Collect table codes per session
        table_code_map = {t.id: t.code for t in tables}
        for m in active_memberships:
            code = table_code_map.get(m.table_id)
            if code:
                session_table_codes.setdefault(m.session_id, []).append(code)

    results: list[TableResponse] = []
    for t in tables:
        sess_id = table_to_session.get(t.id)
        pay_status = "AVAILABLE"
        inv_status = None
        inv_number = None
        inv_id = None

        if sess_id:
            inv = session_invoices.get(sess_id)
            if inv and inv.status == "PAID":
                pay_status = "PAID"
                inv_status = "PAID"
                inv_number = inv.invoice_number
                inv_id = inv.id
            elif inv:
                pay_status = "UNPAID"
                inv_status = inv.status
                inv_number = inv.invoice_number
                inv_id = inv.id
            else:
                pay_status = "UNPAID"
                inv_status = None

        results.append(
            TableResponse(
                id=t.id,
                code=t.code,
                display_name=t.display_name,
                status=t.status,
                sort_order=t.sort_order,
                active_session_id=sess_id,
                running_subtotal=session_subtotals.get(sess_id, Decimal("0")) if sess_id else None,
                session_opened_at=session_opened_ats.get(sess_id) if sess_id else None,
                order_count=session_order_counts.get(sess_id, 0) if sess_id else 0,
                active_table_codes=session_table_codes.get(sess_id, [t.code]) if sess_id else [t.code],
                payment_status=pay_status,
                invoice_status=inv_status,
                invoice_number=inv_number,
                invoice_id=inv_id,
            )
        )
    return results


@router.get("/tables/{table_id}", response_model=TableResponse)
async def get_table(
    table_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Returns single dining table with current status."""
    table = await db.get(DiningTable, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Không tìm thấy bàn")
    
    membership = await db.scalar(
        select(SessionTable).where(
            SessionTable.table_id == table_id,
            SessionTable.left_at.is_(None),
        )
    )
    sess_id = membership.session_id if membership else None
    pay_status = "AVAILABLE"
    inv_status = None
    inv_number = None
    inv_id = None

    if sess_id:
        inv = await db.scalar(select(Invoice).where(Invoice.session_id == sess_id))
        if inv and inv.status == "PAID":
            pay_status = "PAID"
            inv_status = "PAID"
            inv_number = inv.invoice_number
            inv_id = inv.id
        elif inv:
            pay_status = "UNPAID"
            inv_status = inv.status
            inv_number = inv.invoice_number
            inv_id = inv.id
        else:
            pay_status = "UNPAID"

    return TableResponse(
        id=table.id,
        code=table.code,
        display_name=table.display_name,
        status=table.status,
        sort_order=table.sort_order,
        active_session_id=sess_id,
        active_table_codes=[table.code],
        payment_status=pay_status,
        invoice_status=inv_status,
        invoice_number=inv_number,
        invoice_id=inv_id,
    )


@router.post("/tables/{table_id}/open-session", response_model=OpenSessionResponse, status_code=status.HTTP_201_CREATED)
async def open_session(
    table_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Opens a new service session on an available table."""
    table = await db.scalar(select(DiningTable).where(DiningTable.id == table_id).with_for_update())
    if not table:
        raise HTTPException(status_code=404, detail="Không tìm thấy bàn")
    if table.status != "AVAILABLE":
        raise HTTPException(status_code=409, detail="Bàn hiện không trống hoặc đang có phiên phục vụ")

    session = ServiceSession(opened_by_id=user.id)
    db.add(session)
    await db.flush()

    membership = SessionTable(session_id=session.id, table_id=table.id)
    db.add(membership)
    table.status = "OCCUPIED"

    # Audit log
    db.add(AuditLog(
        actor_id=user.id,
        actor_username=user.username,
        action="SESSION_OPENED",
        entity_type="session",
        entity_id=str(session.id),
        details={"table_id": str(table.id), "table_code": table.code, "table_name": table.display_name},
    ))
    await db.flush()

    dispatch_pos_event("SESSION_OPENED", {"session_id": str(session.id), "table_id": str(table.id), "table_code": table.code})
    dispatch_pos_event("TABLE_STATUS_CHANGED", {"table_id": str(table.id), "status": "OCCUPIED"})

    return session


@router.post("/sessions/{session_id}/close", response_model=OpenSessionResponse)
async def close_session(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Closes an active session and frees all assigned tables."""
    session = await db.scalar(select(ServiceSession).where(ServiceSession.id == session_id).with_for_update())
    if not session:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên")
    if session.status != "OPEN":
        raise HTTPException(status_code=409, detail="Phiên đã đóng trước đó")

    memberships = list(
        (await db.scalars(
            select(SessionTable).where(SessionTable.session_id == session.id, SessionTable.left_at.is_(None)).with_for_update()
        )).all()
    )
    closed_codes = []
    now = datetime.now(timezone.utc)
    for membership in memberships:
        table = await db.get(DiningTable, membership.table_id)
        if table:
            table.status = "AVAILABLE"
            closed_codes.append(table.code)
            dispatch_pos_event("TABLE_STATUS_CHANGED", {"table_id": str(table.id), "status": "AVAILABLE"})
        membership.left_at = now

    session.status = "CLOSED"
    session.closed_by_id = user.id
    session.closed_at = now

    # Audit log
    db.add(AuditLog(
        actor_id=user.id,
        actor_username=user.username,
        action="SESSION_CLOSED",
        entity_type="session",
        entity_id=str(session.id),
        details={"freed_tables": closed_codes},
    ))
    await db.flush()

    dispatch_pos_event("SESSION_CLOSED", {"session_id": str(session.id), "freed_tables": closed_codes})

    return session


@router.post("/sessions/merge", response_model=OpenSessionResponse)
async def merge_sessions(
    payload: MergeRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Merges multiple active sessions into a target session in one transaction."""
    sessions = list(
        (await db.scalars(
            select(ServiceSession).where(ServiceSession.id.in_(payload.session_ids)).with_for_update()
        )).all()
    )
    if len(sessions) != len(set(payload.session_ids)):
        raise HTTPException(status_code=404, detail="Một hoặc nhiều phiên không tồn tại")
    if any(s.status != "OPEN" for s in sessions):
        raise HTTPException(status_code=409, detail="Tất cả các phiên cần gộp phải đang ở trạng thái OPEN")

    # Target session is the first session in the list
    target = sessions[0]
    source_sessions = sessions[1:]
    now = datetime.now(timezone.utc)

    for source in source_sessions:
        # Move active session tables to target session
        source_tables = list(
            (await db.scalars(
                select(SessionTable).where(SessionTable.session_id == source.id, SessionTable.left_at.is_(None))
            )).all()
        )
        for row in source_tables:
            row.session_id = target.id

        # Move orders and order items to target session
        source_orders = list(
            (await db.scalars(select(Order).where(Order.session_id == source.id))).all()
        )
        for o in source_orders:
            o.session_id = target.id

        source_items = list(
            (await db.scalars(select(OrderItem).where(OrderItem.session_id == source.id))).all()
        )
        for item in source_items:
            item.session_id = target.id

        source.status = "CLOSED"
        source.closed_by_id = user.id
        source.closed_at = now

    # Audit log
    db.add(AuditLog(
        actor_id=user.id,
        actor_username=user.username,
        action="SESSION_MERGED",
        entity_type="session",
        entity_id=str(target.id),
        details={
            "target_session_id": str(target.id),
            "merged_session_ids": [str(s.id) for s in source_sessions],
        },
    ))
    await db.flush()

    for s in source_sessions:
        await sync_session_invoice(s.id, db)
    await sync_session_invoice(target.id, db)

    dispatch_pos_event("SESSION_MERGED", {
        "target_session_id": str(target.id),
        "merged_session_ids": [str(s.id) for s in source_sessions],
    })
    return target


@router.post("/sessions/split")
async def split_session(
    payload: SplitRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Splits selected items from an active session into a new session on a specified available table."""
    source_session = await db.scalar(
        select(ServiceSession).where(ServiceSession.id == payload.source_session_id).with_for_update()
    )
    if not source_session or source_session.status != "OPEN":
        raise HTTPException(status_code=409, detail="Phiên nguồn không tồn tại hoặc đã đóng")

    target_table = await db.scalar(
        select(DiningTable).where(DiningTable.id == payload.target_table_id).with_for_update()
    )
    if not target_table:
        raise HTTPException(status_code=404, detail="Không tìm thấy bàn đích")
    if target_table.status != "AVAILABLE":
        raise HTTPException(status_code=409, detail="Bàn đích hiện không trống để tách phiên")

    # Lock and verify items
    items = list(
        (await db.scalars(
            select(OrderItem).where(
                OrderItem.id.in_(payload.order_item_ids),
                OrderItem.session_id == source_session.id,
            ).with_for_update()
        )).all()
    )
    if len(items) != len(set(payload.order_item_ids)):
        raise HTTPException(status_code=409, detail="Một hoặc nhiều món không thuộc phiên nguồn")

    # Create new session on target table
    new_session = ServiceSession(opened_by_id=user.id)
    db.add(new_session)
    await db.flush()

    # Create session-table link and occupy table
    db.add(SessionTable(session_id=new_session.id, table_id=target_table.id))
    target_table.status = "OCCUPIED"

    # Transfer items to the new session
    for item in items:
        item.session_id = new_session.id

    # Audit log
    db.add(AuditLog(
        actor_id=user.id,
        actor_username=user.username,
        action="SESSION_SPLIT",
        entity_type="session",
        entity_id=str(new_session.id),
        details={
            "source_session_id": str(source_session.id),
            "new_session_id": str(new_session.id),
            "target_table_id": str(target_table.id),
            "target_table_code": target_table.code,
            "moved_item_count": len(items),
        },
    ))
    await db.flush()

    await sync_session_invoice(source_session.id, db)
    await sync_session_invoice(new_session.id, db)

    dispatch_pos_event("SESSION_SPLIT", {
        "source_session_id": str(source_session.id),
        "new_session_id": str(new_session.id),
        "target_table_code": target_table.code,
        "moved_item_count": len(items),
    })
    dispatch_pos_event("TABLE_STATUS_CHANGED", {"table_id": str(target_table.id), "status": "OCCUPIED"})

    return {
        "source_session_id": source_session.id,
        "new_session_id": new_session.id,
        "target_table_code": target_table.code,
        "moved_item_count": len(items),
    }


@router.post("/sessions/transfer-items")
async def transfer_items(
    payload: TransferItemsRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Transfers specific order items between two open sessions preserving snapshot price and history."""
    if payload.source_session_id == payload.target_session_id:
        raise HTTPException(status_code=422, detail="Phiên nguồn và phiên đích phải khác nhau")

    source = await db.scalar(select(ServiceSession).where(ServiceSession.id == payload.source_session_id).with_for_update())
    target = await db.scalar(select(ServiceSession).where(ServiceSession.id == payload.target_session_id).with_for_update())
    if not source or source.status != "OPEN":
        raise HTTPException(status_code=409, detail="Phiên nguồn không tồn tại hoặc đã đóng")
    if not target or target.status != "OPEN":
        raise HTTPException(status_code=409, detail="Phiên đích không tồn tại hoặc đã đóng")

    items = list(
        (await db.scalars(
            select(OrderItem).where(
                OrderItem.id.in_(payload.order_item_ids),
                OrderItem.session_id == payload.source_session_id,
            ).with_for_update()
        )).all()
    )
    if len(items) != len(set(payload.order_item_ids)):
        raise HTTPException(status_code=409, detail="Có món không thuộc phiên nguồn")

    for item in items:
        item.session_id = payload.target_session_id

    # Audit log
    db.add(AuditLog(
        actor_id=user.id,
        actor_username=user.username,
        action="ITEM_TRANSFERRED",
        entity_type="session",
        entity_id=str(payload.target_session_id),
        details={
            "source_session_id": str(payload.source_session_id),
            "target_session_id": str(payload.target_session_id),
            "transferred_items": [str(i) for i in payload.order_item_ids],
        },
    ))
    await db.flush()

    await sync_session_invoice(payload.source_session_id, db)
    await sync_session_invoice(payload.target_session_id, db)

    dispatch_pos_event("ITEM_TRANSFERRED", {
        "source_session_id": str(payload.source_session_id),
        "target_session_id": str(payload.target_session_id),
        "count": len(items),
    })

    return {"transferred": len(items)}
