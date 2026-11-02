"""Comprehensive tests for authentication flow, token rotation, reuse detection, and CSRF."""

import asyncio
from datetime import datetime, timezone, timedelta
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.identity.models import User, RefreshToken, LoginRateLimit
from app.modules.audit.models import AuditLog
from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient, test_owner: User):
    response = await client.post(
        "/api/v1/auth/login",
        json={"username": test_owner.username, "password": "OwnerPassword123!"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "csrf_token" in data
    assert data["token_type"] == "bearer"
    assert data["expires_in"] == 900
    assert data["user"]["username"] == test_owner.username
    assert data["user"]["role"] == "OWNER"
    assert "password_hash" not in data["user"]

    # Verify HttpOnly cookie was set
    assert "thanh_duong_refresh" in response.cookies
    cookie = response.cookies.get("thanh_duong_refresh")
    assert cookie is not None


@pytest.mark.asyncio
async def test_login_invalid_password(client: AsyncClient, test_owner: User):
    response = await client.post(
        "/api/v1/auth/login",
        json={"username": test_owner.username, "password": "WrongPassword123!"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Tên đăng nhập hoặc mật khẩu không chính xác"


@pytest.mark.asyncio
async def test_login_nonexistent_user(client: AsyncClient):
    response = await client.post(
        "/api/v1/auth/login",
        json={"username": "nonexistent_user_999", "password": "Password123!"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Tên đăng nhập hoặc mật khẩu không chính xác"


@pytest.mark.asyncio
async def test_login_inactive_user(client: AsyncClient, db_session: AsyncSession, test_cashier: User):
    test_cashier.is_active = False
    await db_session.commit()

    response = await client.post(
        "/api/v1/auth/login",
        json={"username": test_cashier.username, "password": "CashierPassword123!"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Tên đăng nhập hoặc mật khẩu không chính xác"


@pytest.mark.asyncio
async def test_login_rate_limiting(client: AsyncClient, test_waiter: User):
    # Perform 5 failed attempts
    for _ in range(5):
        res = await client.post(
            "/api/v1/auth/login",
            json={"username": test_waiter.username, "password": "WrongPassword123!"},
        )
        assert res.status_code == 401

    # 6th attempt should be blocked by rate limiter
    blocked_res = await client.post(
        "/api/v1/auth/login",
        json={"username": test_waiter.username, "password": "WrongPassword123!"},
    )
    assert blocked_res.status_code == 429
    assert "Bạn đã thử đăng nhập sai quá nhiều lần" in blocked_res.json()["detail"]


@pytest.mark.asyncio
async def test_refresh_token_rotation_success(client: AsyncClient, test_owner: User, db_session: AsyncSession):
    # 1. Login to obtain session
    login_res = await client.post(
        "/api/v1/auth/login",
        json={"username": test_owner.username, "password": "OwnerPassword123!"},
    )
    assert login_res.status_code == 200
    csrf_token = login_res.json()["csrf_token"]
    refresh_cookie = login_res.cookies.get("thanh_duong_refresh")

    # 2. Call /refresh with cookie and CSRF header
    refresh_res = await client.post(
        "/api/v1/auth/refresh",
        headers={"X-CSRF-Token": csrf_token},
        cookies={"thanh_duong_refresh": refresh_cookie},
    )
    assert refresh_res.status_code == 200
    new_data = refresh_res.json()
    assert "access_token" in new_data
    assert "csrf_token" in new_data
    new_cookie = refresh_res.cookies.get("thanh_duong_refresh")
    assert new_cookie != refresh_cookie

    # 3. Verify in database: old token is revoked and linked to new token
    tokens = (
        await db_session.scalars(
            select(RefreshToken).where(RefreshToken.user_id == test_owner.id).order_by(RefreshToken.created_at.asc())
        )
    ).all()
    assert len(tokens) >= 2
    old_record = tokens[-2]
    new_record = tokens[-1]
    assert old_record.is_revoked is True
    assert old_record.replaced_by_token_id == new_record.id
    assert old_record.family_id == new_record.family_id


@pytest.mark.asyncio
async def test_csrf_mismatch_returns_403(client: AsyncClient, test_owner: User, db_session: AsyncSession):
    login_res = await client.post(
        "/api/v1/auth/login",
        json={"username": test_owner.username, "password": "OwnerPassword123!"},
    )
    refresh_cookie = login_res.cookies.get("thanh_duong_refresh")

    # Request without CSRF header -> 403 Forbidden
    res_no_csrf = await client.post(
        "/api/v1/auth/refresh",
        cookies={"thanh_duong_refresh": refresh_cookie},
    )
    assert res_no_csrf.status_code == 403

    # Request with wrong CSRF header -> 403 Forbidden
    res_bad_csrf = await client.post(
        "/api/v1/auth/refresh",
        headers={"X-CSRF-Token": "bad-csrf-token-value"},
        cookies={"thanh_duong_refresh": refresh_cookie},
    )
    assert res_bad_csrf.status_code == 403

    # Verify token family was NOT revoked due to CSRF failure
    tokens = (
        await db_session.scalars(
            select(RefreshToken).where(RefreshToken.user_id == test_owner.id)
        )
    ).all()
    assert all(t.is_revoked is False for t in tokens)


@pytest.mark.asyncio
async def test_refresh_token_reuse_persists_revocation(
    client: AsyncClient, test_owner: User, db_session: AsyncSession
):
    # 1. Login
    login_res = await client.post(
        "/api/v1/auth/login",
        json={"username": test_owner.username, "password": "OwnerPassword123!"},
    )
    csrf_token = login_res.json()["csrf_token"]
    old_cookie = login_res.cookies.get("thanh_duong_refresh")

    # 2. Legitimate refresh
    first_refresh = await client.post(
        "/api/v1/auth/refresh",
        headers={"X-CSRF-Token": csrf_token},
        cookies={"thanh_duong_refresh": old_cookie},
    )
    assert first_refresh.status_code == 200

    # 3. Attacker uses old_cookie again (TOKEN REUSE DETECTED)
    replay_res = await client.post(
        "/api/v1/auth/refresh",
        headers={"X-CSRF-Token": csrf_token},
        cookies={"thanh_duong_refresh": old_cookie},
    )
    assert replay_res.status_code == 401
    assert "Toàn bộ phiên liên quan đã bị thu hồi" in replay_res.json()["detail"]

    # 4. Verify in DB: ALL tokens in this family are revoked (persisted, NOT rolled back)
    tokens = (
        await db_session.scalars(
            select(RefreshToken).where(RefreshToken.user_id == test_owner.id)
        )
    ).all()
    assert len(tokens) >= 2
    assert all(t.is_revoked is True for t in tokens)


@pytest.mark.asyncio
async def test_logout_revokes_token(client: AsyncClient, test_owner: User, db_session: AsyncSession):
    login_res = await client.post(
        "/api/v1/auth/login",
        json={"username": test_owner.username, "password": "OwnerPassword123!"},
    )
    csrf_token = login_res.json()["csrf_token"]
    refresh_cookie = login_res.cookies.get("thanh_duong_refresh")

    logout_res = await client.post(
        "/api/v1/auth/logout",
        headers={"X-CSRF-Token": csrf_token},
        cookies={"thanh_duong_refresh": refresh_cookie},
    )
    assert logout_res.status_code == 200
    assert logout_res.json()["message"] == "Đăng xuất thành công"

    # Attempting to refresh with logged-out cookie fails
    refresh_res = await client.post(
        "/api/v1/auth/refresh",
        headers={"X-CSRF-Token": csrf_token},
        cookies={"thanh_duong_refresh": refresh_cookie},
    )
    assert refresh_res.status_code == 401


@pytest.mark.asyncio
async def test_get_me_endpoint(client: AsyncClient, test_owner: User):
    # Without token -> 401
    unauth = await client.get("/api/v1/auth/me")
    assert unauth.status_code == 401

    # With valid token -> 200
    auth = await client.get("/api/v1/auth/me", headers=auth_headers(test_owner))
    assert auth.status_code == 200
    assert auth.json()["username"] == test_owner.username
    assert auth.json()["role"] == "OWNER"


@pytest.mark.asyncio
async def test_concurrent_refresh_family_revocation(
    client: AsyncClient, test_owner: User, db_session: AsyncSession
):
    # 1. Login to get fresh refresh token
    login_res = await client.post(
        "/api/v1/auth/login",
        json={"username": test_owner.username, "password": "OwnerPassword123!"},
    )
    csrf_token = login_res.json()["csrf_token"]
    cookie = login_res.cookies.get("thanh_duong_refresh")

    # 2. Concurrently fire two refresh requests with the EXACT same token
    req1 = client.post(
        "/api/v1/auth/refresh",
        headers={"X-CSRF-Token": csrf_token},
        cookies={"thanh_duong_refresh": cookie},
    )
    req2 = client.post(
        "/api/v1/auth/refresh",
        headers={"X-CSRF-Token": csrf_token},
        cookies={"thanh_duong_refresh": cookie},
    )

    results = await asyncio.gather(req1, req2, return_exceptions=False)
    status_codes = sorted([r.status_code for r in results])

    # Exactly one request succeeds with 200; the other detects reuse or is blocked, resulting in 401
    assert status_codes == [200, 401]

    # After reuse detection, the family is fully revoked in database
    tokens = (
        await db_session.scalars(
            select(RefreshToken).where(RefreshToken.user_id == test_owner.id)
        )
    ).all()
    assert len(tokens) >= 2
    assert all(t.is_revoked is True for t in tokens)
