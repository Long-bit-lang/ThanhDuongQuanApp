"""Tests for direct database connectivity and session lifecycle."""

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import check_db_connection


@pytest.mark.asyncio
async def test_database_direct_query(db_session: AsyncSession) -> None:
    """Verifies that queries can be executed on PostgreSQL via AsyncSession."""
    result = await db_session.execute(text("SELECT 42 as answer, 'Thanh Dương Quán' as shop"))
    row = result.fetchone()
    assert row is not None
    assert row.answer == 42
    assert row.shop == "Thanh Dương Quán"


@pytest.mark.asyncio
async def test_check_db_connection_function() -> None:
    """Verifies the check_db_connection utility directly."""
    status_info = await check_db_connection()
    assert status_info["status"] == "connected"
    assert status_info["database"] in ("thanh_duong_pos", "neondb")
    assert "PostgreSQL" in status_info["version"]
    assert status_info["latency_ms"] >= 0
