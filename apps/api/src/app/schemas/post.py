from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.post import PostStatus, PostVisibility


class PostCreate(BaseModel):
    slug: str
    title: str
    excerpt: str | None = None
    body_markdown: str
    cover_image_url: str | None = None
    status: PostStatus = PostStatus.DRAFT
    visibility: PostVisibility = PostVisibility.PUBLIC
    published_at: datetime | None = None


class PostRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    title: str
    excerpt: str | None
    body_markdown: str
    cover_image_url: str | None
    status: PostStatus
    visibility: PostVisibility
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime
