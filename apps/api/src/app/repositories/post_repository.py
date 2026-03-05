from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime, timezone

from sqlalchemy import distinct, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models.post import Post, PostStatus, PostVisibility
from app.models.tag import Tag
from app.repositories.tag_repository import normalize_tag_slugs
from app.schemas.post import PostCreate


class PostRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list(
        self,
        limit: int = 20,
        offset: int = 0,
        status: PostStatus | None = None,
        visibility: PostVisibility | None = None,
        tags: list[str] | None = None,
        tag_match: str = "any",
    ) -> list[Post]:
        stmt = select(Post).options(selectinload(Post.tags)).order_by(Post.created_at.desc())
        if status is not None:
            stmt = stmt.where(Post.status == status)
        if visibility is not None:
            stmt = stmt.where(Post.visibility == visibility)
        normalized_tags = normalize_tag_slugs(tags or [])
        if normalized_tags:
            tag_stmt = (
                select(Post.id)
                .join(Post.tags)
                .where(Tag.slug.in_(normalized_tags))
                .group_by(Post.id)
            )
            if tag_match == "all":
                tag_stmt = tag_stmt.having(func.count(distinct(Tag.slug)) == len(normalized_tags))
            stmt = stmt.where(Post.id.in_(tag_stmt))
        stmt = stmt.limit(limit).offset(offset)
        return list(self.db.scalars(stmt))

    def get_by_slug(
        self,
        slug: str,
        status: PostStatus | None = None,
        visibility: PostVisibility | None = None,
    ) -> Post | None:
        stmt = select(Post).options(selectinload(Post.tags)).where(Post.slug == slug)
        if status is not None:
            stmt = stmt.where(Post.status == status)
        if visibility is not None:
            stmt = stmt.where(Post.visibility == visibility)
        return self.db.scalar(stmt)

    def _resolve_tags(self, raw_tags: Iterable[str]) -> list[Tag]:
        normalized_slugs = normalize_tag_slugs(raw_tags)
        if not normalized_slugs:
            return []

        existing_tags = list(
            self.db.scalars(select(Tag).where(Tag.slug.in_(normalized_slugs)))
        )
        by_slug = {tag.slug: tag for tag in existing_tags}

        resolved: list[Tag] = []
        for slug in normalized_slugs:
            tag = by_slug.get(slug)
            if tag is None:
                try:
                    with self.db.begin_nested():
                        tag = Tag(slug=slug, label=slug)
                        self.db.add(tag)
                        self.db.flush()
                except IntegrityError:
                    tag = self.db.scalar(select(Tag).where(Tag.slug == slug))
                    if tag is None:
                        raise
                by_slug[slug] = tag
            resolved.append(tag)

        return resolved

    def create(self, payload: PostCreate) -> Post:
        post_data = payload.model_dump()
        raw_tags = post_data.pop("tags", [])
        if post_data["status"] == PostStatus.PUBLISHED and post_data.get("published_at") is None:
            post_data["published_at"] = datetime.now(timezone.utc)

        post = Post(**post_data)
        post.tags = self._resolve_tags(raw_tags)
        self.db.add(post)
        self.db.commit()
        return self.get_by_slug(post.slug) or post

    def update_by_slug(self, current_slug: str, payload: PostCreate) -> Post | None:
        post = self.get_by_slug(current_slug)
        if post is None:
            return None

        post_data = payload.model_dump()
        raw_tags = post_data.pop("tags", [])
        if post_data["status"] == PostStatus.PUBLISHED and post_data.get("published_at") is None:
            post_data["published_at"] = datetime.now(timezone.utc)

        for field, value in post_data.items():
            setattr(post, field, value)
        post.tags = self._resolve_tags(raw_tags)

        self.db.commit()
        return self.get_by_slug(post.slug) or post

    def delete_by_slug(
        self,
        slug: str,
        status: PostStatus | None = None,
        visibility: PostVisibility | None = None,
    ) -> bool:
        post = self.get_by_slug(slug=slug, status=status, visibility=visibility)
        if post is None:
            return False

        self.db.delete(post)
        self.db.commit()
        return True
