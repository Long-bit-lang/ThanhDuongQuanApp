"""User management service with PostgreSQL advisory lock for OWNER invariants and audit logging."""

import uuid
from typing import Optional, List, Dict, Any

from fastapi import HTTPException, status
from sqlalchemy import select, update, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import hash_password
from app.modules.identity.models import User, RefreshToken
from app.modules.identity.schemas import UserCreateRequest, UserUpdateRequest
from app.modules.audit.models import AuditLog


async def acquire_owner_advisory_lock(db: AsyncSession) -> None:
    """Acquires transaction-level advisory lock in PostgreSQL before querying or modifying users."""
    await db.execute(
        text("SELECT pg_advisory_xact_lock(:lock_id)"),
        {"lock_id": settings.OWNER_ADMIN_ADVISORY_LOCK_ID},
    )


async def create_staff_user(
    actor: User,
    data: UserCreateRequest,
    client_ip: Optional[str],
    db: AsyncSession,
) -> User:
    """Creates a new user account (Only permitted by OWNER)."""
    # 1. If creating an OWNER, acquire advisory lock first
    if data.role == "OWNER":
        await acquire_owner_advisory_lock(db)

    # 2. Check if username is already taken
    existing = await db.scalar(select(User).where(User.username == data.username))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Tên đăng nhập '{data.username}' đã tồn tại trong hệ thống",
        )

    # 3. Create user
    new_user = User(
        username=data.username,
        full_name=data.full_name,
        password_hash=hash_password(data.password),
        role=data.role,
        is_active=True,
        created_by_id=actor.id,
    )
    db.add(new_user)
    await db.flush()

    # 4. Record audit log
    audit_entry = AuditLog(
        actor_id=actor.id,
        actor_username=actor.username,
        action="USER_CREATE",
        entity_type="user",
        entity_id=str(new_user.id),
        details={
            "created_username": new_user.username,
            "created_role": new_user.role,
            "full_name": new_user.full_name,
        },
        ip_address=client_ip,
    )
    db.add(audit_entry)
    await db.commit()
    await db.refresh(new_user)
    return new_user


async def list_staff_users(
    role: Optional[str],
    is_active: Optional[bool],
    skip: int,
    limit: int,
    db: AsyncSession,
) -> List[User]:
    """Lists staff users with optional filtering."""
    query = select(User).order_by(User.created_at.desc())
    if role:
        query = query.where(User.role == role)
    if is_active is not None:
        query = query.where(User.is_active.is_(is_active))
    query = query.offset(skip).limit(limit)
    result = await db.scalars(query)
    return list(result.all())


async def get_user_by_id(user_id: uuid.UUID, db: AsyncSession) -> User:
    """Fetches user by UUID."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy người dùng với ID '{user_id}'",
        )
    return user


async def update_staff_user(
    actor: User,
    user_id: uuid.UUID,
    data: UserUpdateRequest,
    client_ip: Optional[str],
    db: AsyncSession,
) -> User:
    """Updates user information while strictly preserving the active OWNER invariant.
    
    Condition 3: Advisory lock is acquired BEFORE querying the users table.
    """
    # 1. Acquire PostgreSQL advisory lock FIRST before any table query
    await acquire_owner_advisory_lock(db)

    # 2. Query target user AFTER lock is held
    target_user = await db.get(User, user_id)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy người dùng với ID '{user_id}'",
        )

    # 3. Check invariant: COUNT(active OWNER) >= 1
    is_target_active_owner = target_user.role == "OWNER" and target_user.is_active
    is_demoting_or_deactivating = (
        (data.is_active is False) or (data.role is not None and data.role != "OWNER")
    )

    if is_target_active_owner and is_demoting_or_deactivating:
        count_stmt = select(func.count(User.id)).where(
            User.role == "OWNER",
            User.is_active.is_(True),
        )
        active_owner_count = await db.scalar(count_stmt) or 0
        if active_owner_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Không thể vô hiệu hóa hoặc thay đổi vai trò của Chủ quán (OWNER) duy nhất trong hệ thống.",
            )

    # 4. Apply updates and track changes
    previous_state: Dict[str, Any] = {
        "full_name": target_user.full_name,
        "role": target_user.role,
        "is_active": target_user.is_active,
    }

    if data.full_name is not None:
        target_user.full_name = data.full_name
    if data.role is not None:
        target_user.role = data.role
    if data.is_active is not None:
        target_user.is_active = data.is_active
        # If user is deactivated, revoke all their active sessions
        if data.is_active is False:
            await db.execute(
                update(RefreshToken)
                .where(RefreshToken.user_id == target_user.id, RefreshToken.is_revoked.is_(False))
                .values(is_revoked=True, revoked_at=func.now())
            )

    # 5. Record audit log
    audit_entry = AuditLog(
        actor_id=actor.id,
        actor_username=actor.username,
        action="USER_UPDATE",
        entity_type="user",
        entity_id=str(target_user.id),
        details={
            "target_username": target_user.username,
            "previous_state": previous_state,
            "new_state": {
                "full_name": target_user.full_name,
                "role": target_user.role,
                "is_active": target_user.is_active,
            },
        },
        ip_address=client_ip,
    )
    db.add(audit_entry)
    await db.commit()
    await db.refresh(target_user)
    return target_user


async def reset_staff_password(
    actor: User,
    user_id: uuid.UUID,
    new_password: str,
    client_ip: Optional[str],
    db: AsyncSession,
) -> None:
    """Resets staff password and revokes all active refresh token sessions."""
    target_user = await db.get(User, user_id)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy người dùng với ID '{user_id}'",
        )

    # 1. Update password hash
    target_user.password_hash = hash_password(new_password)

    # 2. Invalidate all active refresh tokens for target user
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == target_user.id, RefreshToken.is_revoked.is_(False))
        .values(is_revoked=True, revoked_at=func.now())
    )

    # 3. Record audit log
    audit_entry = AuditLog(
        actor_id=actor.id,
        actor_username=actor.username,
        action="USER_RESET_PASSWORD",
        entity_type="user",
        entity_id=str(target_user.id),
        details={"target_username": target_user.username},
        ip_address=client_ip,
    )
    db.add(audit_entry)
    await db.commit()
