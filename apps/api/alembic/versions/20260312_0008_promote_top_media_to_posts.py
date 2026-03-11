"""promote top media fields to posts

Revision ID: 20260312_0008
Revises: 20260311_0007
Create Date: 2026-03-12 13:10:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260312_0008"
down_revision = "20260311_0007"
branch_labels = None
depends_on = None


post_top_media_kind = postgresql.ENUM(
    "image",
    "youtube",
    "video",
    name="post_top_media_kind",
    create_type=False,
)

project_detail_media_kind = postgresql.ENUM(
    "image",
    "youtube",
    "video",
    name="project_detail_media_kind",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    post_top_media_kind.create(bind, checkfirst=True)

    op.add_column(
        "posts",
        sa.Column(
            "top_media_kind",
            post_top_media_kind,
            nullable=False,
            server_default="image",
        ),
    )
    op.add_column("posts", sa.Column("top_media_image_url", sa.String(length=500), nullable=True))
    op.add_column("posts", sa.Column("top_media_youtube_url", sa.String(length=500), nullable=True))
    op.add_column("posts", sa.Column("top_media_video_url", sa.String(length=500), nullable=True))

    op.execute(
        """
        UPDATE posts
        SET top_media_kind = 'image',
            top_media_image_url = cover_image_url
        """
    )
    op.execute(
        """
        UPDATE posts AS p
        SET top_media_kind = COALESCE(pp.detail_media_kind::text, 'image')::post_top_media_kind,
            top_media_image_url = CASE
                WHEN pp.detail_media_kind = 'image' THEN COALESCE(pp.detail_image_url, pp.card_image_url, p.cover_image_url)
                ELSE p.top_media_image_url
            END,
            top_media_youtube_url = CASE
                WHEN pp.detail_media_kind = 'youtube' THEN pp.youtube_url
                ELSE NULL
            END,
            top_media_video_url = CASE
                WHEN pp.detail_media_kind = 'video' THEN pp.detail_video_url
                ELSE NULL
            END
        FROM project_profiles AS pp
        WHERE pp.post_id = p.id
        """
    )

    op.drop_column("project_profiles", "detail_video_url")
    op.drop_column("project_profiles", "youtube_url")
    op.drop_column("project_profiles", "detail_image_url")
    op.drop_column("project_profiles", "detail_media_kind")
    project_detail_media_kind.drop(bind, checkfirst=True)

    op.alter_column("posts", "top_media_kind", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    project_detail_media_kind.create(bind, checkfirst=True)

    op.add_column(
        "project_profiles",
        sa.Column("detail_media_kind", project_detail_media_kind, nullable=False, server_default="image"),
    )
    op.add_column("project_profiles", sa.Column("detail_image_url", sa.String(length=500), nullable=True))
    op.add_column("project_profiles", sa.Column("youtube_url", sa.String(length=500), nullable=True))
    op.add_column("project_profiles", sa.Column("detail_video_url", sa.String(length=500), nullable=True))

    op.execute(
        """
        UPDATE project_profiles AS pp
        SET detail_media_kind = COALESCE(p.top_media_kind::text, 'image')::project_detail_media_kind,
            detail_image_url = CASE
                WHEN p.top_media_kind = 'image' THEN p.top_media_image_url
                ELSE NULL
            END,
            youtube_url = CASE
                WHEN p.top_media_kind = 'youtube' THEN p.top_media_youtube_url
                ELSE NULL
            END,
            detail_video_url = CASE
                WHEN p.top_media_kind = 'video' THEN p.top_media_video_url
                ELSE NULL
            END
        FROM posts AS p
        WHERE pp.post_id = p.id
        """
    )

    op.alter_column("project_profiles", "detail_media_kind", server_default=None)

    op.drop_column("posts", "top_media_video_url")
    op.drop_column("posts", "top_media_youtube_url")
    op.drop_column("posts", "top_media_image_url")
    op.drop_column("posts", "top_media_kind")
    post_top_media_kind.drop(bind, checkfirst=True)
