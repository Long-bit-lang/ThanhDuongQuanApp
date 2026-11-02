"""Health check application service."""

from datetime import datetime, timezone
from typing import Dict, Any

from app.core.config import settings
from app.db.session import check_db_connection


class HealthService:
    """Service responsible for aggregating system health, database readiness, and runtime metadata."""

    @staticmethod
    async def get_system_health() -> Dict[str, Any]:
        """Gathers system and database connectivity health."""
        db_health = await check_db_connection()
        is_healthy = db_health.get("status") == "connected"

        return {
            "status": "healthy" if is_healthy else "degraded",
            "app_name": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "environment": settings.ENVIRONMENT,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "database": db_health,
        }

    @staticmethod
    async def get_db_health() -> Dict[str, Any]:
        """Gathers direct database connection information."""
        return await check_db_connection()


health_service = HealthService()
