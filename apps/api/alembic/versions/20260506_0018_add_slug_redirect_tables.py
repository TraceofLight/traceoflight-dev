"""add slug redirect tables

Revision ID: 20260506_0018
Revises: 20260504_0017
Create Date: 2026-05-06 12:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260506_0018"
down_revision = "20260504_0017"
branch_labels = None
depends_on = None


def _locale_enum() -> postgresql.ENUM:
    # Reference the enum created by 20260503_0013. Use postgresql.ENUM with
    # create_type=False so CREATE TYPE is suppressed during table creation
    # (sa.Enum's create_type=False does not propagate through op.create_table
    # on the Postgres dialect — it still emits CREATE TYPE and fails).
    return postgresql.ENUM("ko", "en", "ja", "zh", name="post_locale", create_type=False)


def upgrade() -> None:
    op.create_table(
        "post_slug_redirects",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("locale", _locale_enum(), nullable=False),
        sa.Column("old_slug", sa.String(length=160), nullable=False),
        sa.Column("target_post_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_hit_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("hit_count", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(
            ["target_post_id"],
            ["posts.id"],
            name="fk_post_slug_redirects_target_post_id",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("locale", "old_slug", name="uq_post_slug_redirects_locale_old_slug"),
    )
    op.create_index(
        "ix_post_slug_redirects_target_post_id",
        "post_slug_redirects",
        ["target_post_id"],
    )

    op.create_table(
        "series_slug_redirects",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("locale", _locale_enum(), nullable=False),
        sa.Column("old_slug", sa.String(length=160), nullable=False),
        sa.Column("target_series_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_hit_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("hit_count", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(
            ["target_series_id"],
            ["series.id"],
            name="fk_series_slug_redirects_target_series_id",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("locale", "old_slug", name="uq_series_slug_redirects_locale_old_slug"),
    )
    op.create_index(
        "ix_series_slug_redirects_target_series_id",
        "series_slug_redirects",
        ["target_series_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_series_slug_redirects_target_series_id", table_name="series_slug_redirects")
    op.drop_table("series_slug_redirects")
    op.drop_index("ix_post_slug_redirects_target_post_id", table_name="post_slug_redirects")
    op.drop_table("post_slug_redirects")
