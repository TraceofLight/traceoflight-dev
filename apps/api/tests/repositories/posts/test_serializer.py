from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from app.repositories.posts.serializer import (
    PostSerializerService,
    format_reading_label,
)


def test_format_reading_label_empty_string_returns_one_minute() -> None:
    assert format_reading_label("") == "1 min read"


def test_format_reading_label_short_text_rounds_up_to_one_minute() -> None:
    assert format_reading_label("hello world") == "1 min read"


def test_format_reading_label_strips_code_fences() -> None:
    fenced = "```python\n" + ("word " * 500) + "\n```"
    # All words are inside the fence, so they are not counted.
    assert format_reading_label(fenced) == "1 min read"


def test_format_reading_label_strips_inline_code() -> None:
    inline = "`" + ("word " * 500) + "`"
    assert format_reading_label(inline) == "1 min read"


def test_format_reading_label_strips_image_markdown() -> None:
    image_only = "![alt](https://example.com/x.png) " * 50
    assert format_reading_label(image_only) == "1 min read"


def test_format_reading_label_keeps_link_text_visible() -> None:
    link_text = "[click](http://x) " * 250
    # Link text is preserved, so the 250 visible words push the label past 1 minute.
    assert format_reading_label(link_text) != "1 min read"


def test_format_reading_label_uses_settings_words_per_minute(monkeypatch) -> None:
    from app.repositories.posts import serializer

    captured: dict[str, int] = {}

    class _Settings:
        @property
        def reading_words_per_minute(self) -> int:
            captured["wpm"] = 100
            return 100

    monkeypatch.setattr(serializer, "settings", _Settings())
    long_text = "word " * 200
    # 200 words / 100 wpm = 2 min
    assert format_reading_label(long_text) == "2 min read"
    assert captured["wpm"] == 100


@dataclass
class _PostStub:
    id: object
    slug: str
    title: str
    excerpt: str | None
    body_markdown: str
    cover_image_url: str | None
    top_media_kind: str
    top_media_image_url: str | None
    top_media_youtube_url: str | None
    top_media_video_url: str | None
    series_title: str | None
    content_kind: str
    status: str
    visibility: str
    published_at: datetime | None
    tags: list[object]
    comment_count: int
    created_at: datetime
    updated_at: datetime


def _make_post_stub(**overrides) -> _PostStub:  # type: ignore[no-untyped-def]
    now = datetime.now(timezone.utc)
    defaults = {
        "id": "id-1",
        "slug": "post-a",
        "title": "Title",
        "excerpt": "exc",
        "body_markdown": "body",
        "cover_image_url": None,
        "top_media_kind": "image",
        "top_media_image_url": None,
        "top_media_youtube_url": None,
        "top_media_video_url": None,
        "series_title": None,
        "content_kind": "blog",
        "status": "published",
        "visibility": "public",
        "published_at": now,
        "tags": [],
        "comment_count": 0,
        "created_at": now,
        "updated_at": now,
    }
    defaults.update(overrides)
    return _PostStub(**defaults)


def test_post_serializer_to_summary_includes_all_expected_keys() -> None:
    post = _make_post_stub()
    summary = PostSerializerService.to_summary(post)
    expected_keys = {
        "id",
        "slug",
        "title",
        "excerpt",
        "cover_image_url",
        "top_media_kind",
        "top_media_image_url",
        "top_media_youtube_url",
        "top_media_video_url",
        "series_title",
        "content_kind",
        "status",
        "visibility",
        "published_at",
        "reading_label",
        "tags",
        "comment_count",
        "created_at",
        "updated_at",
    }
    assert set(summary.keys()) == expected_keys


def test_post_serializer_to_summary_uses_reading_label_for_body() -> None:
    post = _make_post_stub(body_markdown="word " * 1200)
    summary = PostSerializerService.to_summary(post)
    # Reading label must be derived from body_markdown, not body or empty.
    assert summary["reading_label"].endswith(" min read")
    assert summary["reading_label"] != "1 min read"
