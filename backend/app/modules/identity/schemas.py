"""Pydantic schemas for identity, authentication, and user management."""

import uuid
from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, ConfigDict, field_validator

from app.core.security import validate_username, validate_password_strength

ValidRole = Literal["OWNER", "CASHIER", "WAITER"]


class LoginRequest(BaseModel):
    """Payload for POST /api/v1/auth/login."""

    username: str
    password: str

    @field_validator("username")
    @classmethod
    def sanitize_username(cls, v: str) -> str:
        return validate_username(v)


class UserResponse(BaseModel):
    """Public user response schema excluding password hash."""

    id: uuid.UUID
    username: str
    full_name: str
    role: ValidRole
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    """Response returned upon successful authentication."""

    access_token: str
    csrf_token: str
    token_type: str = "bearer"
    expires_in: int = 900  # 15 minutes in seconds
    user: UserResponse


class RefreshResponse(BaseModel):
    """Response returned upon successful token rotation."""

    access_token: str
    csrf_token: str
    token_type: str = "bearer"
    expires_in: int = 900


class UserCreateRequest(BaseModel):
    """Payload for OWNER creating a new staff user."""

    username: str
    full_name: str
    password: str
    role: ValidRole

    @field_validator("username")
    @classmethod
    def sanitize_username(cls, v: str) -> str:
        return validate_username(v)

    @field_validator("password")
    @classmethod
    def enforce_password_policy(cls, v: str) -> str:
        validate_password_strength(v)
        return v

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: str) -> str:
        cleaned = v.strip()
        if len(cleaned) < 2 or len(cleaned) > 100:
            raise ValueError("Họ tên phải từ 2 đến 100 ký tự")
        return cleaned


class UserUpdateRequest(BaseModel):
    """Payload for OWNER updating staff user details."""

    full_name: Optional[str] = None
    role: Optional[ValidRole] = None
    is_active: Optional[bool] = None

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            cleaned = v.strip()
            if len(cleaned) < 2 or len(cleaned) > 100:
                raise ValueError("Họ tên phải từ 2 đến 100 ký tự")
            return cleaned
        return None


class ResetPasswordRequest(BaseModel):
    """Payload for OWNER resetting a staff user's password."""

    new_password: str

    @field_validator("new_password")
    @classmethod
    def enforce_password_policy(cls, v: str) -> str:
        validate_password_strength(v)
        return v


class MessageResponse(BaseModel):
    """Generic status response."""

    message: str
