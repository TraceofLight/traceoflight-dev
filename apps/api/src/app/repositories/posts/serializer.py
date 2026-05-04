"""Reading-time and summary-payload helpers for Post rows."""

from __future__ import annotations

import re

from app.core.config import settings
from app.models.post import Post


def _words_per_minute() -> int:
    return max(1, int(settings.reading_words_per_minute))


# Kept as a module-level constant for callers that import the symbol
# directly; reflects the configured default at import time but the
# helper functions below always read the live settings value.
DEFAULT_WORDS_PER_MINUTE = _words_per_minute()


def _count_reading_words(markdown_source: str = "") -> int:
    plain_text = str(markdown_source).replace("\r\n", "\n")
    plain_text = re.sub(r"```[\s\S]*?```", " ", plain_text)
    plain_text = re.sub(r"`[^`]*`", " ", plain_text)
    plain_text = re.sub(r"!\[[^\]]*\]\([^)]+\)", " ", plain_text)
    plain_text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r" \1 ", plain_text)
    plain_text = re.sub(r"<[^>]+>", " ", plain_text)
    plain_text = re.sub(r"[#>*_~=\-]+", " ", plain_text)
    plain_text = re.sub(r"\s+", " ", plain_text).strip()
    if not plain_text:
        return 0
    return len([token for token in plain_text.split(" ") if token])


def format_reading_label(markdown_source: str = "") -> str:
    word_count = _count_reading_words(markdown_source)
    words_per_minute = _words_per_minute()
    minutes = (
        max(1, -(-word_count // words_per_minute)) if word_count else 1
    )
    return f"{minutes} min read"


class PostSerializerService:
    """Convert Post ORM rows into the dict shape consumed by summary endpoints."""

    @staticmethod
    def to_summary(post: Post) -> dict[str, object]:
        return {
            "id": post.id,
            "slug": post.slug,
            "title": post.title,
            "excerpt": post.excerpt,
            "cover_image_url": post.cover_image_url,
            "top_media_kind": post.top_media_kind,
            "top_media_image_url": post.top_media_image_url,
            "top_media_youtube_url": post.top_media_youtube_url,
            "top_media_video_url": post.top_media_video_url,
            "series_title": post.series_title,
            "locale": post.locale,
            "content_kind": post.content_kind,
            "status": post.status,
            "visibility": post.visibility,
            "published_at": post.published_at,
            "reading_label": format_reading_label(post.body_markdown),
            "tags": post.tags,
            "comment_count": post.comment_count,
            "created_at": post.created_at,
            "updated_at": post.updated_at,
        }
