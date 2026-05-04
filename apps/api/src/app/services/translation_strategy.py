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
from app.services.translation_hash import compute_source_hash, compute_post_source_hash


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
        return compute_post_source_hash(
            title=source.title,
            excerpt=source.excerpt,
            body_markdown=source.body_markdown,
            project_profile=getattr(source, "project_profile", None),
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
        # Replicate project_profile when present (translating text fields for non-KO locales)
        self._sync_project_profile(db, source=source, sibling=sibling, target_locale=target_locale)
        return sibling

    def _sync_project_profile(
        self, db: Session, *, source: Post, sibling: Post, target_locale: PostLocale,
    ) -> None:
        source_profile = getattr(source, "project_profile", None)
        if source_profile is None:
            return
        # Import here to avoid circular deps; actual module is app.models.project_profile
        from app.models.project_profile import ProjectProfile
        target_profile = getattr(sibling, "project_profile", None)
        if target_profile is None:
            target_profile = ProjectProfile(post_id=sibling.id)
            db.add(target_profile)

        # Always copy non-translated metadata
        target_profile.card_image_url = source_profile.card_image_url

        if target_locale == PostLocale.KO:
            # Korean target — same content as source, no translation needed
            target_profile.period_label = source_profile.period_label
            target_profile.role_summary = source_profile.role_summary
            target_profile.project_intro = source_profile.project_intro
            target_profile.highlights_json = list(source_profile.highlights_json or [])
            target_profile.resource_links_json = list(source_profile.resource_links_json or [])
            return

        # Non-Korean target — translate the user-facing text fields via DeepL
        translated = self._translate_profile_fields(source_profile, target_locale)
        target_profile.period_label = translated["period_label"]
        target_profile.role_summary = translated["role_summary"]
        target_profile.project_intro = translated["project_intro"]
        target_profile.highlights_json = translated["highlights"]
        target_profile.resource_links_json = translated["resource_links"]

    def _translate_profile_fields(self, source_profile, target_locale: PostLocale) -> dict:
        """Batch-translate the profile text fields. Returns a dict matching the
        target_profile field shapes. Calls the translation provider once per
        scalar field and once per highlight / resource-link label.

        TODO (follow-up): batch into a single DeepL call using the list API to
        reduce round-trips from ~10 to 1 per project-locale pair.
        """
        from app.services.translation_worker import _get_provider, _LOCALE_BY_KEY

        # Reverse map PostLocale enum → "en" / "ja" / "zh"
        target_str = next((k for k, v in _LOCALE_BY_KEY.items() if v == target_locale), None)
        if target_str is None:
            # Should not happen — caller always passes a real target locale
            return {
                "period_label": source_profile.period_label,
                "role_summary": source_profile.role_summary,
                "project_intro": source_profile.project_intro,
                "highlights": list(source_profile.highlights_json or []),
                "resource_links": list(source_profile.resource_links_json or []),
            }

        provider = _get_provider()

        def _translate_one(text: str | None) -> str | None:
            """Translate a single string by packing it into the title slot of a
            virtual post object and unpacking the returned title."""
            if not text:
                return text
            view = type("_Single", (), {
                "title": text, "excerpt": None, "body_markdown": "",
            })()
            result = provider.translate_post(view, target_str)
            if result is None:
                # NoopProvider (no API key) — keep source verbatim
                return text
            return result.get("title") or text

        period_label = _translate_one(source_profile.period_label)
        role_summary = _translate_one(source_profile.role_summary)
        project_intro = _translate_one(source_profile.project_intro)

        highlights = [
            _translate_one(h) or ""
            for h in (source_profile.highlights_json or [])
        ]

        resource_links = [
            {**link, "label": _translate_one(link.get("label", "")) or ""}
            for link in (source_profile.resource_links_json or [])
        ]

        return {
            "period_label": period_label,
            "role_summary": role_summary,
            "project_intro": project_intro,
            "highlights": highlights,
            "resource_links": resource_links,
        }

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
