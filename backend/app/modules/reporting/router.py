"""Revenue and financial reporting endpoints.

Accessible only by OWNER and CASHIER roles. WAITER role is strictly rejected at the backend.
Only paid invoices (status == 'PAID') are included in actual revenue calculation.
"""

from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.identity.dependencies import require_roles
from app.modules.identity.models import User
from app.modules.billing.models import Invoice
from app.modules.payments.models import Payment

router = APIRouter(prefix="/reports/revenue", tags=["Reporting"])
ROLES = ("OWNER", "CASHIER")


async def calculate_revenue_summary(
    start: Optional[datetime],
    end: Optional[datetime],
    db: AsyncSession,
) -> Dict[str, Any]:
    # Strictly filter for PAID invoices only
    where_clauses = [Invoice.status == "PAID"]
    if start:
        where_clauses.append(Invoice.created_at >= start)
    if end:
        where_clauses.append(Invoice.created_at <= end)

    # Aggregate invoice financial metrics
    invoice_metrics_stmt = select(
        func.count(Invoice.id),
        func.coalesce(func.sum(Invoice.subtotal), Decimal("0")),
        func.coalesce(func.sum(Invoice.discount_total), Decimal("0")),
        func.coalesce(func.sum(Invoice.total_after_discount), Decimal("0")),
        func.coalesce(func.sum(Invoice.adjustment_total), Decimal("0")),
    ).where(*where_clauses)

    result = await db.execute(invoice_metrics_stmt)
    count, subtotal, discount_total, invoice_value, adjustments = result.one()

    # Aggregate total paid from payments table
    paid_stmt = (
        select(func.coalesce(func.sum(Payment.amount), Decimal("0")))
        .join(Invoice, Payment.invoice_id == Invoice.id)
        .where(*where_clauses)
    )
    paid = (await db.scalar(paid_stmt)) or Decimal("0")

    # Payment breakdown by method (CASH vs VIETQR_MOCK)
    breakdown_stmt = (
        select(
            Payment.method,
            func.coalesce(func.sum(Payment.amount), Decimal("0")),
        )
        .join(Invoice, Payment.invoice_id == Invoice.id)
        .where(*where_clauses)
        .group_by(Payment.method)
    )
    method_rows = (await db.execute(breakdown_stmt)).all()
    by_method: Dict[str, Decimal] = {"CASH": Decimal("0"), "VIETQR_MOCK": Decimal("0")}
    for method, amt in method_rows:
        by_method[method] = amt

    net_revenue = invoice_value + adjustments
    difference = paid - net_revenue

    return {
        "invoice_count": count,
        "subtotal": float(subtotal),
        "discount_total": float(discount_total),
        "invoice_value": float(invoice_value),
        "adjustments": float(adjustments),
        "paid_amount": float(paid),
        "net_revenue": float(net_revenue),
        "difference": float(difference),
        "cash_amount": float(by_method["CASH"]),
        "vietqr_amount": float(by_method["VIETQR_MOCK"]),
        "by_method": {k: float(v) for k, v in by_method.items()},
    }


@router.get("/summary")
async def revenue_summary(
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(*ROLES)),
) -> Dict[str, Any]:
    """Returns summarized revenue metrics filtered by time period (OWNER & CASHIER only)."""
    return await calculate_revenue_summary(start, end, db)


@router.get("/daily")
async def revenue_daily(
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(*ROLES)),
) -> List[Dict[str, Any]]:
    """Returns daily revenue breakdown (OWNER & CASHIER only)."""
    where_clauses = [Invoice.status == "PAID"]
    if start:
        where_clauses.append(Invoice.created_at >= start)
    if end:
        where_clauses.append(Invoice.created_at <= end)

    query = (
        select(
            func.date(Invoice.created_at).label("date"),
            func.count(Invoice.id).label("invoice_count"),
            func.coalesce(func.sum(Invoice.subtotal), Decimal("0")).label("subtotal"),
            func.coalesce(func.sum(Invoice.discount_total), Decimal("0")).label("discount_total"),
            func.coalesce(func.sum(Invoice.total_after_discount), Decimal("0")).label("invoice_value"),
            func.coalesce(func.sum(Invoice.adjustment_total), Decimal("0")).label("adjustments"),
        )
        .where(*where_clauses)
        .group_by(func.date(Invoice.created_at))
        .order_by(func.date(Invoice.created_at).desc())
    )

    rows = (await db.execute(query)).all()
    results = []
    for r in rows:
        mapping = dict(r._mapping)
        mapping["date"] = str(mapping["date"])
        inv_val = Decimal(str(mapping["invoice_value"]))
        adj = Decimal(str(mapping["adjustments"]))
        mapping["net_revenue"] = float(inv_val + adj)
        mapping["subtotal"] = float(mapping["subtotal"])
        mapping["discount_total"] = float(mapping["discount_total"])
        mapping["invoice_value"] = float(inv_val)
        mapping["adjustments"] = float(adj)
        results.append(mapping)

    return results

