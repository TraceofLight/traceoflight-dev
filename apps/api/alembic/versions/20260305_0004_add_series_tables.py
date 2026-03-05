"""add series and series_posts tables

Revision ID: 20260305_0004
Revises: 20260305_0003
Create Date: 2026-03-05 21:40:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260305_0004"
down_revision = "20260305_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "series",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("slug", sa.String(length=160), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("cover_image_url", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_series_slug", "series", ["slug"], unique=True)

    op.create_table(
        "series_posts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "series_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("series.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "post_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("posts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("post_id", name="uq_series_posts_post_id"),
        sa.UniqueConstraint("series_id", "order_index", name="uq_series_posts_series_order"),
    )
    op.create_index("ix_series_posts_series_id", "series_posts", ["series_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_series_posts_series_id", table_name="series_posts")
    op.drop_table("series_posts")

    op.drop_index("ix_series_slug", table_name="series")
    op.drop_table("series")
