"""add project content kind and project profiles

Revision ID: 20260311_0006
Revises: 20260305_0005
Create Date: 2026-03-11 17:40:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260311_0006"
down_revision = "20260305_0005"
branch_labels = None
depends_on = None

post_content_kind = postgresql.ENUM(
    "blog",
    "project",
    name="post_content_kind",
    create_type=False,
)
project_detail_media_kind = postgresql.ENUM(
    "image",
    "youtube",
    name="project_detail_media_kind",
    create_type=False,
)


def upgrade() -> None:
    post_content_kind.create(op.get_bind(), checkfirst=True)
    project_detail_media_kind.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "posts",
        sa.Column(
            "content_kind",
            post_content_kind,
            nullable=False,
            server_default="blog",
        ),
    )
    op.create_index("ix_posts_content_kind", "posts", ["content_kind"], unique=False)

    op.create_table(
        "project_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "post_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("posts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("period_label", sa.String(length=120), nullable=False),
        sa.Column("role_summary", sa.String(length=240), nullable=False),
        sa.Column("card_image_url", sa.String(length=500), nullable=True),
        sa.Column(
            "detail_media_kind",
            project_detail_media_kind,
            nullable=False,
            server_default="image",
        ),
        sa.Column("detail_image_url", sa.String(length=500), nullable=True),
        sa.Column("youtube_url", sa.String(length=500), nullable=True),
        sa.Column("highlights_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("resource_links_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("post_id", name="uq_project_profiles_post_id"),
    )
    op.create_index("ix_project_profiles_post_id", "project_profiles", ["post_id"], unique=True)

    op.alter_column("posts", "content_kind", server_default=None)
    op.alter_column("project_profiles", "detail_media_kind", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_project_profiles_post_id", table_name="project_profiles")
    op.drop_table("project_profiles")

    op.drop_index("ix_posts_content_kind", table_name="posts")
    op.drop_column("posts", "content_kind")

    project_detail_media_kind.drop(op.get_bind(), checkfirst=True)
    post_content_kind.drop(op.get_bind(), checkfirst=True)
