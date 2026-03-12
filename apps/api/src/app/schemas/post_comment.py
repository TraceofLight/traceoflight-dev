from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.post_comment import (
    PostCommentAuthorType,
    PostCommentStatus,
    PostCommentVisibility,
)


class PostCommentCreate(BaseModel):
    author_name: str | None = Field(default=None, max_length=24)
    password: str | None = Field(default=None, min_length=4, max_length=64)
    visibility: PostCommentVisibility = Field(default=PostCommentVisibility.PUBLIC)
    body: str = Field(min_length=2, max_length=2000)
    reply_to_comment_id: uuid.UUID | None = None


class PostCommentUpdate(BaseModel):
    password: str | None = Field(default=None, min_length=4, max_length=64)
    visibility: PostCommentVisibility | None = None
    body: str | None = Field(default=None, min_length=2, max_length=2000)


class PostCommentDelete(BaseModel):
    password: str | None = Field(default=None, min_length=4, max_length=64)


class PostCommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    root_comment_id: uuid.UUID | None = None
    reply_to_comment_id: uuid.UUID | None = None
    author_name: str
    author_type: PostCommentAuthorType
    visibility: PostCommentVisibility
    status: PostCommentStatus
    body: str
    password_hash: str | None = None
    can_reply: bool = True
    reply_to_author_name: str | None = None
    created_at: datetime
    updated_at: datetime


class PostCommentThreadItem(PostCommentRead):
    replies: list[PostCommentRead] = Field(default_factory=list)


class PostCommentThreadList(BaseModel):
    comment_count: int
    items: list[PostCommentThreadItem] = Field(default_factory=list)


class AdminCommentFeedQuery(BaseModel):
    limit: int = Field(default=100, ge=1, le=200)
    offset: int = Field(default=0, ge=0)
    post_slug: str | None = None


class AdminCommentFeedItem(PostCommentRead):
    post_slug: str
    post_title: str
    is_reply: bool


class AdminCommentFeed(BaseModel):
    total_count: int
    items: list[AdminCommentFeedItem] = Field(default_factory=list)
