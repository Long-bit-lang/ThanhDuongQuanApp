"""Dining floor and active service-session entities."""
import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, TimestampMixin


class DiningTable(Base, TimestampMixin):
    __tablename__ = "dining_tables"
    __table_args__ = (UniqueConstraint("code", name="uq_dining_tables_code"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    display_name: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="AVAILABLE")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, unique=True)


class ServiceSession(Base, TimestampMixin):
    __tablename__ = "service_sessions"
    __table_args__ = (CheckConstraint("status IN ('OPEN', 'CLOSED')", name="chk_service_sessions_status"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="OPEN")
    opened_by_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    closed_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"))
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class SessionTable(Base):
    __tablename__ = "session_tables"
    __table_args__ = (UniqueConstraint("session_id", "table_id", name="uq_session_tables_pair"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("service_sessions.id", ondelete="RESTRICT"), nullable=False)
    table_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("dining_tables.id", ondelete="RESTRICT"), nullable=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)
    left_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
