from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.modules.identity.dependencies import require_roles
from app.modules.audit.models import AuditLog
router = APIRouter(prefix="/audit-logs", tags=["Audit"])
@router.get("")
async def list_audit_logs(limit: int = Query(100, ge=1, le=500), db: AsyncSession = Depends(get_db), _=Depends(require_roles("OWNER"))):
    return list((await db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit))).all())
