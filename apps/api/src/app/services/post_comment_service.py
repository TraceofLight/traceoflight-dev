from __future__ import annotations

import uuid
from datetime import datetime, timezone

from argon2.exceptions import InvalidHashError, VerifyMismatchError
from sqlalchemy.orm import Session

from app.core.password import password_hasher
from app.models.post_comment import (
    PostComment,
    PostCommentAuthorType,
    PostCommentStatus,
)
from app.repositories.post_comment_repository import PostCommentRepository
from app.schemas.post_comment import (
    AdminCommentFeed,
    AdminCommentFeedItem,
    AdminCommentFeedQuery,
    PostCommentCreate,
    PostCommentDelete,
    PostCommentRead,
    PostCommentThreadItem,
    PostCommentThreadList,
    PostCommentUpdate,
)

ADMIN_COMMENT_AUTHOR_NAME = "TraceofLight"
PRIVATE_COMMENT_PLACEHOLDER = "비공개된 댓글입니다."
DELETED_COMMENT_PLACEHOLDER = "삭제된 댓글입니다."


class CommentNotFoundError(LookupError):
    pass


class CommentAuthError(PermissionError):
    pass


class CommentConflictError(ValueError):
    pass


class PostCommentService:
    def __init__(self, db: Session) -> None:
        self.repo = PostCommentRepository(db)
        self._password_hasher = password_hasher

    def list_post_comments(self, post_slug: str, include_private: bool = False) -> PostCommentThreadList:
        post = self.repo.get_post_by_slug(post_slug)
        if post is None:
            raise CommentNotFoundError("post not found")

        comments = self.repo.list_by_post(post.id)
        roots = [comment for comment in comments if comment.root_comment_id is None]
        replies_by_root: dict[uuid.UUID, list[PostComment]] = {}
        for comment in comments:
            if comment.root_comment_id is None:
                continue
            replies_by_root.setdefault(comment.root_comment_id, []).append(comment)

        items = [
            PostCommentThreadItem(
                **self._to_comment_read(root, include_private=include_private).model_dump(),
                replies=[
                    self._to_comment_read(reply, include_private=include_private)
                    for reply in replies_by_root.get(root.id, [])
                ],
            )
            for root in roots
        ]
        return PostCommentThreadList(comment_count=len(comments), items=items)

    def create_comment(
        self,
        post_slug: str,
        payload: PostCommentCreate,
        *,
        is_admin: bool,
    ) -> PostCommentRead:
        post = self.repo.get_post_by_slug(post_slug)
        if post is None:
            raise CommentNotFoundError("post not found")

        root_comment_id, reply_to_comment_id = self._resolve_reply_target(
            post.id,
            payload.reply_to_comment_id,
        )
        author_name: str
        author_type: PostCommentAuthorType
        password_hash: str | None
        if is_admin:
            author_name = ADMIN_COMMENT_AUTHOR_NAME
            author_type = PostCommentAuthorType.ADMIN
            password_hash = None
        else:
            author_name = (payload.author_name or "").strip()
            password = payload.password or ""
            if not author_name:
                raise CommentAuthError("이름을 입력해 주세요.")
            if len(password) < 4:
                raise CommentAuthError("비밀번호를 4자 이상 입력해 주세요.")
            if len(author_name) < 2:
                raise CommentAuthError("이름을 2자 이상 입력해 주세요.")
            author_type = PostCommentAuthorType.GUEST
            password_hash = self._password_hasher.hash(password)

        comment = PostComment(
            post_id=post.id,
            root_comment_id=root_comment_id,
            reply_to_comment_id=reply_to_comment_id,
            author_name=author_name,
            author_type=author_type,
            password_hash=password_hash,
            visibility=payload.visibility,
            status=PostCommentStatus.ACTIVE,
            body=payload.body.strip(),
        )
        created = self.repo.add(comment)
        self.repo.db.commit()
        refreshed = self.repo.get_comment_model(created.id)
        if refreshed is None:
            raise CommentNotFoundError("comment not found")
        return self._to_comment_read(refreshed, include_private=True)

    def update_comment(
        self,
        comment_id: uuid.UUID,
        payload: PostCommentUpdate,
        *,
        is_admin: bool,
    ) -> PostCommentRead:
        comment = self._get_comment_or_raise(comment_id)
        if comment.status == PostCommentStatus.DELETED:
            raise CommentConflictError("deleted comments cannot be edited")
        self._authorize_comment_owner(comment, payload.password, is_admin=is_admin)

        if payload.body is not None:
            comment.body = payload.body.strip()
        if payload.visibility is not None:
            comment.visibility = payload.visibility
        comment.last_edited_at = datetime.now(timezone.utc)
        self.repo.db.commit()
        refreshed = self._get_comment_or_raise(comment_id)
        return self._to_comment_read(refreshed, include_private=True)

    def delete_comment(
        self,
        comment_id: uuid.UUID,
        payload: PostCommentDelete,
        *,
        is_admin: bool,
    ) -> PostCommentRead:
        comment = self._get_comment_or_raise(comment_id)
        self._authorize_comment_owner(comment, payload.password, is_admin=is_admin)

        comment.status = PostCommentStatus.DELETED
        comment.body = DELETED_COMMENT_PLACEHOLDER
        comment.deleted_at = datetime.now(timezone.utc)
        comment.last_edited_at = comment.deleted_at
        self.repo.db.commit()
        refreshed = self._get_comment_or_raise(comment_id)
        return self._to_comment_read(refreshed, include_private=True)

    def list_admin_comments(self, query: AdminCommentFeedQuery) -> AdminCommentFeed:
        total_count, comments = self.repo.list_admin_feed(
            limit=query.limit,
            offset=query.offset,
            post_slug=query.post_slug,
        )
        items = [
            AdminCommentFeedItem(
                **self._to_comment_read(comment, include_private=True).model_dump(),
                post_slug=comment.post.slug,
                post_title=comment.post.title,
                is_reply=comment.root_comment_id is not None,
            )
            for comment in comments
        ]
        return AdminCommentFeed(total_count=total_count, items=items)

    def _resolve_reply_target(
        self,
        post_id: uuid.UUID,
        reply_to_comment_id: uuid.UUID | None,
    ) -> tuple[uuid.UUID | None, uuid.UUID | None]:
        if reply_to_comment_id is None:
            return None, None

        target = self.repo.get_comment_model(reply_to_comment_id)
        if target is None or target.post_id != post_id:
            raise CommentConflictError("invalid comment target")
        if target.status == PostCommentStatus.DELETED:
            raise CommentConflictError("deleted comments cannot receive new replies")

        root_comment_id = target.id if target.root_comment_id is None else target.root_comment_id
        return root_comment_id, target.id

    def _get_comment_or_raise(self, comment_id: uuid.UUID) -> PostComment:
        comment = self.repo.get_comment_model(comment_id)
        if comment is None:
            raise CommentNotFoundError("comment not found")
        return comment

    def _authorize_comment_owner(
        self,
        comment: PostComment,
        password: str | None,
        *,
        is_admin: bool,
    ) -> None:
        if is_admin:
            return
        if comment.author_type != PostCommentAuthorType.GUEST or not comment.password_hash:
            raise CommentAuthError("authentication failed")
        if not password:
            raise CommentAuthError("authentication failed")
        try:
            verified = self._password_hasher.verify(comment.password_hash, password)
        except (VerifyMismatchError, InvalidHashError):
            verified = False
        if not verified:
            raise CommentAuthError("authentication failed")

    def _to_comment_read(self, comment: PostComment, *, include_private: bool) -> PostCommentRead:
        body = comment.body
        if comment.status == PostCommentStatus.DELETED:
            body = DELETED_COMMENT_PLACEHOLDER
        elif not include_private and comment.visibility.value == "private":
            body = PRIVATE_COMMENT_PLACEHOLDER

        reply_to_author_name = (
            self._normalize_author_name(
                comment.reply_to_comment.author_name,
                comment.reply_to_comment.author_type,
            )
            if comment.reply_to_comment is not None
            else None
        )

        return PostCommentRead(
            id=comment.id,
            root_comment_id=comment.root_comment_id,
            reply_to_comment_id=comment.reply_to_comment_id,
            author_name=self._normalize_author_name(comment.author_name, comment.author_type),
            author_type=comment.author_type,
            visibility=comment.visibility,
            status=comment.status,
            body=body,
            password_hash=None,
            can_reply=comment.status != PostCommentStatus.DELETED,
            reply_to_author_name=reply_to_author_name,
            created_at=comment.created_at,
            updated_at=comment.updated_at,
        )

    def _normalize_author_name(
        self,
        author_name: str,
        author_type: PostCommentAuthorType,
    ) -> str:
        if author_type == PostCommentAuthorType.ADMIN:
            return author_name.removeprefix("@")
        return author_name
