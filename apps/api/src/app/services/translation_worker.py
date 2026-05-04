"""rq job: translate one source record (post or series) into one target locale.
Strategy-driven so each kind owns load/hash/upsert details."""

from __future__ import annotations

import uuid
from contextlib import contextmanager
from typing import Any, Generator

from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.post import PostLocale, PostTranslationStatus
from app.services.post_translation_markdown import (
    mask_markdown_translation_segments, unmask_markdown_translation_segments,
)
from app.services.translation_provider import (
    NoopTranslationProvider, TranslationProvider,
)
from app.services.translation_strategy import (
    PostTranslationStrategy, TranslationStrategy,
)

_LOCALE_BY_KEY = {"en": PostLocale.EN, "ja": PostLocale.JA, "zh": PostLocale.ZH}


def _strategies() -> dict[str, TranslationStrategy]:
    # Lazy series strategy import — added in a later task
    strategies: dict[str, TranslationStrategy] = {"post": PostTranslationStrategy()}
    try:
        from app.services.translation_strategy import SeriesTranslationStrategy  # type: ignore[attr-defined]
        strategies["series"] = SeriesTranslationStrategy()
    except ImportError:
        pass
    return strategies


@contextmanager
def _open_session() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _get_provider() -> TranslationProvider:
    if not settings.deepl_api_key:
        return NoopTranslationProvider()
    from app.services.deepl_translation_provider import DeeplTranslationProvider
    return DeeplTranslationProvider(api_key=settings.deepl_api_key)


def translate_to_locale(kind: str, source_id: str, target_locale: str) -> None:
    target_locale_enum = _LOCALE_BY_KEY.get(target_locale)
    if target_locale_enum is None:
        raise ValueError(f"unsupported target locale {target_locale!r}")
    strategy = _strategies().get(kind)
    if strategy is None:
        raise ValueError(f"unknown translation kind {kind!r}")

    with _open_session() as db:
        source = strategy.load_source(db, uuid.UUID(source_id))
        if source is None or not strategy.is_translatable_source(source):
            return
        sibling = strategy.find_sibling(db, source, target_locale_enum)
        source_hash = strategy.compute_source_hash(source)

        needs_translation = (
            sibling is None
            or sibling.translation_status == PostTranslationStatus.FAILED
            or sibling.translated_from_hash != source_hash
        )

        try:
            translated = _translate(strategy, source, target_locale) if needs_translation else None
            if needs_translation and translated is None:
                return
            strategy.upsert_sibling(
                db, source=source, sibling=sibling,
                target_locale=target_locale_enum,
                translated_fields=translated, source_hash=source_hash,
            )
            db.commit()
        except Exception:
            db.rollback()
            strategy.mark_failed(
                db, source=source, target_locale=target_locale_enum, source_hash=source_hash,
            )
            db.commit()
            raise


def _translate(
    strategy: TranslationStrategy, source: Any, target_locale: str,
) -> dict[str, Any] | None:
    fields = strategy.get_translatable_fields(source)
    body_text = fields.get("body_markdown") or ""
    masked = mask_markdown_translation_segments(body_text)

    class _MaskedView:
        title = fields.get("title")
        excerpt = fields.get("excerpt")
        body_markdown = masked.text

    provider = _get_provider()
    result = provider.translate_post(_MaskedView(), target_locale)
    if result is None:
        return None
    body = result.get("body_markdown", "") or ""
    if masked.replacements:
        body = unmask_markdown_translation_segments(body, masked.replacements)
    return {
        "title": result.get("title", "") or "",
        "excerpt": result.get("excerpt"),
        "body_markdown": body,
    }


# Backwards-compat alias for callers / rq jobs already in flight
def translate_post_to_locale(source_post_id: str, target_locale: str) -> None:
    translate_to_locale("post", source_post_id, target_locale)
