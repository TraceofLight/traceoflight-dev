from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass
class PostEntry:
    meta: dict
    body_markdown: str


@dataclass
class BackupBundle:
    site_profile: dict | None
    tags: list[dict]
    post_tags: list[dict]
    media_assets: list[dict]
    media_bytes: dict[str, bytes]
    posts: list[PostEntry]
    series: list[dict]
    series_posts: list[dict]
    post_comments: list[dict]
    generated_at: datetime
