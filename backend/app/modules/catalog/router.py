"""Catalog module: Products, pricing, availability toggling, and archival."""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import dispatch_pos_event
from app.db.session import get_db
from app.modules.identity.dependencies import get_current_user, require_roles
from app.modules.identity.models import User
from app.modules.audit.models import AuditLog
from app.modules.catalog.models import Product
from app.modules.catalog.schemas import ProductCreate, ProductUpdate, ProductResponse

router = APIRouter(prefix="/products", tags=["Catalog"])
STAFF_EDITORS = ("OWNER", "CASHIER")


@router.get("", response_model=list[ProductResponse])
async def list_products(
    include_archived: bool = False,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Lists menu products (WAITER, CASHIER, OWNER)."""
    statement = select(Product).order_by(Product.name)
    if not include_archived:
        statement = statement.where(Product.is_archived.is_(False))
    return list((await db.scalars(statement)).all())


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Retrieves product details by ID."""
    product = await db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Không tìm thấy món ăn/đồ uống")
    return product


@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    payload: ProductCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(*STAFF_EDITORS)),
):
    """Creates a new menu product (OWNER, CASHIER only)."""
    existing = await db.scalar(select(Product).where(Product.name == payload.name))
    if existing:
        raise HTTPException(status_code=409, detail="Tên món này đã tồn tại trong thực đơn")

    product = Product(**payload.model_dump(), created_by_id=user.id)
    db.add(product)
    await db.flush()

    # Audit log
    db.add(AuditLog(
        actor_id=user.id,
        actor_username=user.username,
        action="PRODUCT_CREATED",
        entity_type="product",
        entity_id=str(product.id),
        details={"name": product.name, "sale_price": float(product.sale_price)},
    ))
    await db.flush()

    dispatch_pos_event("PRODUCT_AVAILABILITY_CHANGED", {
        "product_id": str(product.id),
        "name": product.name,
        "is_available": product.is_available,
    })

    return product


@router.patch("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: UUID,
    payload: ProductUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(*STAFF_EDITORS)),
):
    """Updates product information (OWNER, CASHIER only)."""
    product = await db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Không tìm thấy món")

    update_data = payload.model_dump(exclude_unset=True)
    if "name" in update_data and update_data["name"] != product.name:
        existing = await db.scalar(select(Product).where(Product.name == update_data["name"]))
        if existing and existing.id != product.id:
            raise HTTPException(status_code=409, detail="Tên món này đã tồn tại")

    for key, value in update_data.items():
        setattr(product, key, value)
    await db.flush()

    # Audit log
    db.add(AuditLog(
        actor_id=user.id,
        actor_username=user.username,
        action="PRODUCT_UPDATED",
        entity_type="product",
        entity_id=str(product.id),
        details={"updated_fields": list(update_data.keys())},
    ))
    await db.flush()

    dispatch_pos_event("PRODUCT_AVAILABILITY_CHANGED", {
        "product_id": str(product.id),
        "name": product.name,
        "is_available": product.is_available,
    })

    return product


@router.post("/{product_id}/archive", response_model=ProductResponse)
async def archive_product(
    product_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(*STAFF_EDITORS)),
):
    """Soft deletes / archives product so historical orders and invoices are preserved."""
    product = await db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Không tìm thấy món")

    product.is_archived = True
    product.is_available = False
    await db.flush()

    # Audit log
    db.add(AuditLog(
        actor_id=user.id,
        actor_username=user.username,
        action="PRODUCT_ARCHIVED",
        entity_type="product",
        entity_id=str(product.id),
        details={"name": product.name},
    ))
    await db.flush()

    dispatch_pos_event("PRODUCT_AVAILABILITY_CHANGED", {
        "product_id": str(product.id),
        "name": product.name,
        "is_available": False,
        "is_archived": True,
    })

    return product


@router.post("/{product_id}/toggle-availability", response_model=ProductResponse)
async def toggle_availability(
    product_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(*STAFF_EDITORS)),
):
    """Marks product as sold out (hết món) or back on sale (đang bán)."""
    product = await db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Không tìm thấy món")
    if product.is_archived:
        raise HTTPException(status_code=409, detail="Món đã lưu trữ (archive) không thể mở bán lại trực tiếp")

    product.is_available = not product.is_available
    await db.flush()

    # Audit log
    db.add(AuditLog(
        actor_id=user.id,
        actor_username=user.username,
        action="PRODUCT_AVAILABILITY_TOGGLED",
        entity_type="product",
        entity_id=str(product.id),
        details={"name": product.name, "is_available": product.is_available},
    ))
    await db.flush()

    dispatch_pos_event("PRODUCT_AVAILABILITY_CHANGED", {
        "product_id": str(product.id),
        "name": product.name,
        "is_available": product.is_available,
    })

    return product
