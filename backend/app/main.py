"""Main FastAPI application entrypoint for Thanh Đường Quán POS."""

from contextlib import asynccontextmanager
import logging
from typing import AsyncGenerator, Dict, Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.events import ws_manager
from app.db.session import async_engine, check_db_connection
from app.api.v1.router import api_v1_router

# Configure logging
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("thanh_duong_pos")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan manager for startup and shutdown procedures."""
    logger.info("Initializing %s (v%s)...", settings.APP_NAME, settings.APP_VERSION)
    logger.info("Environment: %s | Debug: %s", settings.ENVIRONMENT, settings.DEBUG)

    # Verify PostgreSQL connectivity on startup
    db_status = await check_db_connection()
    if db_status.get("status") == "connected":
        logger.info(
            "PostgreSQL connected successfully: %s (latency: %sms)",
            db_status.get("database"),
            db_status.get("latency_ms"),
        )
    else:
        logger.error("PostgreSQL connection check failed: %s", db_status.get("error"))

    yield

    # Clean up database connection pool
    logger.info("Disposing database connection pool...")
    await async_engine.dispose()
    logger.info("Application shutdown complete.")


# Create FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    description="Backend API Modular Monolith cho hệ thống POS quản lý quán nhậu Thanh Dương Quán.",
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Root endpoint
@app.get("/", tags=["Root"])
async def root() -> Dict[str, Any]:
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "status": "online",
        "docs": "/docs",
        "api_v1": settings.API_V1_STR,
    }


# Direct /health endpoint for external monitoring / LB probes
@app.get("/health", tags=["Health"])
async def health_check() -> Dict[str, Any]:
    db_status = await check_db_connection()
    return {
        "status": "healthy" if db_status.get("status") == "connected" else "degraded",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "database": db_status,
    }


# Include API v1 router
app.include_router(api_v1_router, prefix=settings.API_V1_STR)


# WebSocket endpoint for Phase 4 preparation
@app.websocket("/ws/{channel}")
async def websocket_endpoint(websocket: WebSocket, channel: str = "general") -> None:
    await ws_manager.connect(websocket, channel)
    try:
        while True:
            data = await websocket.receive_json()
            # Echo back or broadcast acknowledge
            await websocket.send_json({"type": "ACK", "channel": channel, "data": data})
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, channel)
    except Exception as exc:
        logger.warning("WebSocket error on channel '%s': %s", channel, exc)
        ws_manager.disconnect(websocket, channel)
