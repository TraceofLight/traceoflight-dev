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
import app.services.translation_worker as translation_worker


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


def test_post_strategy_upsert_shares_tags_with_source(session) -> None:
    """Tag rows are locale-agnostic — siblings must reference the same Tag
    rows as the KO source so tag chips render on every translated page."""
    from app.models.tag import Tag
    p = _korean_post(session, slug="ko-tag-post")
    tag_a = Tag(slug="boj", label="boj")
    tag_b = Tag(slug="ps", label="ps")
    session.add_all([tag_a, tag_b])
    p.tags = [tag_a, tag_b]
    session.commit()
    strategy = PostTranslationStrategy()
    sibling = strategy.upsert_sibling(
        session, source=p, sibling=None, target_locale=PostLocale.JA,
        translated_fields={"title": "T", "excerpt": None, "body_markdown": "B"},
        source_hash="abc",
    )
    session.commit()
    sibling_tag_slugs = sorted(t.slug for t in sibling.tags)
    assert sibling_tag_slugs == ["boj", "ps"]
    # Crucially the sibling must share the same Tag rows (no new row inserted).
    assert {t.id for t in sibling.tags} == {tag_a.id, tag_b.id}


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
    # Regression guard: the sibling profile must point back at the sibling's own
    # post id. Earlier the strategy passed sibling.id verbatim while the sibling
    # was still pre-flush (id=None), causing a post_id NOT NULL violation in
    # production where autoflush did not happen to fire in time.
    assert sibling.project_profile.post_id == sibling.id


def test_post_strategy_upsert_handles_pre_flush_sibling(session) -> None:
    """A KO source whose translation has never been written must still produce
    a sibling profile whose post_id matches the freshly inserted sibling row,
    even when no incidental autoflush happens between Post(...) and
    ProjectProfile(...)."""
    from app.models.project_profile import ProjectProfile

    p = _korean_post(session, slug="ko-pre-flush")
    p.content_kind = PostContentKind.PROJECT
    profile = ProjectProfile(
        post_id=p.id, period_label="2026.06", role_summary="role",
        project_intro="intro", card_image_url="cover.png",
        highlights_json=["a"], resource_links_json=[],
    )
    session.add(profile)
    session.commit()
    session.expire_all()  # drop autoflush-side cached state
    p_reloaded = session.get(type(p), p.id)
    assert p_reloaded is not None

    # autoflush off so sibling.id stays None until commit ordering kicks in
    with session.no_autoflush:
        sibling = PostTranslationStrategy().upsert_sibling(
            session, source=p_reloaded, sibling=None, target_locale=PostLocale.EN,
            translated_fields={"title": "T", "excerpt": None, "body_markdown": "B"},
            source_hash="hash-pre-flush",
        )
    session.commit()
    assert sibling.id is not None
    assert sibling.project_profile is not None
    assert sibling.project_profile.post_id == sibling.id


def test_post_strategy_translates_project_profile_fields(session, monkeypatch) -> None:
    """upsert_sibling calls the provider for each profile text field on non-KO targets."""
    from app.models.project_profile import ProjectProfile

    p = _korean_post(session)
    p.content_kind = PostContentKind.PROJECT
    profile = ProjectProfile(
        post_id=p.id,
        period_label="2025. 12. ~ 2026. 02. (6주)",
        role_summary="개발자",
        project_intro="프로젝트 소개",
        card_image_url="card.png",
        highlights_json=["성과1", "성과2"],
        resource_links_json=[{"label": "GitHub", "href": "https://github.com/x"}],
    )
    session.add(profile)
    session.commit()

    # Stub provider that prefixes every title with "EN:"
    class _PrefixProvider:
        def translate_post(self, post, target_locale):
            return {
                "title": f"EN:{post.title}" if post.title else None,
                "excerpt": None,
                "body_markdown": post.body_markdown or "",
            }

    monkeypatch.setattr(translation_worker, "_get_provider", lambda: _PrefixProvider())

    strategy = PostTranslationStrategy()
    sibling = strategy.upsert_sibling(
        session, source=p, sibling=None, target_locale=PostLocale.EN,
        translated_fields={"title": "EN:제목", "excerpt": None, "body_markdown": "EN:안녕"},
        source_hash="abc",
    )
    session.commit()

    tp = sibling.project_profile
    assert tp is not None
    assert tp.role_summary == "EN:개발자"
    assert tp.project_intro == "EN:프로젝트 소개"
    assert tp.period_label == "EN:2025. 12. ~ 2026. 02. (6주)"
    assert tp.highlights_json == ["EN:성과1", "EN:성과2"]
    assert tp.resource_links_json == [{"label": "EN:GitHub", "href": "https://github.com/x"}]
    # Non-translated field must still be copied
    assert tp.card_image_url == "card.png"


def test_post_strategy_profile_korean_target_copies_verbatim(session, monkeypatch) -> None:
    """For a KO target sibling, profile fields are copied verbatim without calling the provider."""
    from app.models.project_profile import ProjectProfile

    # Track whether provider is ever called
    calls = []

    class _TrackingProvider:
        def translate_post(self, post, target_locale):
            calls.append(target_locale)
            return None

    monkeypatch.setattr(translation_worker, "_get_provider", lambda: _TrackingProvider())

    # Use a unique slug so the KO sibling doesn't clash with the KO source
    p = _korean_post(session, slug="ko-source-verbatim")
    p.content_kind = PostContentKind.PROJECT
    profile = ProjectProfile(
        post_id=p.id,
        period_label="2026.01",
        role_summary="역할",
        project_intro="소개",
        card_image_url="img.png",
        highlights_json=["H"],
        resource_links_json=[],
    )
    session.add(profile)
    session.commit()

    # Build the sibling manually so it has a distinct id but same group
    import uuid as _uuid
    from app.models.post import PostStatus, PostVisibility
    from datetime import datetime, timezone
    sibling_post = Post(
        slug="ko-sibling-verbatim",
        title="제목", excerpt="짧음", body_markdown="안녕",
        content_kind=PostContentKind.PROJECT,
        status=PostStatus.PUBLISHED, visibility=PostVisibility.PUBLIC,
        locale=PostLocale.KO,
        translation_group_id=p.translation_group_id,
        source_post_id=p.id,
        translation_status=PostTranslationStatus.SYNCED,
        translation_source_kind=PostTranslationSourceKind.MACHINE,
        published_at=datetime.now(timezone.utc),
    )
    session.add(sibling_post)
    session.commit()
    session.refresh(sibling_post)

    strategy = PostTranslationStrategy()
    result = strategy._sync_project_profile(
        session, source=p, sibling=sibling_post, target_locale=PostLocale.KO,
    )
    session.commit()

    tp = sibling_post.project_profile
    assert tp is not None
    assert tp.period_label == "2026.01"
    assert tp.role_summary == "역할"
    assert calls == [], "Provider must not be called for KO target"


def test_post_strategy_compute_hash_includes_profile(session) -> None:
    """compute_source_hash changes when project_profile fields change."""
    from app.models.project_profile import ProjectProfile
    from app.services.translation_hash import compute_post_source_hash

    p = _korean_post(session)
    p.content_kind = PostContentKind.PROJECT

    # Hash without profile
    hash_no_profile = PostTranslationStrategy().compute_source_hash(p)

    profile = ProjectProfile(
        post_id=p.id,
        period_label="2026.01",
        role_summary="dev",
        project_intro="intro",
        card_image_url="x",
        highlights_json=[],
        resource_links_json=[],
    )
    session.add(profile)
    session.commit()
    session.refresh(p)

    hash_with_profile = PostTranslationStrategy().compute_source_hash(p)
    assert hash_no_profile != hash_with_profile

    # Changing role_summary must change the hash
    profile.role_summary = "designer"
    session.commit()
    session.refresh(p)
    hash_changed = PostTranslationStrategy().compute_source_hash(p)
    assert hash_changed != hash_with_profile


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


# ---------------------------------------------------------------------------
# _sync_series_posts tests
# ---------------------------------------------------------------------------

def _make_post(db: Session, locale: PostLocale, slug: str, group_id: uuid.UUID) -> Post:
    p = Post(
        slug=slug, title="제목", excerpt="짧음", body_markdown="내용",
        content_kind=PostContentKind.BLOG,
        status=PostStatus.PUBLISHED, visibility=PostVisibility.PUBLIC,
        locale=locale, translation_group_id=group_id,
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
        published_at=datetime.now(timezone.utc),
    )
    db.add(p); db.commit(); db.refresh(p); return p


def test_series_strategy_replicates_series_posts_to_sibling(session) -> None:
    """upsert_sibling mirrors source series_posts to the sibling with translated post IDs."""
    from app.models.series import SeriesPost

    group1 = uuid.uuid4()
    group2 = uuid.uuid4()

    # Create ko source series with 2 mapped ko posts
    ko_series = _korean_series(session, slug="ko-series-sync")
    ko_post1 = _make_post(session, PostLocale.KO, "ko-post-1", group1)
    ko_post2 = _make_post(session, PostLocale.KO, "ko-post-2", group2)

    session.add(SeriesPost(series_id=ko_series.id, post_id=ko_post1.id, order_index=1))
    session.add(SeriesPost(series_id=ko_series.id, post_id=ko_post2.id, order_index=2))
    session.commit()
    session.refresh(ko_series)

    # Create en sibling posts in the same translation groups
    en_post1 = _make_post(session, PostLocale.EN, "en-post-1", group1)
    en_post2 = _make_post(session, PostLocale.EN, "en-post-2", group2)

    strategy = SeriesTranslationStrategy()
    en_sibling = strategy.upsert_sibling(
        session, source=ko_series, sibling=None, target_locale=PostLocale.EN,
        translated_fields={"title": "Series", "excerpt": None, "body_markdown": "Description"},
        source_hash="hash1",
    )
    session.commit()
    session.refresh(en_sibling)

    assert len(en_sibling.series_posts) == 2
    mapped_post_ids = {sp.post_id for sp in en_sibling.series_posts}
    assert en_post1.id in mapped_post_ids
    assert en_post2.id in mapped_post_ids
    # order_index must be preserved
    order_map = {sp.post_id: sp.order_index for sp in en_sibling.series_posts}
    assert order_map[en_post1.id] == 1
    assert order_map[en_post2.id] == 2


def test_series_strategy_skips_missing_sibling_post(session) -> None:
    """If a ko post has no en sibling yet, _sync_series_posts skips it silently."""
    from app.models.series import SeriesPost

    group_no_sibling = uuid.uuid4()
    group_has_sibling = uuid.uuid4()

    ko_series = _korean_series(session, slug="ko-series-partial")
    ko_post_orphan = _make_post(session, PostLocale.KO, "ko-orphan", group_no_sibling)
    ko_post_linked = _make_post(session, PostLocale.KO, "ko-linked", group_has_sibling)

    session.add(SeriesPost(series_id=ko_series.id, post_id=ko_post_orphan.id, order_index=1))
    session.add(SeriesPost(series_id=ko_series.id, post_id=ko_post_linked.id, order_index=2))
    session.commit()
    session.refresh(ko_series)

    # Only create an en sibling for the second post
    en_post_linked = _make_post(session, PostLocale.EN, "en-linked", group_has_sibling)

    strategy = SeriesTranslationStrategy()
    en_sibling = strategy.upsert_sibling(
        session, source=ko_series, sibling=None, target_locale=PostLocale.EN,
        translated_fields={"title": "Series", "excerpt": None, "body_markdown": "Desc"},
        source_hash="hash2",
    )
    session.commit()
    session.refresh(en_sibling)

    # Only the post with a sibling should be mapped
    assert len(en_sibling.series_posts) == 1
    assert en_sibling.series_posts[0].post_id == en_post_linked.id
    assert en_sibling.series_posts[0].order_index == 2
