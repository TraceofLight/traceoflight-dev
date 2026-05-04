"""add translated_from_hash to posts

Revision ID: 20260504_0014
Revises: 20260503_0013
Create Date: 2026-05-04 12:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260504_0014"
down_revision = "20260503_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "posts",
        sa.Column("translated_from_hash", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("posts", "translated_from_hash")
