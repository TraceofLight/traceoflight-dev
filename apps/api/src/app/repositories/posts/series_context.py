"""Bulk attach series_context payloads to Post rows."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.post import Post, PostStatus, PostVisibility
from app.models.series import Series, SeriesPost


class SeriesContextService:
    """Attach in-series prev/next navigation context to Post rows.

    The implementation issues at most two queries regardless of the
    number of posts passed in.
    """

    def __init__(self, db: Session) -> None:
        self.db = db

    def attach(self, post: Post, public_only: bool) -> None:
        """Single-post helper that delegates to the bulk implementation."""

        self.apply([post], public_only=public_only)

    def apply(self, posts: list[Post], public_only: bool) -> list[Post]:
        if not posts:
            return posts

        post_ids = [post.id for post in posts if post.id is not None]
        if not post_ids:
            for post in posts:
                setattr(post, "series_context", None)
            return posts

        # Step 1: locate every input post's parent series mapping.
        mapping_rows = list(
            self.db.execute(
                select(
                    SeriesPost.post_id,
                    SeriesPost.order_index,
                    Series.id,
                    Series.slug,
                    Series.title,
                ).join(Series, Series.id == SeriesPost.series_id)
                .where(SeriesPost.post_id.in_(post_ids))
            )
        )
        if not mapping_rows:
            for post in posts:
                setattr(post, "series_context", None)
            return posts

        post_to_series: dict[object, dict[str, object]] = {}
        series_ids: set[object] = set()
        for row in mapping_rows:
            post_to_series[row.post_id] = {
                "series_id": row.id,
                "series_slug": row.slug,
                "series_title": row.title,
                "order_index": row.order_index,
            }
            series_ids.add(row.id)

        # Step 2: fetch the ordered post listing for every series in one query.
        ordered_by_series: dict[object, list] = {sid: [] for sid in series_ids}
        for row in self.db.execute(
            select(
                SeriesPost.series_id,
                SeriesPost.order_index,
                Post.slug,
                Post.title,
                Post.status,
                Post.visibility,
            ).join(Post, Post.id == SeriesPost.post_id)
            .where(SeriesPost.series_id.in_(list(series_ids)))
            .order_by(SeriesPost.series_id, SeriesPost.order_index.asc())
        ):
            ordered_by_series[row.series_id].append(row)

        # Step 3: assemble per-post context using the in-memory listings.
        for post in posts:
            mapping = post_to_series.get(post.id)
            if mapping is None:
                setattr(post, "series_context", None)
                continue
            ordered_rows = ordered_by_series.get(mapping["series_id"], [])
            if public_only:
                ordered_rows = [
                    row
                    for row in ordered_rows
                    if row.status == PostStatus.PUBLISHED
                    and row.visibility == PostVisibility.PUBLIC
                ]

            current_index = next(
                (idx for idx, row in enumerate(ordered_rows) if row.slug == post.slug),
                None,
            )
            if current_index is None:
                setattr(post, "series_context", None)
                continue

            prev_row = ordered_rows[current_index - 1] if current_index > 0 else None
            next_row = (
                ordered_rows[current_index + 1]
                if current_index + 1 < len(ordered_rows)
                else None
            )
            setattr(
                post,
                "series_context",
                {
                    "series_slug": mapping["series_slug"],
                    "series_title": mapping["series_title"],
                    "order_index": mapping["order_index"],
                    "total_posts": len(ordered_rows),
                    "prev_post_slug": None if prev_row is None else prev_row.slug,
                    "prev_post_title": None if prev_row is None else prev_row.title,
                    "next_post_slug": None if next_row is None else next_row.slug,
                    "next_post_title": None if next_row is None else next_row.title,
                },
            )
        return posts
