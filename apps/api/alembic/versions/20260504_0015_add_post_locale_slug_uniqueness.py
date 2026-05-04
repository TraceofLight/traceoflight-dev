"""replace slug uniqueness with (slug, locale)

Revision ID: 20260504_0015
Revises: 20260504_0014
Create Date: 2026-05-04 12:30:00
"""

from __future__ import annotations

from alembic import op


revision = "20260504_0015"
down_revision = "20260504_0014"
branch_labels = None
depends_on = None


# The slug uniqueness was established in migration 0001 as a unique INDEX
# (op.create_index("ix_posts_slug", ..., unique=True)), not as a named UNIQUE
# constraint. Postgres names such indexes by the explicit name given to
# op.create_index, so the live name is "ix_posts_slug" — not the auto-generated
# "posts_slug_key" that Postgres would assign to an inline UNIQUE column
# declaration. Drop it with op.drop_index, not op.drop_constraint.
LEGACY_SLUG_INDEX_NAME = "ix_posts_slug"
COMPOSITE_UNIQUE_NAME = "uq_posts_slug_locale"


def upgrade() -> None:
    op.drop_index(LEGACY_SLUG_INDEX_NAME, table_name="posts")
    op.create_unique_constraint(
        COMPOSITE_UNIQUE_NAME,
        "posts",
        ["slug", "locale"],
    )


def downgrade() -> None:
    op.drop_constraint(COMPOSITE_UNIQUE_NAME, "posts", type_="unique")
    op.create_index(LEGACY_SLUG_INDEX_NAME, "posts", ["slug"], unique=True)
