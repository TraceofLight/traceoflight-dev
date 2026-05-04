from __future__ import annotations

from dataclasses import dataclass
import uuid

from app.services.series_service import SeriesService


@dataclass
class _SeriesStub:
    slug: str
    locale: str = "ko"
    source_series_id: uuid.UUID | None = None


class _DbStub:
    def commit(self) -> None:
        pass


class _RepoStub:
    def __init__(self) -> None:
        self.created = _SeriesStub(slug="s")
        self.updated = _SeriesStub(slug="s")
        self.db = _DbStub()

    def create(self, payload):  # type: ignore[no-untyped-def]
        return self.created

    def update_by_slug(self, current_slug: str, payload):  # type: ignore[no-untyped-def]
        del current_slug, payload
        return self.updated


class _TranslationStub:
    def __init__(self) -> None:
        self.calls: list[str] = []

    def sync_source_series(self, s):  # type: ignore[no-untyped-def]
        self.calls.append(s.slug)
        return []


def test_series_service_syncs_translations_on_create() -> None:
    repo = _RepoStub()
    tr = _TranslationStub()
    svc = SeriesService(repo=repo, translation_service=tr)
    svc.create_series(payload=object())
    assert tr.calls == ["s"]


def test_series_service_ignores_translation_failures() -> None:
    class _BoomTr:
        def sync_source_series(self, s):  # type: ignore[no-untyped-def]
            raise RuntimeError("boom")

    repo = _RepoStub()
    svc = SeriesService(repo=repo, translation_service=_BoomTr())
    created = svc.create_series(payload=object())
    # Translation failure must not break the source save
    assert created is repo.created


def test_series_service_skips_translation_for_non_korean() -> None:
    repo = _RepoStub()
    repo.created = _SeriesStub(slug="s2", locale="en")
    tr = _TranslationStub()
    svc = SeriesService(repo=repo, translation_service=tr)
    svc.create_series(payload=object())
    assert tr.calls == []
