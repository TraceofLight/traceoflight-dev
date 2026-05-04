"""cleanup cross-locale series_posts rows and re-populate sibling mappings

Revision ID: 20260504_0017
Revises: 20260504_0016
Create Date: 2026-05-04 15:00:00

Step 1: delete cross-locale series_posts rows (e.g. a 'ko' series mapped to
        a 'ja' post).  After cleanup the DELETE matches no rows, so the
        migration is idempotent.

Step 2: populate sibling series (en/ja/zh) with their own locale's posts,
        derived from the canonical ko-source series mappings.  Uses
        ON CONFLICT (post_id) DO NOTHING so running twice is safe.

Downgrade: intentionally non-reversible — we cannot restore the corrupt state.
"""

from __future__ import annotations

from alembic import op


revision = "20260504_0017"
down_revision = "20260504_0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # Step 1: delete cross-locale rows
    # ------------------------------------------------------------------
    op.execute("""
        DELETE FROM series_posts
        WHERE id IN (
            SELECT sp.id
            FROM series_posts sp
            JOIN series s ON s.id = sp.series_id
            JOIN posts  p ON p.id = sp.post_id
            WHERE s.locale != p.locale
        )
    """)

    # ------------------------------------------------------------------
    # Step 2: re-populate sibling (en/ja/zh) series_posts from ko sources
    # ------------------------------------------------------------------
    op.execute("""
        INSERT INTO series_posts (id, series_id, post_id, order_index, created_at, updated_at)
        SELECT
            gen_random_uuid(),
            sib_series.id,
            sib_post.id,
            ko_sp.order_index,
            now(),
            now()
        FROM series_posts ko_sp
        JOIN series  ko_series  ON ko_series.id  = ko_sp.series_id
                                AND ko_series.locale = 'ko'
                                AND ko_series.source_series_id IS NULL
        JOIN posts   ko_post    ON ko_post.id    = ko_sp.post_id
                                AND ko_post.locale = 'ko'
        JOIN posts   sib_post   ON sib_post.translation_group_id = ko_post.translation_group_id
                                AND sib_post.locale != 'ko'
        JOIN series  sib_series ON sib_series.translation_group_id = ko_series.translation_group_id
                                AND sib_series.locale = sib_post.locale
        ON CONFLICT (post_id) DO NOTHING
    """)


def downgrade() -> None:
    raise RuntimeError(
        "20260504_0017 is one-way: cannot restore corrupt cross-locale series_posts mappings"
    )
