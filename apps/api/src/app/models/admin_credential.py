from __future__ import annotations

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

OPERATIONAL_ADMIN_CREDENTIAL_KEY = "operational-admin"


class AdminCredential(Base, TimestampMixin):
    __tablename__ = "admin_credentials"

    key: Mapped[str] = mapped_column(String(40), primary_key=True, default=OPERATIONAL_ADMIN_CREDENTIAL_KEY)
    login_id: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    credential_revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
