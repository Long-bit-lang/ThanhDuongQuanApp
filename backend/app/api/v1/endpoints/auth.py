"""Authentication API endpoints: /login, /refresh, /logout, /me."""

from typing import Optional
from fastapi import APIRouter, Depends, Request, Response, Header, Cookie, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.modules.identity.models import User
from app.modules.identity.schemas import (
    LoginRequest,
    TokenResponse,
    RefreshResponse,
    UserResponse,
    MessageResponse,
)
from app.modules.identity.services.auth_service import (
    login_user,
    refresh_user_tokens,
    logout_user,
)
from app.modules.identity.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])

REFRESH_COOKIE_NAME = "thanh_duong_refresh"


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Đăng nhập tài khoản nhân viên",
)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Authenticates staff and issues access token, CSRF token, and HttpOnly refresh cookie."""
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    access_token, raw_refresh_token, csrf_token, user = await login_user(
        username=payload.username,
        password=payload.password,
        client_ip=client_ip,
        user_agent=user_agent,
        db=db,
    )

    # Set HttpOnly refresh cookie
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=raw_refresh_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        path=f"{settings.API_V1_STR}/auth",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
    )

    return TokenResponse(
        access_token=access_token,
        csrf_token=csrf_token,
        token_type="bearer",
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserResponse.model_validate(user),
    )


@router.post(
    "/refresh",
    response_model=RefreshResponse,
    summary="Làm mới Access Token thông qua Refresh Token Family",
)
async def refresh_token(
    request: Request,
    response: Response,
    thanh_duong_refresh: Optional[str] = Cookie(None, alias=REFRESH_COOKIE_NAME),
    x_csrf_token: Optional[str] = Header(None, alias="X-CSRF-Token"),
    origin: Optional[str] = Header(None),
    referer: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
) -> RefreshResponse:
    """Rotates refresh token and returns a new access token and CSRF token."""
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    new_access, new_refresh, new_csrf = await refresh_user_tokens(
        raw_refresh_token=thanh_duong_refresh,
        client_csrf_token=x_csrf_token,
        client_ip=client_ip,
        user_agent=user_agent,
        origin=origin,
        referer=referer,
        db=db,
    )

    # Set rotated HttpOnly cookie
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=new_refresh,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        path=f"{settings.API_V1_STR}/auth",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
    )

    return RefreshResponse(
        access_token=new_access,
        csrf_token=new_csrf,
        token_type="bearer",
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Đăng xuất và thu hồi Refresh Token",
)
async def logout(
    response: Response,
    thanh_duong_refresh: Optional[str] = Cookie(None, alias=REFRESH_COOKIE_NAME),
    x_csrf_token: Optional[str] = Header(None, alias="X-CSRF-Token"),
    origin: Optional[str] = Header(None),
    referer: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Revokes active refresh token and clears cookie."""
    client_ip = None
    await logout_user(
        raw_refresh_token=thanh_duong_refresh,
        client_csrf_token=x_csrf_token,
        origin=origin,
        referer=referer,
        db=db,
    )

    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path=f"{settings.API_V1_STR}/auth",
    )

    return MessageResponse(message="Đăng xuất thành công")


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Lấy thông tin tài khoản đang đăng nhập",
)
async def get_me(
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    """Returns profile of currently authenticated user without password hash."""
    return UserResponse.model_validate(current_user)
