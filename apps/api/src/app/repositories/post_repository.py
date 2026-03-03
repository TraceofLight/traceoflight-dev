from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.post import Post
from app.schemas.post import PostCreate


class PostRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list(self, limit: int = 20, offset: int = 0) -> list[Post]:
        stmt = select(Post).order_by(Post.created_at.desc()).limit(limit).offset(offset)
        return list(self.db.scalars(stmt))

    def create(self, payload: PostCreate) -> Post:
        post = Post(**payload.model_dump())
        self.db.add(post)
        self.db.commit()
        self.db.refresh(post)
        return post