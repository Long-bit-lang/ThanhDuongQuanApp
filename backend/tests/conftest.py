"""Pytest configuration and fixtures for backend test suite."""

import os
import uuid
from typing import AsyncGenerator, Dict

# Set testing environment before importing app settings
os.environ["ENVIRONMENT"] = "testing"
os.environ["DB_POOL_CLASS"] = "null"

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.main import app
from app.core.security import hash_password, create_jwt_access_token
from app.db.session import AsyncSessionLocal, async_engine
from app.modules.identity.models import User, RefreshToken, LoginRateLimit
from app.modules.audit.models import AuditLog


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """Provides an async HTTP test client using ASGITransport."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Provides a dedicated async database session for tests."""
    async with AsyncSessionLocal() as session:
        yield session


@pytest_asyncio.fixture(autouse=True)
async def clean_rate_limits(db_session: AsyncSession) -> None:
    """Cleans up rate limiting records before each test to ensure test isolation."""
    await db_session.execute(delete(LoginRateLimit))
    await db_session.commit()


@pytest_asyncio.fixture(autouse=True)
async def clean_test_sessions(db_session: AsyncSession) -> None:
    """Frees tables occupied by test users to prevent 50-table pool exhaustion."""
    from datetime import datetime, timezone
    from app.modules.floor.models import DiningTable, ServiceSession, SessionTable
    from sqlalchemy import update

    now = datetime.now(timezone.utc)
    # Find test user IDs
    test_user_ids = list(
        (await db_session.scalars(
            select(User.id).where(User.username.like("%_test_%"))
        )).all()
    )
    if test_user_ids:
        # Find open sessions opened by test users
        test_session_ids = list(
            (await db_session.scalars(
                select(ServiceSession.id).where(
                    ServiceSession.opened_by_id.in_(test_user_ids),
                    ServiceSession.status == "OPEN",
                )
            )).all()
        )
        if test_session_ids:
            # Find tables belonging to these sessions
            occupied_table_ids = list(
                (await db_session.scalars(
                    select(SessionTable.table_id).where(
                        SessionTable.session_id.in_(test_session_ids),
                        SessionTable.left_at.is_(None),
                    )
                )).all()
            )
            # Free tables
            if occupied_table_ids:
                await db_session.execute(
                    update(DiningTable)
                    .where(DiningTable.id.in_(occupied_table_ids))
                    .values(status="AVAILABLE")
                )
            # Close session memberships
            await db_session.execute(
                update(SessionTable)
                .where(SessionTable.session_id.in_(test_session_ids))
                .values(left_at=now)
            )
            # Close sessions
            await db_session.execute(
                update(ServiceSession)
                .where(ServiceSession.id.in_(test_session_ids))
                .values(status="CLOSED", closed_at=now)
            )
            await db_session.commit()


@pytest_asyncio.fixture
async def test_owner(db_session: AsyncSession) -> User:
    """Creates a guaranteed active test OWNER user."""
    username = f"owner_test_{uuid.uuid4().hex[:6]}"
    owner = User(
        username=username,
        full_name="Chủ Quán Test",
        password_hash=hash_password("OwnerPassword123!"),
        role="OWNER",
        is_active=True,
    )
    db_session.add(owner)
    await db_session.commit()
    await db_session.refresh(owner)
    return owner


@pytest_asyncio.fixture
async def test_cashier(db_session: AsyncSession) -> User:
    """Creates a guaranteed active test CASHIER user."""
    username = f"cashier_test_{uuid.uuid4().hex[:6]}"
    cashier = User(
        username=username,
        full_name="Thu Ngân Test",
        password_hash=hash_password("CashierPassword123!"),
        role="CASHIER",
        is_active=True,
    )
    db_session.add(cashier)
    await db_session.commit()
    await db_session.refresh(cashier)
    return cashier


@pytest_asyncio.fixture
async def test_waiter(db_session: AsyncSession) -> User:
    """Creates a guaranteed active test WAITER user."""
    username = f"waiter_test_{uuid.uuid4().hex[:6]}"
    waiter = User(
        username=username,
        full_name="Phục Vụ Test",
        password_hash=hash_password("WaiterPassword123!"),
        role="WAITER",
        is_active=True,
    )
    db_session.add(waiter)
    await db_session.commit()
    await db_session.refresh(waiter)
    return waiter


def auth_headers(user: User) -> Dict[str, str]:
    """Helper generating Authorization header with valid JWT access token."""
    token = create_jwt_access_token(str(user.id), user.username, user.role)
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture(autouse=True)
async def preserve_standard_accounts(db_session: AsyncSession):
    """Guarantees that admin, thungan, and phucvu always remain active and unblocked."""
    yield
    from sqlalchemy import update
    await db_session.execute(
        update(User)
        .where(User.username.in_(["admin", "thungan", "phucvu"]))
        .values(is_active=True)
    )
    await db_session.commit()

