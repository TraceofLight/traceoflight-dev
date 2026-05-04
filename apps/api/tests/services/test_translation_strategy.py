from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models.post import (
    Post, PostContentKind, PostLocale, PostStatus, PostTranslationSourceKind,
    PostTranslationStatus, PostVisibility,
)
from app.services.translation_hash import compute_source_hash
from app.models.series import Series
from app.services.translation_strategy import PostTranslationStrategy, SeriesTranslationStrategy


@pytest.fixture
def session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        yield db


def _korean_post(db: Session, slug: str = "p", body: str = "안녕") -> Post:
    p = Post(
        slug=slug, title="제목", excerpt="짧음", body_markdown=body,
        cover_image_url=None, content_kind=PostContentKind.BLOG,
        status=PostStatus.PUBLISHED, visibility=PostVisibility.PUBLIC,
        locale=PostLocale.KO, translation_group_id=uuid.uuid4(),
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
        published_at=datetime.now(timezone.utc),
    )
    db.add(p); db.commit(); db.refresh(p); return p


def test_post_strategy_load_source_returns_post(session) -> None:
    p = _korean_post(session)
    strategy = PostTranslationStrategy()
    loaded = strategy.load_source(session, p.id)
    assert loaded is not None and loaded.id == p.id


def test_post_strategy_is_translatable_for_korean_source(session) -> None:
    p = _korean_post(session)
    strategy = PostTranslationStrategy()
    assert strategy.is_translatable_source(p) is True


def test_post_strategy_skips_non_korean(session) -> None:
    p = _korean_post(session); p.locale = PostLocale.EN; session.commit()
    strategy = PostTranslationStrategy()
    assert strategy.is_translatable_source(p) is False


def test_post_strategy_compute_hash_matches_helper(session) -> None:
    p = _korean_post(session)
    strategy = PostTranslationStrategy()
    expected = compute_source_hash(title=p.title, excerpt=p.excerpt, body_markdown=p.body_markdown)
    assert strategy.compute_source_hash(p) == expected


def test_post_strategy_upsert_creates_sibling_with_translation(session) -> None:
    p = _korean_post(session)
    strategy = PostTranslationStrategy()
    sibling = strategy.upsert_sibling(
        session, source=p, sibling=None, target_locale=PostLocale.EN,
        translated_fields={"title": "T", "excerpt": "E", "body_markdown": "B"},
        source_hash="abc",
    )
    assert sibling.title == "T" and sibling.locale == PostLocale.EN
    assert sibling.translation_status == PostTranslationStatus.SYNCED
    assert sibling.translation_source_kind == PostTranslationSourceKind.MACHINE


def test_post_strategy_upsert_replicates_project_profile(session) -> None:
    """When the source has a project_profile, the sibling must mirror it."""
    from app.models.project_profile import ProjectProfile
    p = _korean_post(session)
    p.content_kind = PostContentKind.PROJECT
    profile = ProjectProfile(
        post_id=p.id, period_label="2026.05", role_summary="dev",
        project_intro="intro", card_image_url="x", highlights_json=[],
        resource_links_json=[],
    )
    session.add(profile); session.commit()
    strategy = PostTranslationStrategy()
    sibling = strategy.upsert_sibling(
        session, source=p, sibling=None, target_locale=PostLocale.EN,
        translated_fields={"title": "T", "excerpt": None, "body_markdown": "B"},
        source_hash="abc",
    )
    session.commit()
    assert sibling.project_profile is not None
    assert sibling.project_profile.period_label == "2026.05"
    assert sibling.project_profile.role_summary == "dev"


# ---------------------------------------------------------------------------
# SeriesTranslationStrategy tests
# ---------------------------------------------------------------------------


def _korean_series(db: Session, slug: str = "s") -> Series:
    s = Series(
        slug=slug, title="시리즈", description="설명",
        cover_image_url=None,
        locale=PostLocale.KO, translation_group_id=uuid.uuid4(),
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
    )
    db.add(s); db.commit(); db.refresh(s); return s


def test_series_strategy_load_source(session) -> None:
    s = _korean_series(session)
    strategy = SeriesTranslationStrategy()
    loaded = strategy.load_source(session, s.id)
    assert loaded is not None and loaded.id == s.id


def test_series_strategy_skips_non_korean(session) -> None:
    s = _korean_series(session); s.locale = PostLocale.EN; session.commit()
    strategy = SeriesTranslationStrategy()
    assert strategy.is_translatable_source(s) is False


def test_series_strategy_translatable_fields_includes_title_and_description(session) -> None:
    s = _korean_series(session)
    strategy = SeriesTranslationStrategy()
    fields = strategy.get_translatable_fields(s)
    assert fields == {"title": "시리즈", "excerpt": None, "body_markdown": "설명"}


def test_series_strategy_upsert_creates_sibling(session) -> None:
    s = _korean_series(session)
    strategy = SeriesTranslationStrategy()
    sibling = strategy.upsert_sibling(
        session, source=s, sibling=None, target_locale=PostLocale.JA,
        translated_fields={"title": "シリーズ", "excerpt": None, "body_markdown": "説明"},
        source_hash="abc",
    )
    session.commit()
    assert sibling.title == "シリーズ"
    assert sibling.description == "説明"
    assert sibling.locale == PostLocale.JA
    assert sibling.translation_status == PostTranslationStatus.SYNCED
    assert sibling.cover_image_url == s.cover_image_url
