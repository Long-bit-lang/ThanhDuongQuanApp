import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, Field


class TableResponse(BaseModel):
    id: uuid.UUID
    code: str
    display_name: str
    status: str
    sort_order: int
    active_session_id: Optional[uuid.UUID] = None
    running_subtotal: Optional[Decimal] = None
    session_opened_at: Optional[datetime] = None
    order_count: int = 0
    active_table_codes: List[str] = Field(default_factory=list)
    payment_status: Optional[str] = "AVAILABLE"  # "AVAILABLE", "UNPAID", "PAID"
    invoice_status: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_id: Optional[uuid.UUID] = None

    class Config:
        from_attributes = True


class OpenSessionResponse(BaseModel):
    id: uuid.UUID
    status: str
    opened_by_id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True


class MergeRequest(BaseModel):
    session_ids: list[uuid.UUID] = Field(min_length=2, description="Danh sách ID các phiên cần gộp")


class SplitRequest(BaseModel):
    source_session_id: uuid.UUID
    target_table_id: uuid.UUID
    order_item_ids: list[uuid.UUID] = Field(min_length=1, description="Danh sách món cần tách sang bàn mới")


class TransferItemsRequest(BaseModel):
    source_session_id: uuid.UUID
    target_session_id: uuid.UUID
    order_item_ids: list[uuid.UUID] = Field(min_length=1, description="Danh sách món cần chuyển")
