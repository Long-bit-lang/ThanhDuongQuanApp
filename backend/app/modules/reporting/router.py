from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.modules.identity.dependencies import require_roles
from app.modules.billing.models import Invoice
from app.modules.payments.models import Payment

router = APIRouter(prefix="/reports/revenue", tags=["Reporting"])
async def summary(start: datetime | None, end: datetime | None, db: AsyncSession):
    where = []
    if start: where.append(Invoice.created_at >= start)
    if end: where.append(Invoice.created_at <= end)
    result = await db.execute(select(func.count(Invoice.id), func.coalesce(func.sum(Invoice.total_after_discount), 0), func.coalesce(func.sum(Invoice.adjustment_total), 0)).where(*where))
    count, invoice_value, adjustments = result.one()
    paid = await db.scalar(select(func.coalesce(func.sum(Payment.amount), 0)).join(Invoice).where(*where))
    return {"invoice_count": count, "invoice_value": invoice_value, "paid_amount": paid, "adjustments": adjustments, "difference": paid - (invoice_value + adjustments)}
@router.get("/summary")
async def revenue_summary(start: datetime | None = None, end: datetime | None = None, db: AsyncSession = Depends(get_db), _=Depends(require_roles("OWNER", "CASHIER"))): return await summary(start, end, db)
@router.get("/daily")
async def revenue_daily(start: datetime | None = None, end: datetime | None = None, db: AsyncSession = Depends(get_db), _=Depends(require_roles("OWNER", "CASHIER"))):
    query = select(func.date(Invoice.created_at).label("date"), func.sum(Invoice.total_after_discount).label("invoice_value"), func.sum(Invoice.adjustment_total).label("adjustments")).group_by(func.date(Invoice.created_at)).order_by(func.date(Invoice.created_at))
    if start: query = query.where(Invoice.created_at >= start)
    if end: query = query.where(Invoice.created_at <= end)
    return [dict(row._mapping) for row in (await db.execute(query)).all()]
