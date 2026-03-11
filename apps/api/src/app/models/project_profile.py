from __future__ import annotations

import enum
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.post import Post


def _enum_values(enum_cls: type[enum.Enum]) -> list[str]:
    return [member.value for member in enum_cls]


class ProjectDetailMediaKind(str, enum.Enum):
    IMAGE = "image"
    YOUTUBE = "youtube"
    VIDEO = "video"


class ProjectProfile(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "project_profiles"

    post_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("posts.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    period_label: Mapped[str] = mapped_column(String(120), nullable=False)
    role_summary: Mapped[str] = mapped_column(String(300), nullable=False)
    project_intro: Mapped[str | None] = mapped_column(Text, nullable=True)
    card_image_url: Mapped[str] = mapped_column(String(500), nullable=False)
    detail_media_kind: Mapped[ProjectDetailMediaKind] = mapped_column(
        Enum(ProjectDetailMediaKind, name="project_detail_media_kind", values_callable=_enum_values),
        nullable=False,
        default=ProjectDetailMediaKind.IMAGE,
    )
    detail_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    youtube_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    detail_video_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    highlights_json: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    resource_links_json: Mapped[list[dict[str, str]]] = mapped_column(JSON, nullable=False, default=list)

    post: Mapped["Post"] = relationship("Post", back_populates="project_profile")
