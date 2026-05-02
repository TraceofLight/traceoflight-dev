from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.post import Post, PostStatus, PostVisibility
from app.models.series import Series, SeriesPost
from app.schemas.series import SeriesUpsert


class SeriesConflictError(ValueError):
    """Raised when a post is already assigned to another series."""


class SeriesValidationError(ValueError):
    """Raised for invalid series payloads."""


def _normalize_post_slugs(raw_values: Iterable[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for raw in raw_values:
        slug = raw.strip().lower()
        if not slug or slug in seen:
            continue
        seen.add(slug)
        normalized.append(slug)
    return normalized


def _normalize_series_slugs(raw_values: Iterable[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for raw in raw_values:
        slug = raw.strip()
        if not slug or slug in seen:
            continue
        seen.add(slug)
        normalized.append(slug)
    return normalized


class SeriesRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _is_public_post(self, post: Post) -> bool:
        return post.status == PostStatus.PUBLISHED and post.visibility == PostVisibility.PUBLIC

    def _filtered_series_posts(self, series: Series, include_private: bool) -> list[SeriesPost]:
        ordered = sorted(series.series_posts, key=lambda item: item.order_index)
        if include_private:
            return [item for item in ordered if item.post is not None]
        return [
            item
            for item in ordered
            if item.post is not None and self._is_public_post(item.post)
        ]

    def _serialize_series_post(self, mapping: SeriesPost) -> dict[str, object]:
        post = mapping.post
        if post is None:
            raise SeriesValidationError("series mapping contains missing post")
        return {
            "slug": post.slug,
            "title": post.title,
            "excerpt": post.excerpt,
            "cover_image_url": post.cover_image_url,
            "order_index": mapping.order_index,
            "published_at": post.published_at,
            "visibility": post.visibility,
        }

    def _serialize_series(
        self,
        series: Series,
        include_private: bool,
        include_posts: bool,
    ) -> dict[str, object]:
        scoped_posts = self._filtered_series_posts(series, include_private)
        payload: dict[str, object] = {
            "id": series.id,
            "slug": series.slug,
            "title": series.title,
            "description": series.description,
            "cover_image_url": series.cover_image_url,
            "post_count": len(scoped_posts),
            "created_at": series.created_at,
            "updated_at": series.updated_at,
        }
        if include_posts:
            payload["posts"] = [self._serialize_series_post(item) for item in scoped_posts]
        return payload

    def list(
        self,
        include_private: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, object]]:
        stmt = (
            select(Series)
            .options(selectinload(Series.series_posts).selectinload(SeriesPost.post))
            .order_by(Series.list_order_index.asc().nulls_last(), Series.updated_at.desc())
            .limit(limit)
            .offset(offset)
        )
        rows = list(self.db.scalars(stmt))
        serialized: list[dict[str, object]] = []
        for row in rows:
            item = self._serialize_series(row, include_private=include_private, include_posts=False)
            if item["post_count"] == 0:
                continue
            serialized.append(item)
        return serialized

    def get_by_slug(self, slug: str, include_private: bool = False) -> dict[str, object] | None:
        stmt = (
            select(Series)
            .options(selectinload(Series.series_posts).selectinload(SeriesPost.post))
            .where(Series.slug == slug)
        )
        row = self.db.scalar(stmt)
        if row is None:
            return None

        serialized = self._serialize_series(row, include_private=include_private, include_posts=True)
        if serialized["post_count"] == 0:
            return None
        return serialized

    def create(self, payload: SeriesUpsert) -> dict[str, object]:
        series = Series(**payload.model_dump())
        self.db.add(series)
        # Transaction commit is owned by the calling service layer.
        self.db.flush()
        created = self.get_by_slug(series.slug, include_private=True)
        if created is None:
            raise SeriesValidationError("series creation failed")
        return created

    def update_by_slug(self, current_slug: str, payload: SeriesUpsert) -> dict[str, object] | None:
        row = self.db.scalar(select(Series).where(Series.slug == current_slug))
        if row is None:
            return None

        for field, value in payload.model_dump().items():
            setattr(row, field, value)
        # Transaction commit is owned by the calling service layer.
        self.db.flush()

        updated = self.get_by_slug(row.slug, include_private=True)
        if updated is None:
            raise SeriesValidationError("series update failed")
        return updated

    def delete_by_slug(self, slug: str) -> bool:
        row = self.db.scalar(select(Series).where(Series.slug == slug))
        if row is None:
            return False

        self.db.delete(row)
        # Transaction commit is owned by the calling service layer.
        self.db.flush()
        return True

    def replace_posts_by_slug(self, slug: str, raw_post_slugs: list[str]) -> dict[str, object] | None:
        stmt = (
            select(Series)
            .options(selectinload(Series.series_posts).selectinload(SeriesPost.post))
            .where(Series.slug == slug)
        )
        row = self.db.scalar(stmt)
        if row is None:
            return None

        post_slugs = _normalize_post_slugs(raw_post_slugs)
        if not post_slugs:
            row.series_posts.clear()
            self.db.flush()
            return self.get_by_slug(slug, include_private=True)

        posts = list(self.db.scalars(select(Post).where(Post.slug.in_(post_slugs))))
        by_slug = {post.slug: post for post in posts}
        missing = [post_slug for post_slug in post_slugs if post_slug not in by_slug]
        if missing:
            raise SeriesValidationError(f"unknown post slugs: {', '.join(missing)}")

        selected_post_ids = [by_slug[post_slug].id for post_slug in post_slugs]
        conflict_stmt = select(SeriesPost.post_id).where(
            SeriesPost.post_id.in_(selected_post_ids),
            SeriesPost.series_id != row.id,
        )
        conflicts = list(self.db.scalars(conflict_stmt))
        if conflicts:
            raise SeriesConflictError("one or more posts already belong to another series")

        row.series_posts.clear()
        self.db.flush()
        for index, post_slug in enumerate(post_slugs):
            row.series_posts.append(
                SeriesPost(
                    post_id=by_slug[post_slug].id,
                    order_index=index + 1,
                )
            )

        # Transaction commit is owned by the calling service layer.
        self.db.flush()
        replaced = self.get_by_slug(slug, include_private=True)
        if replaced is None:
            raise SeriesValidationError("series post replacement failed")
        return replaced

    def replace_series_order(self, raw_series_slugs: list[str]) -> list[dict[str, object]]:
        series_slugs = _normalize_series_slugs(raw_series_slugs)
        if not series_slugs:
            return []

        rows = list(self.db.scalars(select(Series).where(Series.slug.in_(series_slugs))))
        by_slug = {row.slug: row for row in rows}
        missing = [slug for slug in series_slugs if slug not in by_slug]
        if missing:
            raise SeriesValidationError(f"unknown series slugs: {', '.join(missing)}")

        for index, slug in enumerate(series_slugs, start=1):
            by_slug[slug].list_order_index = index

        # Transaction commit is owned by the calling service layer.
        self.db.flush()
        return self.list(include_private=True, limit=max(len(series_slugs), 1), offset=0)
