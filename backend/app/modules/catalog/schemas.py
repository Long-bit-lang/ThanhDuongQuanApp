import uuid
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field

class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: Optional[str] = None
    sale_price: Decimal = Field(ge=0, max_digits=14, decimal_places=2)

class ProductUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=160)
    description: Optional[str] = None
    sale_price: Optional[Decimal] = Field(None, ge=0, max_digits=14, decimal_places=2)

class ProductResponse(ProductCreate):
    id: uuid.UUID
    is_available: bool
    is_archived: bool
    model_config = ConfigDict(from_attributes=True)
