from __future__ import annotations

from app.core.text import normalize_optional_text
from app.models.post import PostContentKind, PostLocale, PostStatus, PostVisibility
from app.repositories.post_repository import PostRepository
from app.schemas.post import PostCreate
from app.services.post_translation_service import PostTranslationService
from app.services.series_projection_cache import request_series_projection_refresh


class PostService:
    def __init__(
        self,
        repo: PostRepository,
        translation_service: PostTranslationService | None = None,
    ) -> None:
        self.repo = repo
        self.translation_service = translation_service

    def _sync_translations(self, post) -> None:  # type: ignore[no-untyped-def]
        if self.translation_service is None:
            return
        locale = str(getattr(post, "locale", "") or "").strip().lower()
        source_post_id = getattr(post, "source_post_id", None)
        if locale != "ko" or source_post_id is not None:
            return
        try:
            self.translation_service.sync_source_post(post)
        except Exception:  # noqa: BLE001 — translation failures must not block source save
            return

    def list_posts(
        self,
        limit: int = 20,
        offset: int = 0,
        status: PostStatus | None = None,
        visibility: PostVisibility | None = None,
        content_kind: PostContentKind | None = None,
        tags: list[str] | None = None,
        tag_match: str = "any",
        locale: PostLocale | None = None,
    ):
        return self.repo.list(
            limit=limit,
            offset=offset,
            status=status,
            visibility=visibility,
            content_kind=content_kind,
            tags=tags,
            tag_match=tag_match,
            locale=locale,
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
        locale: PostLocale | None = None,
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
            locale=locale,
        )

    def get_post_by_slug(
        self,
        slug: str,
        status: PostStatus | None = None,
        visibility: PostVisibility | None = None,
        content_kind: PostContentKind | None = None,
        locale: PostLocale | None = None,
    ):
        return self.repo.get_by_slug(
            slug=slug,
            status=status,
            visibility=visibility,
            content_kind=content_kind,
            locale=locale,
        )

    def create_post(self, payload: PostCreate):
        created = self.repo.create(payload)
        self.repo.db.commit()
        self._sync_translations(created)
        if normalize_optional_text(getattr(created, "series_title", None)) is not None:
            request_series_projection_refresh("post-created-series-assigned")
        return created

    def update_post_by_slug(self, slug: str, payload: PostCreate):
        before = self.repo.get_by_slug(slug=slug)
        if before is None:
            return None

        before_series = normalize_optional_text(getattr(before, "series_title", None))
        before_published_at = getattr(before, "published_at", None)

        updated = self.repo.update_by_slug(current_slug=slug, payload=payload)
        if updated is None:
            return None
        self.repo.db.commit()
        self._sync_translations(updated)

        after_series = normalize_optional_text(getattr(updated, "series_title", None))
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
            normalize_optional_text(getattr(existing, "series_title", None))
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
