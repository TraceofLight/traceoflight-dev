from __future__ import annotations

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

DEFAULT_SITE_PROFILE_KEY = "default"


class SiteProfile(Base, TimestampMixin):
    __tablename__ = "site_profiles"

    key: Mapped[str] = mapped_column(String(40), primary_key=True, default=DEFAULT_SITE_PROFILE_KEY)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    github_url: Mapped[str] = mapped_column(String(500), nullable=False)
