from __future__ import annotations

from dataclasses import dataclass
from types import SimpleNamespace

from app.models.post import PostStatus, PostVisibility
from app.repositories.posts.series_context import SeriesContextService


@dataclass
class _Post:
    id: object
    slug: str
    series_context: object | None = None


class _FakeSession:
    """Returns canned row sequences for the two execute() calls in order."""

    def __init__(self, *, mapping_rows: list[object], ordered_rows: list[object]) -> None:
        self._responses = [mapping_rows, ordered_rows]
        self.execute_calls = 0

    def execute(self, _stmt):  # type: ignore[no-untyped-def]
        self.execute_calls += 1
        if not self._responses:
            return iter([])
        return iter(self._responses.pop(0))


def _mapping(post_id, order_index, series_id, slug, title):  # type: ignore[no-untyped-def]
    return SimpleNamespace(
        post_id=post_id,
        order_index=order_index,
        id=series_id,
        slug=slug,
        title=title,
    )


def _ordered(series_id, order_index, slug, title, status, visibility):  # type: ignore[no-untyped-def]
    return SimpleNamespace(
        series_id=series_id,
        order_index=order_index,
        slug=slug,
        title=title,
        status=status,
        visibility=visibility,
    )


def test_apply_empty_post_list_returns_empty_without_query() -> None:
    session = _FakeSession(mapping_rows=[], ordered_rows=[])
    service = SeriesContextService(db=session)
    result = service.apply([], public_only=False)
    assert result == []
    assert session.execute_calls == 0


def test_apply_uses_only_two_queries_regardless_of_post_count() -> None:
    # 5 posts, all mapped to the same series — confirms the N+1 fix.
    posts = [_Post(id=f"p{i}", slug=f"slug-{i}") for i in range(5)]
    mapping_rows = [
        _mapping(post_id=f"p{i}", order_index=i, series_id="s1", slug="series-a", title="A")
        for i in range(5)
    ]
    ordered_rows = [
        _ordered(
            series_id="s1",
            order_index=i,
            slug=f"slug-{i}",
            title=f"T{i}",
            status=PostStatus.PUBLISHED,
            visibility=PostVisibility.PUBLIC,
        )
        for i in range(5)
    ]
    session = _FakeSession(mapping_rows=mapping_rows, ordered_rows=ordered_rows)
    SeriesContextService(db=session).apply(posts, public_only=False)
    assert session.execute_calls == 2


def test_apply_assigns_prev_next_for_middle_post() -> None:
    posts = [_Post(id="p2", slug="slug-1")]
    mapping_rows = [
        _mapping(post_id="p2", order_index=1, series_id="s1", slug="series-a", title="A"),
    ]
    ordered_rows = [
        _ordered("s1", 0, "slug-0", "T0", PostStatus.PUBLISHED, PostVisibility.PUBLIC),
        _ordered("s1", 1, "slug-1", "T1", PostStatus.PUBLISHED, PostVisibility.PUBLIC),
        _ordered("s1", 2, "slug-2", "T2", PostStatus.PUBLISHED, PostVisibility.PUBLIC),
    ]
    session = _FakeSession(mapping_rows=mapping_rows, ordered_rows=ordered_rows)
    SeriesContextService(db=session).apply(posts, public_only=False)
    ctx = posts[0].series_context
    assert ctx is not None
    assert ctx["series_slug"] == "series-a"
    assert ctx["total_posts"] == 3
    assert ctx["prev_post_slug"] == "slug-0"
    assert ctx["next_post_slug"] == "slug-2"


def test_apply_first_post_has_no_prev() -> None:
    posts = [_Post(id="p1", slug="slug-0")]
    mapping_rows = [
        _mapping(post_id="p1", order_index=0, series_id="s1", slug="series-a", title="A"),
    ]
    ordered_rows = [
        _ordered("s1", 0, "slug-0", "T0", PostStatus.PUBLISHED, PostVisibility.PUBLIC),
        _ordered("s1", 1, "slug-1", "T1", PostStatus.PUBLISHED, PostVisibility.PUBLIC),
    ]
    SeriesContextService(
        db=_FakeSession(mapping_rows=mapping_rows, ordered_rows=ordered_rows)
    ).apply(posts, public_only=False)
    ctx = posts[0].series_context
    assert ctx is not None
    assert ctx["prev_post_slug"] is None
    assert ctx["next_post_slug"] == "slug-1"


def test_apply_last_post_has_no_next() -> None:
    posts = [_Post(id="p3", slug="slug-2")]
    mapping_rows = [
        _mapping(post_id="p3", order_index=2, series_id="s1", slug="series-a", title="A"),
    ]
    ordered_rows = [
        _ordered("s1", 0, "slug-0", "T0", PostStatus.PUBLISHED, PostVisibility.PUBLIC),
        _ordered("s1", 1, "slug-1", "T1", PostStatus.PUBLISHED, PostVisibility.PUBLIC),
        _ordered("s1", 2, "slug-2", "T2", PostStatus.PUBLISHED, PostVisibility.PUBLIC),
    ]
    SeriesContextService(
        db=_FakeSession(mapping_rows=mapping_rows, ordered_rows=ordered_rows)
    ).apply(posts, public_only=False)
    ctx = posts[0].series_context
    assert ctx is not None
    assert ctx["next_post_slug"] is None
    assert ctx["prev_post_slug"] == "slug-1"


def test_apply_public_only_filters_out_drafts_and_private() -> None:
    posts = [_Post(id="p2", slug="slug-public-1")]
    mapping_rows = [
        _mapping(post_id="p2", order_index=1, series_id="s1", slug="series-a", title="A"),
    ]
    ordered_rows = [
        _ordered("s1", 0, "slug-public-0", "T0", PostStatus.PUBLISHED, PostVisibility.PUBLIC),
        _ordered("s1", 1, "slug-public-1", "T1", PostStatus.PUBLISHED, PostVisibility.PUBLIC),
        _ordered("s1", 2, "slug-draft", "T2", PostStatus.DRAFT, PostVisibility.PUBLIC),
        _ordered("s1", 3, "slug-private", "T3", PostStatus.PUBLISHED, PostVisibility.PRIVATE),
    ]
    SeriesContextService(
        db=_FakeSession(mapping_rows=mapping_rows, ordered_rows=ordered_rows)
    ).apply(posts, public_only=True)
    ctx = posts[0].series_context
    assert ctx is not None
    # After filtering, only the two PUBLIC+PUBLISHED rows remain.
    assert ctx["total_posts"] == 2
    assert ctx["prev_post_slug"] == "slug-public-0"
    assert ctx["next_post_slug"] is None


def test_apply_no_mapping_sets_series_context_to_none() -> None:
    posts = [_Post(id="p1", slug="orphan")]
    session = _FakeSession(mapping_rows=[], ordered_rows=[])
    SeriesContextService(db=session).apply(posts, public_only=False)
    assert posts[0].series_context is None
    # If there are no mapping rows we short-circuit before the second query.
    assert session.execute_calls == 1


def test_apply_post_outside_its_series_listing_gets_none() -> None:
    posts = [_Post(id="p99", slug="not-in-series")]
    mapping_rows = [
        _mapping(post_id="p99", order_index=0, series_id="s1", slug="series-a", title="A"),
    ]
    # ordered_rows has no row whose slug matches the post's slug
    ordered_rows = [
        _ordered("s1", 0, "other-slug", "Other", PostStatus.PUBLISHED, PostVisibility.PUBLIC),
    ]
    SeriesContextService(
        db=_FakeSession(mapping_rows=mapping_rows, ordered_rows=ordered_rows)
    ).apply(posts, public_only=False)
    assert posts[0].series_context is None
