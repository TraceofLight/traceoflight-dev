"""Coordinator: when a Korean source series is created/updated, enqueue one
translation job per target locale onto the translation queue."""

from __future__ import annotations

from typing import Any

SERIES_TARGET_LOCALES = ("en", "ja", "zh")


class SeriesTranslationService:
    def __init__(self, queue: Any | None = None) -> None:
        self.queue = queue

    def sync_source_series(self, series) -> list[Any]:  # type: ignore[no-untyped-def]
        if self.queue is None:
            return []
        locale_obj = getattr(series, "locale", None)
        locale_raw = getattr(locale_obj, "value", locale_obj)
        locale = str(locale_raw or "").strip().lower()
        source_series_id = getattr(series, "source_series_id", None)
        if locale != "ko" or source_series_id is not None:
            return []
        jobs: list[Any] = []
        for target_locale in SERIES_TARGET_LOCALES:
            jobs.append(
                self.queue.enqueue_translation_job(
                    source_post_id=getattr(series, "id"),
                    target_locale=target_locale,
                    kind="series",
                )
            )
        return jobs
