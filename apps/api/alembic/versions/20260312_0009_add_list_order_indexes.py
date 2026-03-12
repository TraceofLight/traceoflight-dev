"""add list order indexes for projects and series

Revision ID: 20260312_0009
Revises: 20260312_0008
Create Date: 2026-03-12 19:50:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260312_0009"
down_revision = "20260312_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("posts", sa.Column("project_order_index", sa.Integer(), nullable=True))
    op.create_index("ix_posts_project_order_index", "posts", ["project_order_index"], unique=False)

    op.add_column("series", sa.Column("list_order_index", sa.Integer(), nullable=True))
    op.create_index("ix_series_list_order_index", "series", ["list_order_index"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_series_list_order_index", table_name="series")
    op.drop_column("series", "list_order_index")

    op.drop_index("ix_posts_project_order_index", table_name="posts")
    op.drop_column("posts", "project_order_index")
