from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from app.services.series_translation_service import (
    SeriesTranslationService, SERIES_TARGET_LOCALES,
)


@dataclass
class _Series:
    id: Any
    locale: str
    source_series_id: Any | None = None
    title: str = "t"
    description: str = "d"


class _StubQueue:
    def __init__(self) -> None:
        self.calls: list[tuple[Any, str, str]] = []

    def enqueue_translation_job(self, *, source_post_id, target_locale, kind):
        self.calls.append((source_post_id, target_locale, kind))
        return ("enqueued", source_post_id, target_locale, kind)


def test_sync_source_series_enqueues_3_jobs() -> None:
    queue = _StubQueue()
    svc = SeriesTranslationService(queue=queue)
    s = _Series(id=uuid.uuid4(), locale="ko")
    result = svc.sync_source_series(s)
    assert len(result) == len(SERIES_TARGET_LOCALES)
    assert all(call[2] == "series" for call in queue.calls)
    assert [c[1] for c in queue.calls] == list(SERIES_TARGET_LOCALES)


def test_sync_skips_non_korean() -> None:
    queue = _StubQueue()
    svc = SeriesTranslationService(queue=queue)
    s = _Series(id=uuid.uuid4(), locale="en")
    assert svc.sync_source_series(s) == []


def test_sync_skips_translation_variants() -> None:
    queue = _StubQueue()
    svc = SeriesTranslationService(queue=queue)
    s = _Series(id=uuid.uuid4(), locale="ko", source_series_id=uuid.uuid4())
    assert svc.sync_source_series(s) == []


def test_sync_no_queue_is_noop() -> None:
    svc = SeriesTranslationService(queue=None)
    s = _Series(id=uuid.uuid4(), locale="ko")
    assert svc.sync_source_series(s) == []


def test_sync_handles_orm_str_enum_locale() -> None:
    """Same regression guard as the post side: PostLocale.KO must compare equal to 'ko'."""
    from app.models.post import PostLocale
    @dataclass
    class _OrmSeries:
        id: Any; locale: PostLocale; source_series_id: Any | None = None
    queue = _StubQueue()
    svc = SeriesTranslationService(queue=queue)
    s = _OrmSeries(id=uuid.uuid4(), locale=PostLocale.KO)
    assert len(svc.sync_source_series(s)) == 3
