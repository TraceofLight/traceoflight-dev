"""add posts.series_title for async series projection

Revision ID: 20260305_0005
Revises: 20260305_0004
Create Date: 2026-03-05 23:45:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260305_0005"
down_revision = "20260305_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("posts", sa.Column("series_title", sa.String(length=200), nullable=True))
    op.create_index("ix_posts_series_title", "posts", ["series_title"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_posts_series_title", table_name="posts")
    op.drop_column("posts", "series_title")
