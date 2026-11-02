"""Authentication service handling login, refresh, logout, rotation, and security guards."""

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple
from urllib.parse import urlparse

from fastapi import HTTPException, status
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    verify_password,
    dummy_verify_password,
    create_jwt_access_token,
    generate_secure_token,
    hash_token,
)
from app.modules.identity.models import User, RefreshToken, LoginRateLimit
from app.modules.audit.models import AuditLog


async def check_rate_limit(key: str, db: AsyncSession) -> None:
    """Verifies that key (ip or user) is not locked out due to excessive failed logins."""
    now = datetime.now(timezone.utc)
    stmt = select(LoginRateLimit).where(LoginRateLimit.key == key)
    record = await db.scalar(stmt)
    if record and record.locked_until and record.locked_until > now:
        remaining_secs = int((record.locked_until - now).total_seconds())
        remaining_mins = max(1, remaining_secs // 60)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Bạn đã thử đăng nhập sai quá nhiều lần. Vui lòng thử lại sau {remaining_mins} phút.",
        )


async def record_failed_login(ip: Optional[str], username: str, db: AsyncSession) -> None:
    """Records failed login attempt and locks account/IP if threshold is exceeded."""
    now = datetime.now(timezone.utc)
    keys = [f"user:{username}"]
    if ip:
        keys.append(f"ip:{ip}")

    for key in keys:
        stmt = select(LoginRateLimit).where(LoginRateLimit.key == key).with_for_update()
        record = await db.scalar(stmt)
        if not record:
            record = LoginRateLimit(
                key=key,
                failed_attempts=1,
                first_failed_at=now,
            )
            db.add(record)
        else:
            if now - record.first_failed_at > timedelta(minutes=15):
                record.failed_attempts = 1
                record.first_failed_at = now
                record.locked_until = None
            else:
                record.failed_attempts += 1
                if record.failed_attempts >= 5:
                    record.locked_until = now + timedelta(minutes=15)
    await db.commit()


async def record_successful_login(ip: Optional[str], username: str, db: AsyncSession) -> None:
    """Resets failed login counter on successful authentication."""
    keys = [f"user:{username}"]
    if ip:
        keys.append(f"ip:{ip}")

    for key in keys:
        stmt = select(LoginRateLimit).where(LoginRateLimit.key == key).with_for_update()
        record = await db.scalar(stmt)
        if record:
            record.failed_attempts = 0
            record.locked_until = None
    await db.commit()


def verify_origin(origin: Optional[str], referer: Optional[str]) -> None:
    """Enforces Origin/Referer verification against CORS_ORIGINS."""
    target = origin or referer
    if not target:
        return  # Allow same-origin / non-browser requests without origin header if CORS matches

    parsed = urlparse(target)
    target_origin = f"{parsed.scheme}://{parsed.netloc}"

    allowed_origins = [urlparse(o).netloc for o in settings.CORS_ORIGINS]
    if parsed.netloc not in allowed_origins and target_origin not in settings.CORS_ORIGINS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Origin không được phép truy cập",
        )


async def login_user(
    username: str,
    password: str,
    client_ip: Optional[str],
    user_agent: Optional[str],
    db: AsyncSession,
) -> Tuple[str, str, str, User]:
    """Authenticates user and returns (access_token, raw_refresh_token, csrf_token, user)."""
    # 1. Rate limiting check
    await check_rate_limit(f"user:{username}", db)
    if client_ip:
        await check_rate_limit(f"ip:{client_ip}", db)

    # 2. Look up user
    stmt = select(User).where(User.username == username)
    user = await db.scalar(stmt)

    if not user:
        dummy_verify_password()
        await record_failed_login(client_ip, username, db)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tên đăng nhập hoặc mật khẩu không chính xác",
        )

    if not verify_password(password, user.password_hash):
        await record_failed_login(client_ip, username, db)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tên đăng nhập hoặc mật khẩu không chính xác",
        )

    if not user.is_active:
        await record_failed_login(client_ip, username, db)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tên đăng nhập hoặc mật khẩu không chính xác",
        )

    # 3. Successful authentication
    await record_successful_login(client_ip, username, db)

    family_id = uuid.uuid4()
    raw_refresh_token = generate_secure_token(48)
    csrf_token = generate_secure_token(32)

    refresh_record = RefreshToken(
        family_id=family_id,
        user_id=user.id,
        token_hash=hash_token(raw_refresh_token),
        csrf_token_hash=hash_token(csrf_token),
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        user_agent=user_agent,
        ip_address=client_ip,
    )
    db.add(refresh_record)
    await db.commit()

    access_token = create_jwt_access_token(str(user.id), user.username, user.role)
    return access_token, raw_refresh_token, csrf_token, user


async def refresh_user_tokens(
    raw_refresh_token: Optional[str],
    client_csrf_token: Optional[str],
    client_ip: Optional[str],
    user_agent: Optional[str],
    origin: Optional[str],
    referer: Optional[str],
    db: AsyncSession,
) -> Tuple[str, str, str]:
    """Rotates refresh token family with reuse detection and advisory locking.
    
    Returns (new_access_token, new_raw_refresh_token, new_csrf_token).
    """
    # 1. Verify Origin (Condition 2: Return 403, do NOT revoke family)
    verify_origin(origin, referer)

    # 2. Verify CSRF Token (Condition 2: Return 403, do NOT revoke family)
    if not client_csrf_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Thiếu CSRF token hợp lệ",
        )

    if not raw_refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Thiếu refresh token",
        )

    incoming_token_hash = hash_token(raw_refresh_token)
    incoming_csrf_hash = hash_token(client_csrf_token)

    # 3. Atomic check and lock on token
    stmt = (
        select(RefreshToken)
        .where(RefreshToken.token_hash == incoming_token_hash)
        .with_for_update()
    )
    token_record = await db.scalar(stmt)

    if not token_record:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Phiên đăng nhập không tồn tại hoặc không hợp lệ",
        )

    # Verify CSRF binding (Condition 2: Return 403, do NOT revoke family)
    if token_record.csrf_token_hash != incoming_csrf_hash:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF token không hợp lệ cho phiên làm việc này",
        )

    # 4. Check if token was previously revoked -> REUSE DETECTED!
    if token_record.is_revoked:
        # Revoke entire family to protect compromised session
        await db.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == token_record.family_id)
            .values(is_revoked=True, revoked_at=func.now())
        )
        audit_entry = AuditLog(
            actor_id=token_record.user_id,
            actor_username="SECURITY_MONITOR",
            action="REFRESH_TOKEN_REUSE_REVOCATION",
            entity_type="refresh_token_family",
            entity_id=str(token_record.family_id),
            details={"reason": "Revoked token reused", "token_id": str(token_record.id)},
            ip_address=client_ip,
        )
        db.add(audit_entry)
        # Commit revocation before raising 401 (Condition 2 & user feedback)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Phát hiện phiên làm việc bất thường. Toàn bộ phiên liên quan đã bị thu hồi.",
        )

    # 5. Check if token is expired
    if token_record.expires_at < datetime.now(timezone.utc):
        token_record.is_revoked = True
        token_record.revoked_at = datetime.now(timezone.utc)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.",
        )

    # 6. Condition 1: Check user exists and is_active BEFORE creating new token
    user = await db.get(User, token_record.user_id)
    if not user or not user.is_active:
        # User is invalid -> revoke all active refresh tokens of this user, commit, then return 401
        await db.execute(
            update(RefreshToken)
            .where(
                RefreshToken.user_id == token_record.user_id,
                RefreshToken.is_revoked.is_(False),
            )
            .values(is_revoked=True, revoked_at=func.now())
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tài khoản người dùng đã bị vô hiệu hóa hoặc không tồn tại",
        )

    # 7. Valid token -> Rotate token within the same family
    token_record.is_revoked = True
    token_record.revoked_at = datetime.now(timezone.utc)

    new_raw_refresh_token = generate_secure_token(48)
    new_csrf_token = generate_secure_token(32)

    new_token_record = RefreshToken(
        family_id=token_record.family_id,
        user_id=token_record.user_id,
        token_hash=hash_token(new_raw_refresh_token),
        csrf_token_hash=hash_token(new_csrf_token),
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        user_agent=user_agent,
        ip_address=client_ip,
    )
    db.add(new_token_record)
    await db.flush()

    token_record.replaced_by_token_id = new_token_record.id
    await db.commit()

    new_access_token = create_jwt_access_token(str(user.id), user.username, user.role)
    return new_access_token, new_raw_refresh_token, new_csrf_token


async def logout_user(
    raw_refresh_token: Optional[str],
    client_csrf_token: Optional[str],
    origin: Optional[str],
    referer: Optional[str],
    db: AsyncSession,
) -> None:
    """Invalidates active session refresh token."""
    verify_origin(origin, referer)

    if not client_csrf_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Thiếu CSRF token hợp lệ",
        )

    if not raw_refresh_token:
        return

    token_hash = hash_token(raw_refresh_token)
    stmt = (
        select(RefreshToken)
        .where(RefreshToken.token_hash == token_hash)
        .with_for_update()
    )
    token_record = await db.scalar(stmt)
    if token_record:
        if token_record.csrf_token_hash != hash_token(client_csrf_token):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="CSRF token không hợp lệ",
            )
        token_record.is_revoked = True
        token_record.revoked_at = datetime.now(timezone.utc)
        await db.commit()
