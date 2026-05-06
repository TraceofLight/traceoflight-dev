from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPrimaryKeyMixin
from app.models.post import PostLocale, _enum_values


class PostSlugRedirect(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "post_slug_redirects"
    __table_args__ = (
        UniqueConstraint("locale", "old_slug", name="uq_post_slug_redirects_locale_old_slug"),
    )

    locale: Mapped[PostLocale] = mapped_column(
        Enum(PostLocale, name="post_locale", values_callable=_enum_values),
        nullable=False,
    )
    old_slug: Mapped[str] = mapped_column(String(160), nullable=False)
    target_post_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("posts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    last_hit_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    hit_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class SeriesSlugRedirect(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "series_slug_redirects"
    __table_args__ = (
        UniqueConstraint("locale", "old_slug", name="uq_series_slug_redirects_locale_old_slug"),
    )

    locale: Mapped[PostLocale] = mapped_column(
        Enum(PostLocale, name="post_locale", values_callable=_enum_values),
        nullable=False,
    )
    old_slug: Mapped[str] = mapped_column(String(160), nullable=False)
    target_series_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("series.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    last_hit_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    hit_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
