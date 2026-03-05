from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.post import PostStatus, PostVisibility


class PostCreate(BaseModel):
    slug: str = Field(
        description='URL-friendly unique post identifier.',
        json_schema_extra={'example': 'my-first-post'},
    )
    title: str = Field(
        description='Human-readable post title.',
        json_schema_extra={'example': 'My First Post'},
    )
    excerpt: str | None = Field(
        default=None,
        description='Short summary shown in post lists.',
        json_schema_extra={'example': 'A short teaser for the post.'},
    )
    body_markdown: str = Field(
        description='Markdown source body for the post.',
        json_schema_extra={'example': '# Heading\n\nPost body in markdown.'},
    )
    cover_image_url: str | None = Field(
        default=None,
        description='Optional cover image URL rendered for post cards and detail pages.',
        json_schema_extra={'example': 'https://cdn.traceoflight.dev/images/my-first-post-cover.jpg'},
    )
    status: PostStatus = Field(
        default=PostStatus.DRAFT,
        description='Publication status lifecycle of the post.',
        json_schema_extra={'example': 'draft'},
    )
    visibility: PostVisibility = Field(
        default=PostVisibility.PUBLIC,
        description='Audience visibility of the post content.',
        json_schema_extra={'example': 'public'},
    )
    published_at: datetime | None = Field(
        default=None,
        description='Publication timestamp in UTC. Null for unpublished drafts.',
        json_schema_extra={'example': '2026-03-05T09:00:00Z'},
    )


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
