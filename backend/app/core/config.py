from pathlib import Path
from typing import List, Union
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
import json


# Locate project root (containing .env)
BASE_DIR = Path(__file__).resolve().parent.parent.parent
ROOT_ENV = BASE_DIR.parent / ".env"
LOCAL_ENV = BASE_DIR / ".env"


class Settings(BaseSettings):
    # Application configuration
    APP_NAME: str = "Thanh Dương Quán POS"
    APP_VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    SECRET_KEY: str = "dev-insecure-secret-key-change-in-production-min32chars"

    # Security & Auth configuration
    JWT_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    JWT_ISSUER: str = "thanh-duong-pos"
    JWT_AUDIENCE: str = "thanh-duong-pos-client"
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    COOKIE_SECURE: bool = False  # Set to True in production HTTPS
    COOKIE_SAMESITE: str = "lax"
    OWNER_ADMIN_ADVISORY_LOCK_ID: int = 8472910384720192

    # Server configuration
    BACKEND_HOST: str = "0.0.0.0"
    BACKEND_PORT: int = 8000

    # PostgreSQL configuration
    POSTGRES_USER: str = "pos_user"
    POSTGRES_PASSWORD: str = "pos_password"
    POSTGRES_DB: str = "thanh_duong_pos"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432

    # Database URLs
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://pos_user:pos_password@localhost:5432/thanh_duong_pos",
        description="Async SQLAlchemy database URL (asyncpg)",
    )
    SYNC_DATABASE_URL: str = Field(
        default="postgresql+psycopg://pos_user:pos_password@localhost:5432/thanh_duong_pos",
        description="Sync SQLAlchemy database URL for Alembic and sync tools (psycopg)",
    )
    DB_POOL_CLASS: str = Field(
        default="queue",
        description="Connection pool class: 'queue' for connection pool or 'null' for NullPool (tests)",
    )

    # CORS configuration
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://192.168.1.22:5173",
    ]

    @field_validator("DEBUG", mode="before")
    @classmethod
    def normalize_debug(cls, value: object) -> object:
        """Accept legacy deployment labels while retaining a strict boolean internally."""
        if isinstance(value, str) and value.strip().lower() in {"release", "production", "prod"}:
            return False
        return value

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return [str(item) for item in parsed]
            except Exception:
                return [origin.strip() for origin in v.split(",") if origin.strip()]
        elif isinstance(v, list):
            return [str(item) for item in v]
        return []

    model_config = SettingsConfigDict(
        env_file=(str(LOCAL_ENV), str(ROOT_ENV)),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
