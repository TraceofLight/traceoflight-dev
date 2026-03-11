from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.post import PostContentKind, PostStatus, PostVisibility
from app.models.project_profile import ProjectDetailMediaKind
from app.schemas.series import PostSeriesContext
from app.schemas.tag import TagRead


class ProjectResourceLink(BaseModel):
    label: str
    href: str


class ProjectProfilePayload(BaseModel):
    period_label: str
    role_summary: str
    card_image_url: str
    detail_media_kind: ProjectDetailMediaKind
    detail_image_url: str | None = None
    youtube_url: str | None = None
    highlights: list[str] = Field(default_factory=list)
    resource_links: list[ProjectResourceLink] = Field(default_factory=list)


class ProjectProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    period_label: str
    role_summary: str
    card_image_url: str
    detail_media_kind: ProjectDetailMediaKind
    detail_image_url: str | None
    youtube_url: str | None
    highlights_json: list[str] = Field(default_factory=list)
    resource_links_json: list[ProjectResourceLink] = Field(default_factory=list)


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
    series_title: str | None = Field(
        default=None,
        description='Optional series title selected in writer publish settings.',
        json_schema_extra={'example': 'FastAPI Deep Dive'},
    )
    content_kind: PostContentKind = Field(
        default=PostContentKind.BLOG,
        description='Content kind used to separate blog posts from project posts.',
        json_schema_extra={'example': 'blog'},
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
    tags: list[str] = Field(
        default_factory=list,
        description='Tag slug list assigned to this post.',
        json_schema_extra={'example': ['fastapi', 'astro']},
    )
    project_profile: ProjectProfilePayload | None = Field(
        default=None,
        description='Project-only metadata. Required when content_kind=project.',
    )


class PostRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    title: str
    excerpt: str | None
    body_markdown: str
    cover_image_url: str | None
    series_title: str | None = None
    content_kind: PostContentKind = Field(default=PostContentKind.BLOG)
    status: PostStatus
    visibility: PostVisibility
    published_at: datetime | None
    tags: list[TagRead] = Field(
        default_factory=list,
        description='Normalized tag objects assigned to this post.',
    )
    series_context: PostSeriesContext | None = Field(
        default=None,
        description='Optional in-series projection used by post detail navigation.',
    )
    project_profile: ProjectProfileRead | None = Field(
        default=None,
        description='Optional project metadata used by /projects surfaces.',
    )
    created_at: datetime
    updated_at: datetime
