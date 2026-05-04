"""add series locale + translation linkage

Revision ID: 20260504_0016
Revises: 20260504_0015
Create Date: 2026-05-04 14:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260504_0016"
down_revision = "20260504_0015"
branch_labels = None
depends_on = None


# Legacy slug uniqueness on series was created as a unique INDEX (not a UNIQUE CONSTRAINT)
# via op.create_index("ix_series_slug", "series", ["slug"], unique=True) in 20260305_0004
LEGACY_SERIES_SLUG_INDEX_NAME = "ix_series_slug"
COMPOSITE_UNIQUE_NAME = "uq_series_slug_locale"


def upgrade() -> None:
    locale_enum = sa.Enum("ko", "en", "ja", "zh", name="post_locale", create_type=False)
    status_enum = sa.Enum("source", "synced", "stale", "failed", name="post_translation_status", create_type=False)
    kind_enum = sa.Enum("manual", "machine", name="post_translation_source_kind", create_type=False)

    op.add_column("series", sa.Column("locale", locale_enum, nullable=True))
    op.add_column("series", sa.Column("translation_group_id", sa.Uuid(), nullable=True))
    op.add_column("series", sa.Column("source_series_id", sa.Uuid(), nullable=True))
    op.add_column("series", sa.Column("translation_status", status_enum, nullable=True))
    op.add_column("series", sa.Column("translation_source_kind", kind_enum, nullable=True))
    op.add_column("series", sa.Column("translated_from_hash", sa.String(length=64), nullable=True))

    op.execute("""
        UPDATE series
        SET locale = 'ko',
            translation_group_id = id,
            translation_status = 'source',
            translation_source_kind = 'manual'
        WHERE locale IS NULL
    """)

    op.alter_column("series", "locale", nullable=False)
    op.alter_column("series", "translation_group_id", nullable=False)
    op.alter_column("series", "translation_status", nullable=False)
    op.alter_column("series", "translation_source_kind", nullable=False)

    op.create_index("ix_series_locale", "series", ["locale"])
    op.create_index("ix_series_translation_group_id", "series", ["translation_group_id"])
    op.create_index("ix_series_source_series_id", "series", ["source_series_id"])
    op.create_foreign_key(
        "fk_series_source_series_id_series",
        "series", "series", ["source_series_id"], ["id"], ondelete="SET NULL",
    )

    # Replace single-column slug uniqueness with (slug, locale) composite
    op.drop_index(LEGACY_SERIES_SLUG_INDEX_NAME, table_name="series")
    op.create_unique_constraint(COMPOSITE_UNIQUE_NAME, "series", ["slug", "locale"])


def downgrade() -> None:
    op.drop_constraint(COMPOSITE_UNIQUE_NAME, "series", type_="unique")
    op.create_index(LEGACY_SERIES_SLUG_INDEX_NAME, "series", ["slug"], unique=True)

    op.drop_constraint("fk_series_source_series_id_series", "series", type_="foreignkey")
    op.drop_index("ix_series_source_series_id", table_name="series")
    op.drop_index("ix_series_translation_group_id", table_name="series")
    op.drop_index("ix_series_locale", table_name="series")

    op.drop_column("series", "translated_from_hash")
    op.drop_column("series", "translation_source_kind")
    op.drop_column("series", "translation_status")
    op.drop_column("series", "source_series_id")
    op.drop_column("series", "translation_group_id")
    op.drop_column("series", "locale")
