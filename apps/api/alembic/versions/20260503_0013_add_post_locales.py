"""add post locales and translation linkage

Revision ID: 20260503_0013
Revises: 20260324_0012
Create Date: 2026-05-03 12:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260503_0013"
down_revision = "20260324_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    locale_enum = sa.Enum("ko", "en", "ja", "zh", name="post_locale")
    status_enum = sa.Enum("source", "synced", "stale", "failed", name="post_translation_status")
    kind_enum = sa.Enum("manual", "machine", name="post_translation_source_kind")
    locale_enum.create(op.get_bind(), checkfirst=True)
    status_enum.create(op.get_bind(), checkfirst=True)
    kind_enum.create(op.get_bind(), checkfirst=True)

    op.add_column("posts", sa.Column("locale", locale_enum, nullable=True))
    op.add_column("posts", sa.Column("translation_group_id", sa.Uuid(), nullable=True))
    op.add_column("posts", sa.Column("source_post_id", sa.Uuid(), nullable=True))
    op.add_column("posts", sa.Column("translation_status", status_enum, nullable=True))
    op.add_column("posts", sa.Column("translation_source_kind", kind_enum, nullable=True))

    op.execute(
        """
        UPDATE posts
        SET
            locale = 'ko',
            translation_group_id = id,
            translation_status = 'source',
            translation_source_kind = 'manual'
        WHERE locale IS NULL
        """
    )

    op.alter_column("posts", "locale", nullable=False)
    op.alter_column("posts", "translation_group_id", nullable=False)
    op.alter_column("posts", "translation_status", nullable=False)
    op.alter_column("posts", "translation_source_kind", nullable=False)

    op.create_index("ix_posts_locale", "posts", ["locale"])
    op.create_index("ix_posts_translation_group_id", "posts", ["translation_group_id"])
    op.create_index("ix_posts_source_post_id", "posts", ["source_post_id"])
    op.create_foreign_key(
        "fk_posts_source_post_id_posts",
        "posts",
        "posts",
        ["source_post_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_posts_source_post_id_posts", "posts", type_="foreignkey")
    op.drop_index("ix_posts_source_post_id", table_name="posts")
    op.drop_index("ix_posts_translation_group_id", table_name="posts")
    op.drop_index("ix_posts_locale", table_name="posts")
    op.drop_column("posts", "translation_source_kind")
    op.drop_column("posts", "translation_status")
    op.drop_column("posts", "source_post_id")
    op.drop_column("posts", "translation_group_id")
    op.drop_column("posts", "locale")
    sa.Enum(name="post_translation_source_kind").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="post_translation_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="post_locale").drop(op.get_bind(), checkfirst=True)
