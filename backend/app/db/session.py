"""Database engine and session management for SQLAlchemy 2.x asyncpg."""

import time
from typing import AsyncGenerator, Dict, Any
from sqlalchemy import text
from sqlalchemy.pool import NullPool, AsyncAdaptedQueuePool
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings

# Configure engine kwargs based on environment and pool preference
engine_kwargs: Dict[str, Any] = {
    "echo": False,
    "future": True,
}

if settings.ENVIRONMENT == "testing" or settings.DB_POOL_CLASS == "null":
    engine_kwargs["poolclass"] = NullPool
else:
    engine_kwargs["poolclass"] = AsyncAdaptedQueuePool
    engine_kwargs["pool_pre_ping"] = True
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20

# Create async engine with selected pooling strategy
async_engine: AsyncEngine = create_async_engine(
    settings.DATABASE_URL,
    **engine_kwargs,
)

# Create session maker for async sessions
AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency that provides an async database session per request.
    
    Allows service layer to explicitly manage transactions when necessary.
    Guarantees rollback on unhandled exceptions and cleans up session.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            if session.is_active and session.in_transaction():
                await session.commit()
        except Exception:
            if session.is_active and session.in_transaction():
                await session.rollback()
            raise
        finally:
            await session.close()


async def check_db_connection() -> Dict[str, Any]:
    """Tests connectivity to PostgreSQL by executing a ping query and measuring latency."""
    start_time = time.perf_counter()
    try:
        async with async_engine.connect() as conn:
            result = await conn.execute(text("SELECT version(), current_database()"))
            row = result.fetchone()
            latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
            version_str = row[0] if row else "unknown"
            database_name = row[1] if row else "unknown"
            return {
                "status": "connected",
                "database": database_name,
                "version": version_str.split(",")[0] if version_str else "PostgreSQL",
                "latency_ms": latency_ms,
            }
    except Exception as exc:
        latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
        return {
            "status": "disconnected",
            "error": str(exc),
            "latency_ms": latency_ms,
        }
