from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.post import Post, PostStatus, PostVisibility
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
    ) -> list[Post]:
        stmt = select(Post).order_by(Post.created_at.desc())
        if status is not None:
            stmt = stmt.where(Post.status == status)
        if visibility is not None:
            stmt = stmt.where(Post.visibility == visibility)
        stmt = stmt.limit(limit).offset(offset)
        return list(self.db.scalars(stmt))

    def get_by_slug(
        self,
        slug: str,
        status: PostStatus | None = None,
        visibility: PostVisibility | None = None,
    ) -> Post | None:
        stmt = select(Post).where(Post.slug == slug)
        if status is not None:
            stmt = stmt.where(Post.status == status)
        if visibility is not None:
            stmt = stmt.where(Post.visibility == visibility)
        return self.db.scalar(stmt)

    def create(self, payload: PostCreate) -> Post:
        post_data = payload.model_dump()
        if post_data["status"] == PostStatus.PUBLISHED and post_data.get("published_at") is None:
            post_data["published_at"] = datetime.now(timezone.utc)

        post = Post(**post_data)
        self.db.add(post)
        self.db.commit()
        self.db.refresh(post)
        return post

    def update_by_slug(self, current_slug: str, payload: PostCreate) -> Post | None:
        post = self.get_by_slug(current_slug)
        if post is None:
            return None

        post_data = payload.model_dump()
        if post_data["status"] == PostStatus.PUBLISHED and post_data.get("published_at") is None:
            post_data["published_at"] = datetime.now(timezone.utc)

        for field, value in post_data.items():
            setattr(post, field, value)

        self.db.commit()
        self.db.refresh(post)
        return post

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
