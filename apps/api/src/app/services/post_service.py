from __future__ import annotations

from app.models.post import PostContentKind, PostStatus, PostVisibility
from app.repositories.post_repository import PostRepository
from app.schemas.post import PostCreate
from app.services.series_projection_cache import request_series_projection_refresh


def _normalized_series_title(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


class PostService:
    def __init__(self, repo: PostRepository) -> None:
        self.repo = repo

    def list_posts(
        self,
        limit: int = 20,
        offset: int = 0,
        status: PostStatus | None = None,
        visibility: PostVisibility | None = None,
        content_kind: PostContentKind | None = None,
        tags: list[str] | None = None,
        tag_match: str = "any",
    ):
        return self.repo.list(
            limit=limit,
            offset=offset,
            status=status,
            visibility=visibility,
            content_kind=content_kind,
            tags=tags,
            tag_match=tag_match,
        )

    def list_post_summaries(
        self,
        limit: int = 20,
        offset: int = 0,
        status: PostStatus | None = None,
        visibility: PostVisibility | None = None,
        tags: list[str] | None = None,
        tag_match: str = "any",
        query: str | None = None,
        content_kind: PostContentKind | None = None,
        sort: str = "latest",
        include_tag_filters: bool = True,
        include_private_visibility_counts: bool = False,
    ):
        return self.repo.list_summaries(
            limit=limit,
            offset=offset,
            status=status,
            visibility=visibility,
            tags=tags,
            tag_match=tag_match,
            query=query,
            content_kind=content_kind,
            sort=sort,
            include_tag_filters=include_tag_filters,
            include_private_visibility_counts=include_private_visibility_counts,
        )

    def get_post_by_slug(
        self,
        slug: str,
        status: PostStatus | None = None,
        visibility: PostVisibility | None = None,
        content_kind: PostContentKind | None = None,
    ):
        return self.repo.get_by_slug(
            slug=slug,
            status=status,
            visibility=visibility,
            content_kind=content_kind,
        )

    def create_post(self, payload: PostCreate):
        created = self.repo.create(payload)
        self.repo.db.commit()
        if _normalized_series_title(getattr(created, "series_title", None)) is not None:
            request_series_projection_refresh("post-created-series-assigned")
        return created

    def update_post_by_slug(self, slug: str, payload: PostCreate):
        before = self.repo.get_by_slug(slug=slug)
        if before is None:
            return None

        before_series = _normalized_series_title(getattr(before, "series_title", None))
        before_published_at = getattr(before, "published_at", None)

        updated = self.repo.update_by_slug(current_slug=slug, payload=payload)
        if updated is None:
            return None
        self.repo.db.commit()

        after_series = _normalized_series_title(getattr(updated, "series_title", None))
        after_published_at = getattr(updated, "published_at", None)

        should_refresh = before_series != after_series
        if not should_refresh and before_series is not None:
            should_refresh = before_published_at != after_published_at

        if should_refresh:
            request_series_projection_refresh("post-updated-series-changed")

        return updated

    def delete_post_by_slug(
        self,
        slug: str,
        status: PostStatus | None = None,
        visibility: PostVisibility | None = None,
    ) -> bool:
        existing = self.repo.get_by_slug(slug=slug, status=status, visibility=visibility)
        had_series = (
            _normalized_series_title(getattr(existing, "series_title", None))
            if existing is not None
            else None
        )
        deleted = self.repo.delete_by_slug(slug=slug, status=status, visibility=visibility)
        if deleted:
            self.repo.db.commit()
        if deleted and had_series is not None:
            request_series_projection_refresh("post-deleted-series-assigned")
        return deleted

    def clear_all_posts(self) -> int:
        deleted = self.repo.clear_all()
        self.repo.db.commit()
        request_series_projection_refresh("posts-cleared")
        return deleted
