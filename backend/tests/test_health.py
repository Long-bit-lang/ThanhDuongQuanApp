"""Unit and integration tests for API health check endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_root_endpoint(client: AsyncClient) -> None:
    """Verifies that root endpoint returns application metadata."""
    response = await client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"
    assert "Thanh Dương Quán POS" in data["app"]
    assert "version" in data
    assert data["api_v1"] == "/api/v1"


@pytest.mark.asyncio
async def test_direct_health_endpoint(client: AsyncClient) -> None:
    """Verifies direct /health monitoring endpoint."""
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["database"]["status"] == "connected"
    assert data["database"]["database"] == "thanh_duong_pos"


@pytest.mark.asyncio
async def test_api_v1_health_endpoint(client: AsyncClient) -> None:
    """Verifies /api/v1/health detailed response."""
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "Thanh Dương Quán POS" in data["app_name"]
    assert data["environment"] in ["development", "testing"]
    assert "timestamp" in data
    assert data["database"]["status"] == "connected"
    assert "latency_ms" in data["database"]
    assert data["database"]["latency_ms"] >= 0


@pytest.mark.asyncio
async def test_api_v1_health_db_endpoint(client: AsyncClient) -> None:
    """Verifies /api/v1/health/db direct database probe."""
    response = await client.get("/api/v1/health/db")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "connected"
    assert data["database"] == "thanh_duong_pos"
    assert "latency_ms" in data
    assert "version" in data


@pytest.mark.asyncio
async def test_liveness_and_readiness_probes(client: AsyncClient) -> None:
    """Verifies Kubernetes/container orchestration liveness and readiness probes."""
    live_res = await client.get("/api/v1/health/live")
    assert live_res.status_code == 200
    assert live_res.json()["status"] == "alive"

    ready_res = await client.get("/api/v1/health/ready")
    assert ready_res.status_code == 200
    assert ready_res.json()["status"] == "ready"
