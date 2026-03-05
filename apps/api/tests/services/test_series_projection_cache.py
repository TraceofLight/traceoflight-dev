from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

from app.services import series_projection_cache as projection_cache


@dataclass
class _PostStub:
    id: UUID
    slug: str
    series_title: str | None
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime


def _dt(hour: int) -> datetime:
    return datetime(2026, 3, 5, hour, 0, tzinfo=timezone.utc)


def test_build_projection_rows_groups_by_slugified_series_title_and_orders_posts() -> None:
    posts = [
        _PostStub(
            id=UUID("00000000-0000-0000-0000-000000000001"),
            slug="post-2",
            series_title="FastAPI Deep Dive",
            published_at=_dt(11),
            created_at=_dt(10),
            updated_at=_dt(12),
        ),
        _PostStub(
            id=UUID("00000000-0000-0000-0000-000000000002"),
            slug="post-1",
            series_title="  FastAPI Deep Dive  ",
            published_at=_dt(9),
            created_at=_dt(8),
            updated_at=_dt(9),
        ),
        _PostStub(
            id=UUID("00000000-0000-0000-0000-000000000003"),
            slug="post-3",
            series_title="Renderer Basics",
            published_at=None,
            created_at=_dt(7),
            updated_at=_dt(7),
        ),
    ]

    rows = projection_cache._build_projection_rows(posts)  # noqa: SLF001

    assert [row.slug for row in rows] == ["FastAPI-Deep-Dive", "Renderer-Basics"]
    assert rows[0].title == "FastAPI Deep Dive"
    assert list(rows[0].post_ids) == [
        UUID("00000000-0000-0000-0000-000000000002"),
        UUID("00000000-0000-0000-0000-000000000001"),
    ]
    assert list(rows[1].post_ids) == [UUID("00000000-0000-0000-0000-000000000003")]


def test_slugify_series_title_falls_back_to_series_token_for_symbols_only() -> None:
    assert projection_cache._slugify_series_title("!!!") == "series"  # noqa: SLF001


def test_slugify_series_title_preserves_unicode_alnum_characters() -> None:
    assert projection_cache._slugify_series_title("유니코드 시리즈") == "유니코드-시리즈"  # noqa: SLF001


def test_build_projection_rows_treats_case_distinct_series_titles_as_different_series() -> None:
    posts = [
        _PostStub(
            id=UUID("00000000-0000-0000-0000-000000000011"),
            slug="post-ps-upper",
            series_title="PS",
            published_at=_dt(10),
            created_at=_dt(10),
            updated_at=_dt(10),
        ),
        _PostStub(
            id=UUID("00000000-0000-0000-0000-000000000012"),
            slug="post-ps-title",
            series_title="Ps",
            published_at=_dt(11),
            created_at=_dt(11),
            updated_at=_dt(11),
        ),
    ]

    rows = projection_cache._build_projection_rows(posts)  # noqa: SLF001

    assert [row.slug for row in rows] == ["PS", "Ps"]
