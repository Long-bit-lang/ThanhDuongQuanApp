"""API v1 master router aggregating all module routers."""

from fastapi import APIRouter
from app.api.v1.endpoints import health, auth, users
from app.modules.catalog.router import router as catalog_router
from app.modules.floor.router import router as floor_router
from app.modules.service.router import router as service_router
from app.modules.billing.router import router as billing_router
from app.modules.payments.router import router as payments_router
from app.modules.reporting.router import router as reporting_router
from app.modules.audit.router import router as audit_router
from app.modules.printing.router import router as printing_router

api_v1_router = APIRouter()

# Health endpoints
api_v1_router.include_router(health.router)

# Authentication endpoints
api_v1_router.include_router(auth.router)

# User management endpoints
api_v1_router.include_router(users.router)

# POS operations
api_v1_router.include_router(catalog_router)
api_v1_router.include_router(floor_router)
api_v1_router.include_router(service_router)
api_v1_router.include_router(billing_router)
api_v1_router.include_router(payments_router)
api_v1_router.include_router(reporting_router)
api_v1_router.include_router(audit_router)
api_v1_router.include_router(printing_router)
