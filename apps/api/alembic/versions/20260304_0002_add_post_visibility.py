"""add visibility column to posts

Revision ID: 20260304_0002
Revises: 20260303_0001
Create Date: 2026-03-04 20:30:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260304_0002"
down_revision = "20260303_0001"
branch_labels = None
depends_on = None

post_visibility = postgresql.ENUM("public", "private", name="post_visibility", create_type=False)


def upgrade() -> None:
    bind = op.get_bind()
    post_visibility.create(bind, checkfirst=True)

    op.add_column(
        "posts",
        sa.Column("visibility", post_visibility, nullable=False, server_default="public"),
    )
    op.create_index("ix_posts_visibility", "posts", ["visibility"], unique=False)
    op.alter_column("posts", "visibility", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()

    op.drop_index("ix_posts_visibility", table_name="posts")
    op.drop_column("posts", "visibility")

    post_visibility.drop(bind, checkfirst=True)
