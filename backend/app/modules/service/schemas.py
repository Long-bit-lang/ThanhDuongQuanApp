import uuid
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field


class AddItem(BaseModel):
    product_id: uuid.UUID
    quantity: Decimal = Field(gt=Decimal("0"), le=Decimal("9999"))
    note: Optional[str] = Field(None, max_length=1000)


class UpdateItemQuantity(BaseModel):
    quantity: Decimal = Field(gt=Decimal("0"), le=Decimal("9999"))


class CreateOrder(BaseModel):
    items: list[AddItem] = Field(min_length=1)


class CancelItem(BaseModel):
    reason: Optional[str] = Field(None, max_length=1000)


class TransferItems(BaseModel):
    source_session_id: uuid.UUID
    target_session_id: uuid.UUID
    order_item_ids: list[uuid.UUID] = Field(min_length=1)
