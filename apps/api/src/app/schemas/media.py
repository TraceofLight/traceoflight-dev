from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.media import AssetKind


class MediaCreate(BaseModel):
    kind: AssetKind
    original_filename: str
    mime_type: str
    object_key: str
    size_bytes: int = 0


class MediaRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: AssetKind
    bucket: str
    object_key: str
    original_filename: str
    mime_type: str
    size_bytes: int
    width: int | None
    height: int | None
    duration_seconds: int | None
    owner_post_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class MediaUploadRequest(BaseModel):
    kind: AssetKind
    filename: str
    mime_type: str


class MediaUploadResponse(BaseModel):
    object_key: str
    bucket: str
    upload_url: str
    expires_in_seconds: int