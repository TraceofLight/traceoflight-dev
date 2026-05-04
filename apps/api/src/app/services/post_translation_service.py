"""Coordinator: when a Korean source post is created/updated, enqueue one
translation job per target locale onto the translation queue. The worker
owns the actual translation."""

from __future__ import annotations

from typing import Any

TARGET_TRANSLATION_LOCALES = ("en", "ja", "zh")


class PostTranslationService:
    def __init__(self, queue: Any | None = None) -> None:
        self.queue = queue

    def sync_source_post(self, post) -> list[Any]:  # type: ignore[no-untyped-def]
        if self.queue is None:
            return []
        locale_obj = getattr(post, "locale", None)
        # PostLocale is (str, enum.Enum); on Python 3.12 str(enum_member)
        # returns "PostLocale.KO" rather than "ko". Use .value when present
        # so this works for both ORM rows and string-keyed fixtures.
        locale_raw = getattr(locale_obj, "value", locale_obj)
        locale = str(locale_raw or "").strip().lower()
        source_post_id = getattr(post, "source_post_id", None)
        if locale != "ko" or source_post_id is not None:
            return []

        jobs: list[Any] = []
        for target_locale in TARGET_TRANSLATION_LOCALES:
            jobs.append(
                self.queue.enqueue_translation_job(
                    source_post_id=getattr(post, "id"),
                    target_locale=target_locale,
                )
            )
        return jobs
