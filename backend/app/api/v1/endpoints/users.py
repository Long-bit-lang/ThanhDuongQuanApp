"""User management API endpoints: CRUD staff accounts and reset passwords (OWNER only)."""

import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, Request, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.identity.models import User
from app.modules.identity.schemas import (
    UserResponse,
    UserCreateRequest,
    UserUpdateRequest,
    ResetPasswordRequest,
    MessageResponse,
)
from app.modules.identity.services.user_service import (
    create_staff_user,
    list_staff_users,
    get_user_by_id,
    update_staff_user,
    reset_staff_password,
)
from app.modules.identity.dependencies import get_current_user, require_roles

router = APIRouter(prefix="/users", tags=["User Management"])


@router.post(
    "",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tạo tài khoản nhân viên mới (Chỉ OWNER)",
)
async def create_user(
    payload: UserCreateRequest,
    request: Request,
    current_user: User = Depends(require_roles("OWNER")),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Creates a new staff account with specified role."""
    client_ip = request.client.host if request.client else None
    new_user = await create_staff_user(
        actor=current_user,
        data=payload,
        client_ip=client_ip,
        db=db,
    )
    return UserResponse.model_validate(new_user)


@router.get(
    "",
    response_model=List[UserResponse],
    summary="Lấy danh sách tài khoản nhân viên (Chỉ OWNER)",
)
async def list_users(
    role: Optional[str] = Query(None, description="Lọc theo vai trò: OWNER, CASHIER, WAITER"),
    is_active: Optional[bool] = Query(None, description="Lọc theo trạng thái hoạt động"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(require_roles("OWNER")),
    db: AsyncSession = Depends(get_db),
) -> List[UserResponse]:
    """Lists staff members with filtering options."""
    users = await list_staff_users(
        role=role,
        is_active=is_active,
        skip=skip,
        limit=limit,
        db=db,
    )
    return [UserResponse.model_validate(u) for u in users]


@router.get(
    "/{user_id}",
    response_model=UserResponse,
    summary="Lấy thông tin chi tiết một tài khoản",
)
async def get_user(
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Fetches details for a user. Permitted for OWNER or if user views their own profile."""
    if current_user.role != "OWNER" and current_user.id != user_id:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền xem thông tin tài khoản người khác",
        )
    user = await get_user_by_id(user_id=user_id, db=db)
    return UserResponse.model_validate(user)


@router.patch(
    "/{user_id}",
    response_model=UserResponse,
    summary="Cập nhật thông tin/trạng thái tài khoản (Chỉ OWNER)",
)
async def update_user(
    user_id: uuid.UUID,
    payload: UserUpdateRequest,
    request: Request,
    current_user: User = Depends(require_roles("OWNER")),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Updates user fields with advisory lock on active OWNER invariants."""
    client_ip = request.client.host if request.client else None
    updated = await update_staff_user(
        actor=current_user,
        user_id=user_id,
        data=payload,
        client_ip=client_ip,
        db=db,
    )
    return UserResponse.model_validate(updated)


@router.post(
    "/{user_id}/reset-password",
    response_model=MessageResponse,
    summary="Đặt lại mật khẩu cho nhân viên (Chỉ OWNER)",
)
async def reset_password(
    user_id: uuid.UUID,
    payload: ResetPasswordRequest,
    request: Request,
    current_user: User = Depends(require_roles("OWNER")),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Resets staff password and revokes all active refresh token sessions."""
    client_ip = request.client.host if request.client else None
    await reset_staff_password(
        actor=current_user,
        user_id=user_id,
        new_password=payload.new_password,
        client_ip=client_ip,
        db=db,
    )
    return MessageResponse(message="Đặt lại mật khẩu thành công. Các phiên làm việc cũ đã bị thu hồi.")
