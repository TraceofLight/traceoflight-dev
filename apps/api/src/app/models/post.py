from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.series import SeriesPost
    from app.models.tag import PostTag, Tag


class PostStatus(str, enum.Enum):
    DRAFT = 'draft'
    PUBLISHED = 'published'
    ARCHIVED = 'archived'


class PostVisibility(str, enum.Enum):
    PUBLIC = 'public'
    PRIVATE = 'private'


def _enum_values(enum_cls: type[enum.Enum]) -> list[str]:
    return [member.value for member in enum_cls]


class Post(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = 'posts'

    slug: Mapped[str] = mapped_column(String(160), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    excerpt: Mapped[str | None] = mapped_column(String(400), nullable=True)
    body_markdown: Mapped[str] = mapped_column(Text, nullable=False)
    cover_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[PostStatus] = mapped_column(
        Enum(PostStatus, name='post_status', values_callable=_enum_values),
        index=True,
        default=PostStatus.DRAFT,
    )
    visibility: Mapped[PostVisibility] = mapped_column(
        Enum(PostVisibility, name='post_visibility', values_callable=_enum_values),
        index=True,
        default=PostVisibility.PUBLIC,
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    post_tags: Mapped[list["PostTag"]] = relationship(
        "PostTag",
        back_populates="post",
        cascade="all, delete-orphan",
        overlaps="posts,tags",
    )
    tags: Mapped[list["Tag"]] = relationship(
        "Tag",
        secondary="post_tags",
        back_populates="posts",
        overlaps="post_tags,post,tag",
        order_by="Tag.slug",
    )
    series_post: Mapped["SeriesPost | None"] = relationship(
        "SeriesPost",
        back_populates="post",
        uselist=False,
        cascade="all, delete-orphan",
    )
