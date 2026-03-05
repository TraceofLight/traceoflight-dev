from __future__ import annotations

import re
from collections.abc import Iterable

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.tag import PostTag, Tag

_TAG_SLUG_NON_ALNUM_PATTERN = re.compile(r"[^a-z0-9-]+")
_TAG_SLUG_MULTI_DASH_PATTERN = re.compile(r"-{2,}")


def normalize_tag_slug(value: str) -> str:
    normalized = value.strip().lower()
    normalized = normalized.replace("_", "-")
    normalized = re.sub(r"\s+", "-", normalized)
    normalized = _TAG_SLUG_NON_ALNUM_PATTERN.sub("", normalized)
    normalized = _TAG_SLUG_MULTI_DASH_PATTERN.sub("-", normalized)
    return normalized.strip("-")


def normalize_tag_slugs(values: Iterable[str]) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()
    for raw in values:
        slug = normalize_tag_slug(raw)
        if not slug or slug in seen:
            continue
        seen.add(slug)
        deduped.append(slug)
    return deduped


class TagRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list(
        self,
        query: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Tag]:
        stmt = select(Tag).order_by(Tag.slug.asc())
        normalized_query = (query or "").strip().lower()
        if normalized_query:
            token = f"%{normalized_query}%"
            stmt = stmt.where(
                (func.lower(Tag.slug).like(token))
                | (func.lower(Tag.label).like(token))
            )
        stmt = stmt.limit(limit).offset(offset)
        return list(self.db.scalars(stmt))

    def get_by_slug(self, slug: str) -> Tag | None:
        normalized_slug = normalize_tag_slug(slug)
        if not normalized_slug:
            return None
        return self.db.scalar(select(Tag).where(Tag.slug == normalized_slug))

    def list_by_slugs(self, slugs: Iterable[str]) -> list[Tag]:
        normalized_slugs = normalize_tag_slugs(slugs)
        if not normalized_slugs:
            return []
        stmt = select(Tag).where(Tag.slug.in_(normalized_slugs))
        existing = list(self.db.scalars(stmt))
        by_slug = {tag.slug: tag for tag in existing}
        return [by_slug[slug] for slug in normalized_slugs if slug in by_slug]

    def create(self, slug: str, label: str) -> Tag:
        tag = Tag(slug=slug, label=label)
        self.db.add(tag)
        self.db.flush()
        return tag

    def delete(self, tag: Tag) -> None:
        self.db.delete(tag)
        self.db.flush()

    def count_post_links(self, tag_id) -> int:  # type: ignore[no-untyped-def]
        stmt = select(func.count(PostTag.post_id)).where(PostTag.tag_id == tag_id)
        return int(self.db.scalar(stmt) or 0)
