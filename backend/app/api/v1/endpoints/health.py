"""Health check API endpoints."""

from fastapi import APIRouter, status, Response
from typing import Dict, Any

from app.services.health_service import health_service

router = APIRouter(prefix="/health", tags=["Health"])


@router.get(
    "",
    summary="System Health Check",
    description="Returns application health status, environment, version, and database connection details.",
    status_code=status.HTTP_200_OK,
)
async def get_health(response: Response) -> Dict[str, Any]:
    health_data = await health_service.get_system_health()
    if health_data["status"] != "healthy":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return health_data


@router.get(
    "/db",
    summary="Database Connectivity Check",
    description="Direct probe to verify PostgreSQL connectivity, version, and response latency.",
    status_code=status.HTTP_200_OK,
)
async def get_db_health(response: Response) -> Dict[str, Any]:
    db_data = await health_service.get_db_health()
    if db_data.get("status") != "connected":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return db_data


@router.get(
    "/live",
    summary="Liveness Probe",
    description="Simple probe to check if the application server is up.",
    status_code=status.HTTP_200_OK,
)
async def get_liveness() -> Dict[str, str]:
    return {"status": "alive"}


@router.get(
    "/ready",
    summary="Readiness Probe",
    description="Probe to check if the application is ready to accept traffic (database available).",
    status_code=status.HTTP_200_OK,
)
async def get_readiness(response: Response) -> Dict[str, str]:
    db_data = await health_service.get_db_health()
    if db_data.get("status") == "connected":
        return {"status": "ready"}
    response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {"status": "not_ready", "error": db_data.get("error", "Database unavailable")}
