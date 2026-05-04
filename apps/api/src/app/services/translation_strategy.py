"""Strategy interface for translating different kinds of records (post, series).
The translation worker invokes a strategy to load, hash, translate, and upsert
sibling rows for any translatable record, keeping a single shared mask → DeepL
→ unmask → upsert pipeline."""

from __future__ import annotations

import uuid
from typing import Any, Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.post import (
    Post, PostLocale, PostTranslationSourceKind, PostTranslationStatus,
)
from app.models.series import Series
from app.services.translation_hash import compute_source_hash


class TranslationStrategy(Protocol):
    kind: str

    def load_source(self, db: Session, source_id: uuid.UUID) -> Any | None: ...
    def is_translatable_source(self, source: Any) -> bool: ...
    def find_sibling(self, db: Session, source: Any, target_locale: PostLocale) -> Any | None: ...
    def compute_source_hash(self, source: Any) -> str: ...
    def get_translatable_fields(self, source: Any) -> dict[str, str | None]: ...
    def upsert_sibling(
        self, db: Session, *, source: Any, sibling: Any, target_locale: Any,
        translated_fields: dict[str, Any] | None, source_hash: str,
    ) -> Any: ...
    def mark_failed(self, db: Session, *, source: Any, target_locale: Any, source_hash: str) -> None: ...


class PostTranslationStrategy:
    kind = "post"

    def load_source(self, db: Session, source_id: uuid.UUID) -> Post | None:
        return db.scalar(select(Post).where(Post.id == source_id))

    def is_translatable_source(self, source: Any) -> bool:
        if source is None:
            return False
        if source.locale != PostLocale.KO:
            return False
        if source.source_post_id is not None:
            return False
        return True

    def find_sibling(self, db: Session, source: Post, target_locale: PostLocale) -> Post | None:
        return db.scalar(
            select(Post).where(
                Post.translation_group_id == source.translation_group_id,
                Post.locale == target_locale,
            )
        )

    def compute_source_hash(self, source: Post) -> str:
        return compute_source_hash(
            title=source.title, excerpt=source.excerpt, body_markdown=source.body_markdown,
        )

    def get_translatable_fields(self, source: Post) -> dict[str, str | None]:
        return {
            "title": source.title,
            "excerpt": source.excerpt,
            "body_markdown": source.body_markdown,
        }

    def upsert_sibling(
        self, db: Session, *, source: Post, sibling: Post | None,
        target_locale: PostLocale, translated_fields: dict[str, Any] | None,
        source_hash: str,
    ) -> Post:
        if sibling is None:
            sibling = Post(
                slug=source.slug, locale=target_locale,
                translation_group_id=source.translation_group_id,
                source_post_id=source.id,
                translation_source_kind=PostTranslationSourceKind.MACHINE,
            )
            db.add(sibling)
        # Always sync non-translated fields from source
        sibling.cover_image_url = source.cover_image_url
        sibling.top_media_kind = source.top_media_kind
        sibling.top_media_image_url = source.top_media_image_url
        sibling.top_media_youtube_url = source.top_media_youtube_url
        sibling.top_media_video_url = source.top_media_video_url
        sibling.series_title = source.series_title
        sibling.content_kind = source.content_kind
        sibling.status = source.status
        sibling.visibility = source.visibility
        sibling.published_at = source.published_at
        if translated_fields is not None:
            sibling.title = translated_fields["title"]
            sibling.excerpt = translated_fields["excerpt"]
            sibling.body_markdown = translated_fields["body_markdown"]
            sibling.translated_from_hash = source_hash
            sibling.translation_status = PostTranslationStatus.SYNCED
        elif sibling.translated_from_hash != source_hash:
            sibling.translated_from_hash = source_hash
        # Replicate project_profile when present
        self._sync_project_profile(db, source=source, sibling=sibling)
        return sibling

    def _sync_project_profile(self, db: Session, *, source: Post, sibling: Post) -> None:
        source_profile = getattr(source, "project_profile", None)
        if source_profile is None:
            return
        # Import here to avoid circular deps; actual module is app.models.project_profile
        from app.models.project_profile import ProjectProfile
        target_profile = getattr(sibling, "project_profile", None)
        if target_profile is None:
            target_profile = ProjectProfile(post_id=sibling.id)
            db.add(target_profile)
        for field in (
            "period_label", "role_summary", "project_intro", "card_image_url",
            "highlights_json", "resource_links_json",
        ):
            if hasattr(source_profile, field):
                setattr(target_profile, field, getattr(source_profile, field))

    def mark_failed(self, db: Session, *, source: Post, target_locale: PostLocale, source_hash: str) -> None:
        sibling = self.find_sibling(db, source, target_locale)
        if sibling is None:
            sibling = Post(
                slug=source.slug, locale=target_locale,
                translation_group_id=source.translation_group_id,
                source_post_id=source.id,
                title=source.title, excerpt=source.excerpt,
                body_markdown=source.body_markdown,
                cover_image_url=source.cover_image_url,
                top_media_kind=source.top_media_kind,
                top_media_image_url=source.top_media_image_url,
                top_media_youtube_url=source.top_media_youtube_url,
                top_media_video_url=source.top_media_video_url,
                series_title=source.series_title,
                content_kind=source.content_kind,
                status=source.status, visibility=source.visibility,
                published_at=source.published_at,
                translation_source_kind=PostTranslationSourceKind.MACHINE,
            )
            db.add(sibling)
        sibling.translation_status = PostTranslationStatus.FAILED


class SeriesTranslationStrategy:
    """Translate series rows. Maps:
      title       <-> title
      description <-> body_markdown (the worker's mask/unmask treats this as body)
      (no excerpt — series have no excerpt field)
    Non-translated metadata (cover_image_url, list_order_index, etc.) is synced to the
    sibling on every run."""

    kind = "series"

    def load_source(self, db: Session, source_id: uuid.UUID) -> Series | None:
        return db.scalar(select(Series).where(Series.id == source_id))

    def is_translatable_source(self, source: Any) -> bool:
        if source is None:
            return False
        if source.locale != PostLocale.KO:
            return False
        if source.source_series_id is not None:
            return False
        return True

    def find_sibling(self, db: Session, source: Series, target_locale: PostLocale) -> Series | None:
        return db.scalar(
            select(Series).where(
                Series.translation_group_id == source.translation_group_id,
                Series.locale == target_locale,
            )
        )

    def compute_source_hash(self, source: Series) -> str:
        return compute_source_hash(
            title=source.title, excerpt=None, body_markdown=source.description or "",
        )

    def get_translatable_fields(self, source: Series) -> dict[str, str | None]:
        return {
            "title": source.title,
            "excerpt": None,
            "body_markdown": source.description or "",
        }

    def upsert_sibling(
        self, db: Session, *, source: Series, sibling: Series | None,
        target_locale: PostLocale, translated_fields: dict[str, Any] | None,
        source_hash: str,
    ) -> Series:
        if sibling is None:
            sibling = Series(
                slug=source.slug, locale=target_locale,
                translation_group_id=source.translation_group_id,
                source_series_id=source.id,
                translation_source_kind=PostTranslationSourceKind.MACHINE,
                # description is NOT NULL; seed with source until translated
                description=source.description,
                title=source.title,
            )
            db.add(sibling)
        # Always sync non-translated metadata from source
        sibling.cover_image_url = source.cover_image_url
        if source.list_order_index is not None:
            sibling.list_order_index = source.list_order_index

        if translated_fields is not None:
            sibling.title = translated_fields["title"]
            # description maps from body_markdown
            sibling.description = translated_fields["body_markdown"]
            sibling.translated_from_hash = source_hash
            sibling.translation_status = PostTranslationStatus.SYNCED
        elif sibling.translated_from_hash != source_hash:
            sibling.translated_from_hash = source_hash
        return sibling

    def mark_failed(self, db: Session, *, source: Series, target_locale: PostLocale, source_hash: str) -> None:
        sibling = self.find_sibling(db, source, target_locale)
        if sibling is None:
            sibling = Series(
                slug=source.slug, locale=target_locale,
                translation_group_id=source.translation_group_id,
                source_series_id=source.id,
                title=source.title, description=source.description,
                cover_image_url=source.cover_image_url,
                translation_source_kind=PostTranslationSourceKind.MACHINE,
            )
            db.add(sibling)
        sibling.translation_status = PostTranslationStatus.FAILED
