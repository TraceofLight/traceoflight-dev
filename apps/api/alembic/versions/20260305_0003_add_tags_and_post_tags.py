"""add tags and post_tags tables

Revision ID: 20260305_0003
Revises: 20260304_0002
Create Date: 2026-03-05 11:20:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260305_0003"
down_revision = "20260304_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tags",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("label", sa.String(length=80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_tags_slug", "tags", ["slug"], unique=True)

    op.create_table(
        "post_tags",
        sa.Column(
            "post_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("posts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "tag_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tags.id"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("post_id", "tag_id"),
    )
    op.create_index("ix_post_tags_tag_id", "post_tags", ["tag_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_post_tags_tag_id", table_name="post_tags")
    op.drop_table("post_tags")

    op.drop_index("ix_tags_slug", table_name="tags")
    op.drop_table("tags")
