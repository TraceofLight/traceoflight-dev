"""rq job function: translate one Korean source post into one target locale."""

from __future__ import annotations

import uuid
from contextlib import contextmanager
from typing import Any, Generator

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.post import (
    Post,
    PostLocale,
    PostTranslationSourceKind,
    PostTranslationStatus,
)
from app.services.post_translation_markdown import (
    mask_markdown_translation_segments,
    unmask_markdown_translation_segments,
)
from app.services.translation_hash import compute_source_hash
from app.services.translation_provider import (
    NoopTranslationProvider,
    TranslationProvider,
)


_LOCALE_BY_KEY = {
    "en": PostLocale.EN,
    "ja": PostLocale.JA,
    "zh": PostLocale.ZH,
}


@contextmanager
def _open_session() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _get_provider() -> TranslationProvider:
    """Return the configured provider. Lazily import the DeepL adapter so
    test contexts that don't need it don't pay the SDK import cost."""
    if not settings.deepl_api_key:
        return NoopTranslationProvider()
    from app.services.deepl_translation_provider import DeeplTranslationProvider

    return DeeplTranslationProvider(api_key=settings.deepl_api_key)


def translate_post_to_locale(source_post_id: str, target_locale: str) -> None:
    """rq job: ensure the (source_post, target_locale) sibling row is in
    sync with the source. If translation is needed, call the provider; if
    only metadata changed, skip the provider but still re-sync.

    On provider failure, mark the sibling row's translation_status='failed'
    and re-raise so rq can retain the failure for retry.
    """

    target_locale_enum = _LOCALE_BY_KEY.get(target_locale)
    if target_locale_enum is None:
        raise ValueError(f"unsupported target locale {target_locale!r}")

    with _open_session() as db:
        source = db.scalar(select(Post).where(Post.id == uuid.UUID(source_post_id)))
        if source is None:
            return  # source was deleted; nothing to do
        if source.locale != PostLocale.KO or source.source_post_id is not None:
            return  # not a Korean source row; ignore

        sibling = db.scalar(
            select(Post).where(
                Post.translation_group_id == source.translation_group_id,
                Post.locale == target_locale_enum,
            )
        )
        source_hash = compute_source_hash(
            title=source.title,
            excerpt=source.excerpt,
            body_markdown=source.body_markdown,
        )

        needs_translation = (
            sibling is None
            or sibling.translation_status == PostTranslationStatus.FAILED
            or sibling.translated_from_hash != source_hash
        )

        try:
            if needs_translation:
                translated = _translate(source, target_locale)
                if translated is None:
                    # Provider declined (e.g. NoopTranslationProvider). Don't
                    # leave a half-built sibling row behind.
                    return
            else:
                translated = None

            sibling = _upsert_sibling(
                db,
                source=source,
                sibling=sibling,
                target_locale_enum=target_locale_enum,
                translated_fields=translated,
                source_hash=source_hash,
            )
            db.commit()
        except Exception:
            db.rollback()
            _mark_failed(
                db,
                source=source,
                target_locale_enum=target_locale_enum,
                source_hash=source_hash,
            )
            db.commit()
            raise


def _translate(source: Post, target_locale: str) -> dict[str, Any] | None:
    masked_body = mask_markdown_translation_segments(source.body_markdown or "")

    class _MaskedView:
        title = source.title
        excerpt = source.excerpt
        body_markdown = masked_body.text

    provider = _get_provider()
    result = provider.translate_post(_MaskedView(), target_locale)
    if result is None:
        return None
    body = result.get("body_markdown", "") or ""
    if masked_body.replacements:
        body = unmask_markdown_translation_segments(body, masked_body.replacements)
    return {
        "title": result.get("title", "") or "",
        "excerpt": result.get("excerpt"),
        "body_markdown": body,
    }


def _upsert_sibling(
    db: Session,
    *,
    source: Post,
    sibling: Post | None,
    target_locale_enum: PostLocale,
    translated_fields: dict[str, Any] | None,
    source_hash: str,
) -> Post:
    if sibling is None:
        sibling = Post(
            slug=source.slug,
            locale=target_locale_enum,
            translation_group_id=source.translation_group_id,
            source_post_id=source.id,
            translation_source_kind=PostTranslationSourceKind.MACHINE,
        )
        db.add(sibling)

    # Always keep non-translated fields in sync with the source row.
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
        # Hash mismatch but no translation requested means the worker
        # decided to skip; record the source hash so subsequent runs don't
        # endlessly try to re-translate when the provider is Noop.
        sibling.translated_from_hash = source_hash
    return sibling


def _mark_failed(
    db: Session,
    *,
    source: Post,
    target_locale_enum: PostLocale,
    source_hash: str,
) -> None:
    """Idempotently mark the sibling row failed, creating a placeholder if
    the original transaction never committed it."""
    sibling = db.scalar(
        select(Post).where(
            Post.translation_group_id == source.translation_group_id,
            Post.locale == target_locale_enum,
        )
    )
    if sibling is None:
        sibling = Post(
            slug=source.slug,
            locale=target_locale_enum,
            translation_group_id=source.translation_group_id,
            source_post_id=source.id,
            title=source.title,
            excerpt=source.excerpt,
            body_markdown=source.body_markdown,
            cover_image_url=source.cover_image_url,
            top_media_kind=source.top_media_kind,
            top_media_image_url=source.top_media_image_url,
            top_media_youtube_url=source.top_media_youtube_url,
            top_media_video_url=source.top_media_video_url,
            series_title=source.series_title,
            content_kind=source.content_kind,
            status=source.status,
            visibility=source.visibility,
            published_at=source.published_at,
            translation_source_kind=PostTranslationSourceKind.MACHINE,
        )
        db.add(sibling)
    sibling.translation_status = PostTranslationStatus.FAILED
