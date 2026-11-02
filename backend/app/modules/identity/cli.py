"""Command line interface for identity administrative tasks (Bootstrap OWNER)."""

import asyncio
import getpass
import sys
from typing import Optional
from sqlalchemy import select, func, text

from app.core.config import settings
from app.core.security import validate_username, validate_password_strength, hash_password
from app.db.session import AsyncSessionLocal
from app.modules.identity.models import User
from app.modules.audit.models import AuditLog


async def bootstrap_owner(target_username: Optional[str] = None) -> None:
    """Interactively creates the first OWNER account with advisory lock and getpass."""
    print("=" * 60)
    print("THANH DƯƠNG QUÁN POS — BOOTSTRAP OWNER INITIALIZATION")
    print("=" * 60)

    async with AsyncSessionLocal() as session:
        # 1. Acquire PostgreSQL advisory lock FIRST
        await session.execute(
            text("SELECT pg_advisory_xact_lock(:lock_id)"),
            {"lock_id": settings.OWNER_ADMIN_ADVISORY_LOCK_ID},
        )

        # 2. Check if an active OWNER already exists
        count_stmt = select(func.count(User.id)).where(
            User.role == "OWNER",
            User.is_active.is_(True),
        )
        active_owner_count = await session.scalar(count_stmt) or 0
        if active_owner_count > 0:
            print("❌ LỖI: Hệ thống đã có ít nhất một tài khoản OWNER đang hoạt động.")
            print("Thao tác bootstrap bị từ chối để bảo vệ tính bất biến và an toàn.")
            sys.exit(1)

        # 3. Prompt for username if not provided
        if not target_username:
            raw_username = input("Nhập tên đăng nhập cho OWNER (mặc định: admin): ").strip()
            target_username = raw_username if raw_username else "admin"

        try:
            username = validate_username(target_username)
        except ValueError as exc:
            print(f"❌ LỖI: {exc}")
            sys.exit(1)

        # Check if username exists
        existing = await session.scalar(select(User).where(User.username == username))
        if existing:
            print(f"❌ LỖI: Tên đăng nhập '{username}' đã tồn tại trong database.")
            sys.exit(1)

        raw_full_name = input("Nhập họ và tên Chủ Quán (mặc định: Quản Trị Viên): ").strip()
        full_name = raw_full_name if raw_full_name else "Quản Trị Viên"

        # 4. Prompt for password via getpass (hidden input, no cli args, no shell history)
        password = getpass.getpass("Nhập mật khẩu cho OWNER: ")
        confirm_password = getpass.getpass("Xác nhận lại mật khẩu: ")

        if password != confirm_password:
            print("❌ LỖI: Mật khẩu xác nhận không trùng khớp.")
            sys.exit(1)

        try:
            validate_password_strength(password)
        except ValueError as exc:
            print(f"❌ LỖI: {exc}")
            sys.exit(1)

        # 5. Create OWNER user
        hashed = hash_password(password)
        new_owner = User(
            username=username,
            full_name=full_name,
            password_hash=hashed,
            role="OWNER",
            is_active=True,
            created_by_id=None,
        )
        session.add(new_owner)
        await session.flush()

        # 6. Record audit log with SYSTEM_CLI convention
        audit_entry = AuditLog(
            actor_id=None,
            actor_username="SYSTEM_CLI",
            action="USER_BOOTSTRAP_OWNER",
            entity_type="user",
            entity_id=str(new_owner.id),
            details={
                "bootstrapped_username": new_owner.username,
                "role": "OWNER",
                "full_name": new_owner.full_name,
            },
            ip_address="127.0.0.1",
        )
        session.add(audit_entry)
        await session.commit()

        print(f"✅ KHỞI TẠO THÀNH CÔNG: Tài khoản OWNER '{username}' đã được tạo an toàn.")


def main():
    username_arg = sys.argv[1] if len(sys.argv) > 1 else None
    asyncio.run(bootstrap_owner(username_arg))


if __name__ == "__main__":
    main()
