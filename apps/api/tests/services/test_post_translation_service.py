from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from app.services.post_translation_service import (
    PostTranslationService,
    TARGET_TRANSLATION_LOCALES,
)


@dataclass
class _Post:
    id: Any
    locale: str
    source_post_id: Any | None = None
    title: str = "t"
    excerpt: str | None = None
    body_markdown: str = "b"


class _StubQueue:
    def __init__(self) -> None:
        self.calls: list[tuple[Any, str]] = []

    def enqueue_translation_job(self, *, source_post_id, target_locale):
        self.calls.append((source_post_id, target_locale))
        return ("enqueued", source_post_id, target_locale)


def test_sync_source_post_enqueues_one_job_per_target_locale() -> None:
    queue = _StubQueue()
    svc = PostTranslationService(queue=queue)
    post = _Post(id=uuid.uuid4(), locale="ko")

    result = svc.sync_source_post(post)

    assert len(result) == len(TARGET_TRANSLATION_LOCALES)
    assert [target for (_id, target) in queue.calls] == list(TARGET_TRANSLATION_LOCALES)
    for source_id, _target in queue.calls:
        assert source_id == post.id


def test_sync_source_post_skips_non_korean_locale() -> None:
    queue = _StubQueue()
    svc = PostTranslationService(queue=queue)
    post = _Post(id=uuid.uuid4(), locale="en")

    result = svc.sync_source_post(post)

    assert result == []
    assert queue.calls == []


def test_sync_source_post_skips_translated_variants() -> None:
    queue = _StubQueue()
    svc = PostTranslationService(queue=queue)
    post = _Post(id=uuid.uuid4(), locale="ko", source_post_id=uuid.uuid4())

    result = svc.sync_source_post(post)

    assert result == []
    assert queue.calls == []


def test_sync_source_post_with_no_queue_is_noop() -> None:
    svc = PostTranslationService(queue=None)
    post = _Post(id=uuid.uuid4(), locale="ko")
    result = svc.sync_source_post(post)
    assert result == []


def test_sync_source_post_handles_str_enum_locale() -> None:
    """Regression: ORM rows expose post.locale as a PostLocale enum, and
    on Python 3.12 str(PostLocale.KO) returns "PostLocale.KO" — not "ko".
    The service must read .value to compare correctly. Without this fix,
    every real ORM-driven save would silently skip enqueueing translation
    jobs (caught during live end-to-end verification, not unit tests)."""
    from app.models.post import PostLocale

    @dataclass
    class _OrmPost:
        id: Any
        locale: PostLocale
        source_post_id: Any | None = None

    queue = _StubQueue()
    svc = PostTranslationService(queue=queue)
    post = _OrmPost(id=uuid.uuid4(), locale=PostLocale.KO)

    result = svc.sync_source_post(post)

    assert len(result) == len(TARGET_TRANSLATION_LOCALES)
    assert [target for (_id, target) in queue.calls] == list(TARGET_TRANSLATION_LOCALES)
