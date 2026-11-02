"""Tests for user management endpoints, RBAC permissions, and owner invariants."""

import uuid
import asyncio
import pytest
from httpx import AsyncClient
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.identity.models import User, RefreshToken
from app.modules.audit.models import AuditLog
from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_owner_can_create_staff_user(client: AsyncClient, test_owner: User, db_session: AsyncSession):
    username = f"cashier_new_{uuid.uuid4().hex[:6]}"
    response = await client.post(
        "/api/v1/users",
        headers=auth_headers(test_owner),
        json={
            "username": username,
            "full_name": "Nhân Viên Thu Ngân Mới",
            "password": "NewStaffPassword123!",
            "role": "CASHIER",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["username"] == username
    assert data["role"] == "CASHIER"
    assert data["is_active"] is True
    assert "password_hash" not in data

    # Verify audit log was recorded
    audit = await db_session.scalar(
        select(AuditLog).where(AuditLog.action == "USER_CREATE", AuditLog.entity_id == data["id"])
    )
    assert audit is not None
    assert audit.actor_username == test_owner.username


@pytest.mark.asyncio
async def test_cashier_and_waiter_cannot_create_user(client: AsyncClient, test_cashier: User, test_waiter: User):
    payload = {
        "username": f"user_{uuid.uuid4().hex[:6]}",
        "full_name": "Test User",
        "password": "Password123!",
        "role": "WAITER",
    }
    # Cashier cannot create
    res_cashier = await client.post("/api/v1/users", headers=auth_headers(test_cashier), json=payload)
    assert res_cashier.status_code == 403

    # Waiter cannot create
    res_waiter = await client.post("/api/v1/users", headers=auth_headers(test_waiter), json=payload)
    assert res_waiter.status_code == 403


@pytest.mark.asyncio
async def test_owner_can_list_users(client: AsyncClient, test_owner: User):
    response = await client.get("/api/v1/users", headers=auth_headers(test_owner))
    assert response.status_code == 200
    assert isinstance(response.json(), list)
    assert len(response.json()) >= 1


@pytest.mark.asyncio
async def test_non_owner_cannot_list_users(client: AsyncClient, test_cashier: User, test_waiter: User):
    res_cashier = await client.get("/api/v1/users", headers=auth_headers(test_cashier))
    assert res_cashier.status_code == 403

    res_waiter = await client.get("/api/v1/users", headers=auth_headers(test_waiter))
    assert res_waiter.status_code == 403


@pytest.mark.asyncio
async def test_user_self_access_profile(client: AsyncClient, test_cashier: User, test_waiter: User):
    # Cashier can view self
    res_self = await client.get(f"/api/v1/users/{test_cashier.id}", headers=auth_headers(test_cashier))
    assert res_self.status_code == 200
    assert res_self.json()["username"] == test_cashier.username

    # Cashier cannot view waiter
    res_other = await client.get(f"/api/v1/users/{test_waiter.id}", headers=auth_headers(test_cashier))
    assert res_other.status_code == 403


@pytest.mark.asyncio
async def test_protect_last_active_owner_invariant(client: AsyncClient, db_session: AsyncSession):
    # Ensure there is exactly 1 active OWNER
    all_owners = (
        await db_session.scalars(select(User).where(User.role == "OWNER", User.is_active.is_(True)))
    ).all()
    
    # Keep only 1 active owner for this test (prefer admin so admin remains active)
    sole_owner = next((o for o in all_owners if o.username == "admin"), all_owners[0])
    for o in all_owners:
        if o.id != sole_owner.id:
            o.is_active = False
    sole_owner.is_active = True
    await db_session.commit()

    # Attempt to deactivate the sole active owner
    deactivate_res = await client.patch(
        f"/api/v1/users/{sole_owner.id}",
        headers=auth_headers(sole_owner),
        json={"is_active": False},
    )
    assert deactivate_res.status_code == 400
    assert "Không thể vô hiệu hóa hoặc thay đổi vai trò của Chủ quán" in deactivate_res.json()["detail"]

    # Attempt to demote the sole active owner to CASHIER
    demote_res = await client.patch(
        f"/api/v1/users/{sole_owner.id}",
        headers=auth_headers(sole_owner),
        json={"role": "CASHIER"},
    )
    assert demote_res.status_code == 400
    assert "Không thể vô hiệu hóa hoặc thay đổi vai trò của Chủ quán" in demote_res.json()["detail"]


@pytest.mark.asyncio
async def test_deactivate_user_revokes_sessions(
    client: AsyncClient, test_owner: User, test_cashier: User, db_session: AsyncSession
):
    # 1. Login as cashier
    login_res = await client.post(
        "/api/v1/auth/login",
        json={"username": test_cashier.username, "password": "CashierPassword123!"},
    )
    assert login_res.status_code == 200
    csrf_token = login_res.json()["csrf_token"]
    cookie = login_res.cookies.get("thanh_duong_refresh")

    # 2. OWNER deactivates cashier
    patch_res = await client.patch(
        f"/api/v1/users/{test_cashier.id}",
        headers=auth_headers(test_owner),
        json={"is_active": False},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["is_active"] is False

    # 3. Cashier's refresh token is now revoked
    refresh_res = await client.post(
        "/api/v1/auth/refresh",
        headers={"X-CSRF-Token": csrf_token},
        cookies={"thanh_duong_refresh": cookie},
    )
    assert refresh_res.status_code == 401


@pytest.mark.asyncio
async def test_reset_password_revokes_sessions(
    client: AsyncClient, test_owner: User, test_cashier: User, db_session: AsyncSession
):
    # 1. Login as cashier
    login_res = await client.post(
        "/api/v1/auth/login",
        json={"username": test_cashier.username, "password": "CashierPassword123!"},
    )
    assert login_res.status_code == 200
    csrf_token = login_res.json()["csrf_token"]
    cookie = login_res.cookies.get("thanh_duong_refresh")

    # 2. OWNER resets cashier's password
    reset_res = await client.post(
        f"/api/v1/users/{test_cashier.id}/reset-password",
        headers=auth_headers(test_owner),
        json={"new_password": "NewBrandPassword123!"},
    )
    assert reset_res.status_code == 200

    # 3. Old refresh token is revoked
    refresh_res = await client.post(
        "/api/v1/auth/refresh",
        headers={"X-CSRF-Token": csrf_token},
        cookies={"thanh_duong_refresh": cookie},
    )
    assert refresh_res.status_code == 401

    # 4. Old password fails
    old_login = await client.post(
        "/api/v1/auth/login",
        json={"username": test_cashier.username, "password": "CashierPassword123!"},
    )
    assert old_login.status_code == 401

    # 5. New password succeeds
    new_login = await client.post(
        "/api/v1/auth/login",
        json={"username": test_cashier.username, "password": "NewBrandPassword123!"},
    )
    assert new_login.status_code == 200


@pytest.mark.asyncio
async def test_protect_last_owner_concurrent_race(client: AsyncClient, db_session: AsyncSession):
    # Set up exactly two active owners
    from app.core.security import hash_password
    o1 = User(
        username=f"owner_race_1_{uuid.uuid4().hex[:6]}",
        full_name="Owner Race 1",
        password_hash=hash_password("OwnerPassword123!"),
        role="OWNER",
        is_active=True,
    )
    o2 = User(
        username=f"owner_race_2_{uuid.uuid4().hex[:6]}",
        full_name="Owner Race 2",
        password_hash=hash_password("OwnerPassword123!"),
        role="OWNER",
        is_active=True,
    )
    db_session.add_all([o1, o2])
    await db_session.commit()
    await db_session.refresh(o1)
    await db_session.refresh(o2)

    # Inactivate any other owners so only o1 and o2 are active
    all_other_owners = (
        await db_session.scalars(
            select(User).where(User.role == "OWNER", User.id.not_in([o1.id, o2.id]))
        )
    ).all()
    for o in all_other_owners:
        o.is_active = False
    await db_session.commit()

    # Two concurrent requests: o1 attempts to demote o2, and o2 attempts to demote o1
    req1 = client.patch(
        f"/api/v1/users/{o1.id}",
        headers=auth_headers(o2),
        json={"role": "CASHIER"},
    )
    req2 = client.patch(
        f"/api/v1/users/{o2.id}",
        headers=auth_headers(o1),
        json={"role": "CASHIER"},
    )

    results = await asyncio.gather(req1, req2, return_exceptions=False)
    status_codes = sorted([r.status_code for r in results])

    # Exactly one request succeeds (200), and the other fails with 400 (invariant preserved)
    assert status_codes == [200, 400]

    # Verify in DB: exactly one active OWNER remains!
    active_owners = (
        await db_session.scalars(
            select(User).where(User.role == "OWNER", User.is_active.is_(True))
        )
    ).all()
    assert len(active_owners) == 1


@pytest.mark.asyncio
async def test_bootstrap_owner_cli_idempotency(test_owner: User):
    from app.modules.identity.cli import bootstrap_owner
    # When an active owner already exists, bootstrap must exit with code 1
    with pytest.raises(SystemExit) as exc_info:
        await bootstrap_owner(target_username="new_owner_attempt")
    assert exc_info.value.code == 1
