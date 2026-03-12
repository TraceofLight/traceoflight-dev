from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.post import Post


class PostCommentAuthorType(str, enum.Enum):
    GUEST = "guest"
    ADMIN = "admin"


class PostCommentVisibility(str, enum.Enum):
    PUBLIC = "public"
    PRIVATE = "private"


class PostCommentStatus(str, enum.Enum):
    ACTIVE = "active"
    DELETED = "deleted"


def _enum_values(enum_cls: type[enum.Enum]) -> list[str]:
    return [member.value for member in enum_cls]


class PostComment(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "post_comments"

    post_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("posts.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    root_comment_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("post_comments.id", ondelete="CASCADE"),
        index=True,
        nullable=True,
    )
    reply_to_comment_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("post_comments.id", ondelete="CASCADE"),
        index=True,
        nullable=True,
    )
    author_name: Mapped[str] = mapped_column(String(80), nullable=False)
    author_type: Mapped[PostCommentAuthorType] = mapped_column(
        Enum(
            PostCommentAuthorType,
            name="post_comment_author_type",
            values_callable=_enum_values,
        ),
        nullable=False,
        default=PostCommentAuthorType.GUEST,
    )
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    visibility: Mapped[PostCommentVisibility] = mapped_column(
        Enum(
            PostCommentVisibility,
            name="post_comment_visibility",
            values_callable=_enum_values,
        ),
        index=True,
        nullable=False,
        default=PostCommentVisibility.PUBLIC,
    )
    status: Mapped[PostCommentStatus] = mapped_column(
        Enum(
            PostCommentStatus,
            name="post_comment_status",
            values_callable=_enum_values,
        ),
        index=True,
        nullable=False,
        default=PostCommentStatus.ACTIVE,
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    request_ip_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    user_agent_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)

    post: Mapped["Post"] = relationship("Post", back_populates="comments")
    root_comment: Mapped["PostComment | None"] = relationship(
        "PostComment",
        remote_side="PostComment.id",
        foreign_keys=[root_comment_id],
    )
    reply_to_comment: Mapped["PostComment | None"] = relationship(
        "PostComment",
        remote_side="PostComment.id",
        foreign_keys=[reply_to_comment_id],
    )
