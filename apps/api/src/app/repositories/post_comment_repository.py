from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.models.post import Post
from app.models.post_comment import PostComment


class PostCommentRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_post_by_slug(self, slug: str) -> Post | None:
        return self.db.scalar(select(Post).where(Post.slug == slug))

    def get_comment_model(self, comment_id: uuid.UUID) -> PostComment | None:
        return self.db.scalar(
            select(PostComment)
            .options(
                joinedload(PostComment.reply_to_comment),
                joinedload(PostComment.root_comment),
                joinedload(PostComment.post),
            )
            .where(PostComment.id == comment_id)
        )

    def list_by_post(self, post_id: uuid.UUID) -> list[PostComment]:
        return list(
            self.db.scalars(
                select(PostComment)
                .options(
                    joinedload(PostComment.reply_to_comment),
                    joinedload(PostComment.root_comment),
                )
                .where(PostComment.post_id == post_id)
                .order_by(PostComment.created_at.asc(), PostComment.id.asc())
            )
        )

    def list_admin_feed(
        self,
        limit: int = 100,
        offset: int = 0,
        post_slug: str | None = None,
    ) -> tuple[int, list[PostComment]]:
        count_stmt = select(func.count(PostComment.id)).join(Post, Post.id == PostComment.post_id)
        stmt = (
            select(PostComment)
            .options(
                joinedload(PostComment.reply_to_comment),
                joinedload(PostComment.root_comment),
                joinedload(PostComment.post),
            )
            .join(Post, Post.id == PostComment.post_id)
            .order_by(PostComment.created_at.desc(), PostComment.id.desc())
            .limit(limit)
            .offset(offset)
        )
        normalized_slug = (post_slug or "").strip()
        if normalized_slug:
            count_stmt = count_stmt.where(Post.slug == normalized_slug)
            stmt = stmt.where(Post.slug == normalized_slug)

        total_count = int(self.db.scalar(count_stmt) or 0)
        return total_count, list(self.db.scalars(stmt))

    def add(self, comment: PostComment) -> PostComment:
        self.db.add(comment)
        self.db.flush()
        self.db.refresh(comment)
        return comment
