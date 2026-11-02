"""Security utilities: Argon2id password hashing, JWT operations, and cryptographic tokens."""

import secrets
import hashlib
import re
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHashError

from app.core.config import settings

# Argon2id password hasher with OWASP-recommended parameters
ph = PasswordHasher(
    time_cost=3,
    memory_cost=65536,  # 64 MiB
    parallelism=4,
    hash_len=32,
)

PASSWORD_REGEX = re.compile(
    r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]).{8,128}$"
)
USERNAME_REGEX = re.compile(r"^[a-z0-9_]{3,30}$")


def validate_username(username: str) -> str:
    """Standardizes and validates username."""
    normalized = username.strip().lower()
    if not USERNAME_REGEX.match(normalized):
        raise ValueError(
            "Tên đăng nhập chỉ được chứa 3-30 ký tự gồm chữ thường (a-z), chữ số (0-9) và dấu gạch dưới (_)"
        )
    return normalized


def validate_password_strength(password: str) -> None:
    """Enforces enterprise password strength policy."""
    if not PASSWORD_REGEX.match(password):
        raise ValueError(
            "Mật khẩu phải từ 8 đến 128 ký tự, bao gồm ít nhất 1 chữ hoa, 1 chữ thường, 1 chữ số và 1 ký tự đặc biệt"
        )


def hash_password(password: str) -> str:
    """Hashes password using Argon2id."""
    return ph.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies plain password against Argon2id hash."""
    try:
        return ph.verify(hashed_password, plain_password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def dummy_verify_password() -> None:
    """Performs dummy password verification to mitigate timing attacks on invalid usernames."""
    try:
        ph.verify(
            "$argon2id$v=19$m=65536,t=3,p=4$dGVzdHNhbHQxMjM0NTY3OA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            "dummy_password",
        )
    except Exception:
        pass


def hash_token(raw_token: str) -> str:
    """Computes SHA-256 hash of a raw token."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def generate_secure_token(length_bytes: int = 48) -> str:
    """Generates a cryptographically secure URL-safe random string."""
    return secrets.token_urlsafe(length_bytes)


def create_jwt_access_token(
    user_id: str,
    username: str,
    role: str,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Creates a signed HS256 JWT access token with standard claims."""
    now = datetime.now(timezone.utc)
    expire = now + (
        expires_delta or timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    secret_key = settings.JWT_SECRET_KEY or settings.SECRET_KEY

    payload: Dict[str, Any] = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "type": "access",
        "iss": settings.JWT_ISSUER,
        "aud": settings.JWT_AUDIENCE,
        "exp": expire,
        "iat": now,
        "jti": secrets.token_hex(16),
    }

    return jwt.encode(payload, secret_key, algorithm=settings.JWT_ALGORITHM)


def decode_jwt_access_token(token: str) -> Dict[str, Any]:
    """Decodes and strictly verifies HS256 JWT access token claims."""
    secret_key = settings.JWT_SECRET_KEY or settings.SECRET_KEY
    try:
        payload = jwt.decode(
            token,
            secret_key,
            algorithms=[settings.JWT_ALGORITHM],
            issuer=settings.JWT_ISSUER,
            audience=settings.JWT_AUDIENCE,
            options={
                "require": ["sub", "username", "role", "exp", "iat", "jti", "iss", "aud"],
                "verify_exp": True,
                "verify_iss": True,
                "verify_aud": True,
            },
        )
        if payload.get("type") != "access":
            raise jwt.InvalidTokenError("Token type must be 'access'")
        return payload
    except jwt.PyJWTError as exc:
        raise ValueError(f"Invalid access token: {exc}") from exc
