"""Allow decimal quantities for order items and invoice items.

Revision ID: e2b5d4a1c3f9
Revises: f1a8c2d6e4b0
"""
from alembic import op
import sqlalchemy as sa

revision = "e2b5d4a1c3f9"
down_revision = "f1a8c2d6e4b0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "order_items",
        "quantity",
        type_=sa.Numeric(12, 3),
        existing_type=sa.Integer(),
        nullable=False,
    )
    op.alter_column(
        "invoice_items",
        "quantity",
        type_=sa.Numeric(12, 3),
        existing_type=sa.Integer(),
        nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "invoice_items",
        "quantity",
        type_=sa.Integer(),
        existing_type=sa.Numeric(12, 3),
        nullable=False,
    )
    op.alter_column(
        "order_items",
        "quantity",
        type_=sa.Integer(),
        existing_type=sa.Numeric(12, 3),
        nullable=False,
    )
