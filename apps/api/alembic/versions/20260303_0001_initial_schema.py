"""initial tables for posts and media assets

Revision ID: 20260303_0001
Revises:
Create Date: 2026-03-03 19:45:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260303_0001"
down_revision = None
branch_labels = None
depends_on = None

post_status = sa.Enum("draft", "published", "archived", name="post_status")
asset_kind = sa.Enum("image", "video", "file", name="asset_kind")


def upgrade() -> None:
    post_status.create(op.get_bind(), checkfirst=True)
    asset_kind.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "posts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("slug", sa.String(length=160), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("excerpt", sa.String(length=400), nullable=True),
        sa.Column("body_markdown", sa.Text(), nullable=False),
        sa.Column("cover_image_url", sa.String(length=500), nullable=True),
        sa.Column("status", post_status, nullable=False, server_default="draft"),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_posts_slug", "posts", ["slug"], unique=True)
    op.create_index("ix_posts_status", "posts", ["status"], unique=False)

    op.create_table(
        "media_assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("kind", asset_kind, nullable=False),
        sa.Column("bucket", sa.String(length=100), nullable=False),
        sa.Column("object_key", sa.String(length=512), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=120), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("owner_post_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("posts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_media_assets_object_key", "media_assets", ["object_key"], unique=True)
    op.create_index("ix_media_assets_kind", "media_assets", ["kind"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_media_assets_kind", table_name="media_assets")
    op.drop_index("ix_media_assets_object_key", table_name="media_assets")
    op.drop_table("media_assets")

    op.drop_index("ix_posts_status", table_name="posts")
    op.drop_index("ix_posts_slug", table_name="posts")
    op.drop_table("posts")

    asset_kind.drop(op.get_bind(), checkfirst=True)
    post_status.drop(op.get_bind(), checkfirst=True)