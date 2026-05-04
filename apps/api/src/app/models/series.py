from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.post import PostLocale, PostTranslationSourceKind, PostTranslationStatus, _enum_values

if TYPE_CHECKING:
    from app.models.post import Post


class Series(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "series"
    __table_args__ = (
        UniqueConstraint("slug", "locale", name="uq_series_slug_locale"),
    )

    slug: Mapped[str] = mapped_column(String(160), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    cover_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    list_order_index: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    locale: Mapped[PostLocale] = mapped_column(
        Enum(PostLocale, name="post_locale", values_callable=_enum_values),
        index=True, nullable=False, default=PostLocale.KO,
    )
    translation_group_id: Mapped[uuid.UUID] = mapped_column(
        index=True, nullable=False, default=uuid.uuid4,
    )
    source_series_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("series.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    translation_status: Mapped[PostTranslationStatus] = mapped_column(
        Enum(PostTranslationStatus, name="post_translation_status", values_callable=_enum_values),
        nullable=False, default=PostTranslationStatus.SOURCE,
    )
    translation_source_kind: Mapped[PostTranslationSourceKind] = mapped_column(
        Enum(PostTranslationSourceKind, name="post_translation_source_kind", values_callable=_enum_values),
        nullable=False, default=PostTranslationSourceKind.MANUAL,
    )
    translated_from_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)

    series_posts: Mapped[list["SeriesPost"]] = relationship(
        "SeriesPost",
        back_populates="series",
        cascade="all, delete-orphan",
        order_by="SeriesPost.order_index",
    )


class SeriesPost(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "series_posts"
    __table_args__ = (
        UniqueConstraint("post_id", name="uq_series_posts_post_id"),
        UniqueConstraint("series_id", "order_index", name="uq_series_posts_series_order"),
    )

    series_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("series.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    post_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("posts.id", ondelete="CASCADE"),
        nullable=False,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)

    series: Mapped["Series"] = relationship("Series", back_populates="series_posts")
    post: Mapped["Post"] = relationship("Post", back_populates="series_post")
