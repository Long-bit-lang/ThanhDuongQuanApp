"""Unit tests for cryptographic security utilities, Argon2id, and JWT."""

import pytest
from app.core.security import (
    hash_password,
    verify_password,
    validate_username,
    validate_password_strength,
    create_jwt_access_token,
    decode_jwt_access_token,
    hash_token,
    generate_secure_token,
)


def test_argon2id_hashing_and_verification():
    raw_pwd = "P@ssword123!"
    hashed_1 = hash_password(raw_pwd)
    hashed_2 = hash_password(raw_pwd)

    # Different salts produce different hashes
    assert hashed_1 != hashed_2
    assert hashed_1.startswith("$argon2id$")
    assert raw_pwd not in hashed_1

    # Verification
    assert verify_password(raw_pwd, hashed_1) is True
    assert verify_password("WrongPassword123!", hashed_1) is False


def test_password_strength_policy():
    # Valid passwords
    validate_password_strength("ThanhDuong@2026")
    validate_password_strength("S3cureP@ssword!")

    # Invalid passwords
    with pytest.raises(ValueError, match="Mật khẩu phải từ 8 đến 128 ký tự"):
        validate_password_strength("Short1!")  # < 8 chars

    with pytest.raises(ValueError, match="Mật khẩu phải từ 8 đến 128 ký tự"):
        validate_password_strength("alllowercase123!")  # No uppercase

    with pytest.raises(ValueError, match="Mật khẩu phải từ 8 đến 128 ký tự"):
        validate_password_strength("ALLUPPERCASE123!")  # No lowercase

    with pytest.raises(ValueError, match="Mật khẩu phải từ 8 đến 128 ký tự"):
        validate_password_strength("NoDigitsSpecial@")  # No digits

    with pytest.raises(ValueError, match="Mật khẩu phải từ 8 đến 128 ký tự"):
        validate_password_strength("NoSpecialChar123")  # No special char


def test_username_validation():
    assert validate_username("  Admin_01  ") == "admin_01"
    assert validate_username("cashier") == "cashier"

    with pytest.raises(ValueError):
        validate_username("ab")  # Too short

    with pytest.raises(ValueError):
        validate_username("user@invalid!")  # Special chars not allowed

    with pytest.raises(ValueError):
        validate_username("a" * 35)  # Too long


def test_jwt_access_token_claims():
    token = create_jwt_access_token(
        user_id="123e4567-e89b-12d3-a456-426614174000",
        username="owner01",
        role="OWNER",
    )
    decoded = decode_jwt_access_token(token)

    assert decoded["sub"] == "123e4567-e89b-12d3-a456-426614174000"
    assert decoded["username"] == "owner01"
    assert decoded["role"] == "OWNER"
    assert decoded["type"] == "access"
    assert decoded["iss"] == "thanh-duong-pos"
    assert decoded["aud"] == "thanh-duong-pos-client"
    assert "exp" in decoded
    assert "iat" in decoded
    assert "jti" in decoded


def test_jwt_invalid_token():
    with pytest.raises(ValueError, match="Invalid access token"):
        decode_jwt_access_token("invalid.jwt.token")


def test_token_hashing():
    raw = generate_secure_token(48)
    h = hash_token(raw)
    assert len(h) == 64
    assert hash_token(raw) == h
