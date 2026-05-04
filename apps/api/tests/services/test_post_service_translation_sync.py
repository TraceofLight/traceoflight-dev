from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import uuid

from app.services.post_service import PostService


@dataclass
class _PostStub:
    slug: str
    series_title: str | None
    published_at: datetime | None
    locale: str = "ko"
    source_post_id: uuid.UUID | None = None


class _DbStub:
    def commit(self) -> None:
        pass


class _RepoStub:
    def __init__(self) -> None:
        now = datetime.now(timezone.utc)
        self.current = _PostStub(slug="post-a", series_title="Series A", published_at=now)
        self.created = _PostStub(slug="post-a", series_title="Series A", published_at=now)
        self.updated = _PostStub(slug="post-a", series_title="Series A", published_at=now)
        self.db = _DbStub()

    def get_by_slug(self, slug: str, status=None, visibility=None, locale=None):  # type: ignore[no-untyped-def]
        del status, visibility, locale
        if slug != self.current.slug:
            return None
        return self.current

    def create(self, payload):  # type: ignore[no-untyped-def]
        del payload
        return self.created

    def update_by_slug(self, current_slug: str, payload):  # type: ignore[no-untyped-def]
        del payload
        if current_slug != self.current.slug:
            return None
        return self.updated


class _TranslationServiceStub:
    def __init__(self) -> None:
        self.calls: list[str] = []
        self.raise_on_sync = False

    def sync_source_post(self, post):  # type: ignore[no-untyped-def]
        self.calls.append(post.slug)
        if self.raise_on_sync:
            raise RuntimeError("translation failed")
        return []


def test_post_service_syncs_translations_for_source_post_create_and_update() -> None:
    repo = _RepoStub()
    translation_service = _TranslationServiceStub()
    service = PostService(repo=repo, translation_service=translation_service)

    service.create_post(payload=object())  # type: ignore[arg-type]
    service.update_post_by_slug(slug="post-a", payload=object())  # type: ignore[arg-type]

    assert translation_service.calls == ["post-a", "post-a"]


def test_post_service_ignores_translation_sync_failures() -> None:
    repo = _RepoStub()
    translation_service = _TranslationServiceStub()
    translation_service.raise_on_sync = True
    service = PostService(repo=repo, translation_service=translation_service)

    created = service.create_post(payload=object())  # type: ignore[arg-type]
    updated = service.update_post_by_slug(slug="post-a", payload=object())  # type: ignore[arg-type]

    assert created is repo.created
    assert updated is repo.updated


def test_post_service_skips_translation_sync_for_non_source_posts() -> None:
    repo = _RepoStub()
    repo.created = _PostStub(
        slug="post-a-en",
        series_title="Series A",
        published_at=datetime.now(timezone.utc),
        locale="en",
    )
    repo.updated = _PostStub(
        slug="post-a-ja",
        series_title="Series A",
        published_at=datetime.now(timezone.utc),
        locale="ko",
        source_post_id=uuid.uuid4(),
    )
    translation_service = _TranslationServiceStub()
    service = PostService(repo=repo, translation_service=translation_service)

    service.create_post(payload=object())  # type: ignore[arg-type]
    service.update_post_by_slug(slug="post-a", payload=object())  # type: ignore[arg-type]

    assert translation_service.calls == []
