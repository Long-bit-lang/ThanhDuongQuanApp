from decimal import Decimal
from typing import Literal, Optional
from pydantic import BaseModel, Field
class DiscountRequest(BaseModel):
    discount_type: Literal["PERCENT", "FIXED"]
    value: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    invoice_item_id: Optional[str] = None
class AdjustmentRequest(BaseModel):
    amount: Decimal = Field(max_digits=14, decimal_places=2)
    reason: str = Field(min_length=1, max_length=1000)
