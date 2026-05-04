from __future__ import annotations

import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models.post import (
    Post,
    PostContentKind,
    PostLocale,
    PostStatus,
    PostTranslationSourceKind,
    PostTranslationStatus,
    PostVisibility,
)
from app.services import translation_worker
from app.services.translation_hash import compute_source_hash


@pytest.fixture
def session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        yield db


def _korean_source(db: Session, *, slug: str = "hello", body: str = "안녕") -> Post:
    now = datetime.now(timezone.utc)
    post = Post(
        slug=slug,
        title="안녕하세요",
        excerpt="짧은 발췌",
        body_markdown=body,
        cover_image_url=None,
        content_kind=PostContentKind.BLOG,
        status=PostStatus.PUBLISHED,
        visibility=PostVisibility.PUBLIC,
        locale=PostLocale.KO,
        translation_group_id=uuid.uuid4(),
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
        published_at=now,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return post


class _StubProvider:
    def __init__(self, mapping: dict[str, dict[str, str | None]]) -> None:
        self._mapping = mapping
        self.calls: list[tuple[str, str]] = []

    def translate_post(self, post, target_locale):  # type: ignore[no-untyped-def]
        self.calls.append((post.body_markdown, target_locale))
        return self._mapping[target_locale]


def test_worker_creates_sibling_when_none_exists(session, monkeypatch) -> None:
    source = _korean_source(session)
    provider = _StubProvider(
        {"en": {"title": "Hello", "excerpt": "Lead", "body_markdown": "hi"}}
    )
    monkeypatch.setattr(translation_worker, "_open_session", lambda: contextmanager(lambda: (yield session))())
    monkeypatch.setattr(translation_worker, "_get_provider", lambda: provider)

    translation_worker.translate_post_to_locale(str(source.id), "en")

    siblings = session.scalars(
        select(Post).where(Post.translation_group_id == source.translation_group_id, Post.locale == PostLocale.EN)
    ).all()
    assert len(siblings) == 1
    sibling = siblings[0]
    assert sibling.title == "Hello"
    assert sibling.excerpt == "Lead"
    assert sibling.body_markdown == "hi"
    assert sibling.slug == source.slug
    assert sibling.translation_status == PostTranslationStatus.SYNCED
    assert sibling.translation_source_kind == PostTranslationSourceKind.MACHINE
    assert sibling.source_post_id == source.id
    assert sibling.translated_from_hash == compute_source_hash(
        title=source.title, excerpt=source.excerpt, body_markdown=source.body_markdown
    )
    assert provider.calls == [(source.body_markdown, "en")]


def test_worker_skips_translation_when_hash_matches(session, monkeypatch) -> None:
    source = _korean_source(session)
    sibling = Post(
        slug=source.slug,
        title="Hello",
        excerpt="Lead",
        body_markdown="hi",
        cover_image_url=source.cover_image_url,
        content_kind=PostContentKind.BLOG,
        status=PostStatus.PUBLISHED,
        visibility=PostVisibility.PUBLIC,
        locale=PostLocale.EN,
        translation_group_id=source.translation_group_id,
        source_post_id=source.id,
        translation_status=PostTranslationStatus.SYNCED,
        translation_source_kind=PostTranslationSourceKind.MACHINE,
        translated_from_hash=compute_source_hash(
            title=source.title,
            excerpt=source.excerpt,
            body_markdown=source.body_markdown,
        ),
        published_at=source.published_at,
    )
    session.add(sibling)
    session.commit()
    provider = _StubProvider({})
    monkeypatch.setattr(translation_worker, "_open_session", lambda: contextmanager(lambda: (yield session))())
    monkeypatch.setattr(translation_worker, "_get_provider", lambda: provider)

    translation_worker.translate_post_to_locale(str(source.id), "en")

    assert provider.calls == []


def test_worker_re_translates_when_source_body_changed(session, monkeypatch) -> None:
    source = _korean_source(session)
    sibling = Post(
        slug=source.slug,
        title="Hello-old",
        excerpt="Lead-old",
        body_markdown="hi-old",
        cover_image_url=source.cover_image_url,
        content_kind=PostContentKind.BLOG,
        status=PostStatus.PUBLISHED,
        visibility=PostVisibility.PUBLIC,
        locale=PostLocale.EN,
        translation_group_id=source.translation_group_id,
        source_post_id=source.id,
        translation_status=PostTranslationStatus.SYNCED,
        translation_source_kind=PostTranslationSourceKind.MACHINE,
        translated_from_hash="deadbeef" * 8,  # different from current source
        published_at=source.published_at,
    )
    session.add(sibling)
    session.commit()
    provider = _StubProvider(
        {"en": {"title": "Hello-new", "excerpt": "Lead-new", "body_markdown": "hi-new"}}
    )
    monkeypatch.setattr(translation_worker, "_open_session", lambda: contextmanager(lambda: (yield session))())
    monkeypatch.setattr(translation_worker, "_get_provider", lambda: provider)

    translation_worker.translate_post_to_locale(str(source.id), "en")

    session.refresh(sibling)
    assert sibling.title == "Hello-new"
    assert sibling.body_markdown == "hi-new"
    assert sibling.translated_from_hash == compute_source_hash(
        title=source.title, excerpt=source.excerpt, body_markdown=source.body_markdown
    )


def test_worker_marks_failed_status_when_provider_raises(session, monkeypatch) -> None:
    source = _korean_source(session)

    class _Boom:
        def translate_post(self, *_, **__):
            raise RuntimeError("DeepL transient failure")

    monkeypatch.setattr(translation_worker, "_open_session", lambda: contextmanager(lambda: (yield session))())
    monkeypatch.setattr(translation_worker, "_get_provider", lambda: _Boom())

    with pytest.raises(RuntimeError):
        translation_worker.translate_post_to_locale(str(source.id), "ja")

    siblings = session.scalars(
        select(Post).where(Post.translation_group_id == source.translation_group_id, Post.locale == PostLocale.JA)
    ).all()
    assert len(siblings) == 1
    assert siblings[0].translation_status == PostTranslationStatus.FAILED


def test_worker_copies_non_translated_fields_from_source(session, monkeypatch) -> None:
    source = _korean_source(session)
    source.cover_image_url = "https://example/cover.jpg"
    source.series_title = "MySeries"
    session.commit()
    provider = _StubProvider(
        {"ja": {"title": "T", "excerpt": "E", "body_markdown": "B"}}
    )
    monkeypatch.setattr(translation_worker, "_open_session", lambda: contextmanager(lambda: (yield session))())
    monkeypatch.setattr(translation_worker, "_get_provider", lambda: provider)

    translation_worker.translate_post_to_locale(str(source.id), "ja")

    sibling = session.scalars(
        select(Post).where(Post.translation_group_id == source.translation_group_id, Post.locale == PostLocale.JA)
    ).one()
    assert sibling.cover_image_url == "https://example/cover.jpg"
    assert sibling.series_title == "MySeries"
    assert sibling.published_at == source.published_at
    assert sibling.status == PostStatus.PUBLISHED
    assert sibling.visibility == PostVisibility.PUBLIC


def test_worker_no_ops_when_source_is_not_korean(session, monkeypatch) -> None:
    source = _korean_source(session)
    source.locale = PostLocale.EN
    session.commit()
    provider = _StubProvider({})
    monkeypatch.setattr(translation_worker, "_open_session", lambda: contextmanager(lambda: (yield session))())
    monkeypatch.setattr(translation_worker, "_get_provider", lambda: provider)

    translation_worker.translate_post_to_locale(str(source.id), "ja")

    assert provider.calls == []
    siblings = session.scalars(
        select(Post).where(Post.translation_group_id == source.translation_group_id, Post.locale == PostLocale.JA)
    ).all()
    assert siblings == []
