from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.media import MediaAsset
from app.schemas.media import MediaCreate


class MediaRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, payload: MediaCreate, bucket: str) -> MediaAsset:
        media = MediaAsset(bucket=bucket, **payload.model_dump())
        self.db.add(media)
        self.db.commit()
        self.db.refresh(media)
        return media