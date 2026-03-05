from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.post import Post


class PostTag(Base):
    __tablename__ = "post_tags"

    post_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("posts.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    tag_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tags.id"),
        primary_key=True,
        nullable=False,
    )

    post: Mapped["Post"] = relationship(
        "Post",
        back_populates="post_tags",
        overlaps="posts,tags",
    )
    tag: Mapped["Tag"] = relationship(
        "Tag",
        back_populates="post_tags",
        overlaps="posts,tags",
    )


class Tag(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "tags"

    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    label: Mapped[str] = mapped_column(String(80), nullable=False)

    post_tags: Mapped[list[PostTag]] = relationship(
        PostTag,
        back_populates="tag",
        cascade="all, delete-orphan",
        overlaps="posts,tags",
    )
    posts: Mapped[list["Post"]] = relationship(
        "Post",
        secondary="post_tags",
        back_populates="tags",
        overlaps="post_tags,post,tag",
    )
