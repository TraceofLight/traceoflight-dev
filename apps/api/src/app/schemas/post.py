from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.post import (
    PostContentKind,
    PostStatus,
    PostTopMediaKind,
    PostVisibility,
)
from app.schemas.series import PostSeriesContext
from app.schemas.tag import TagRead


class ProjectResourceLink(BaseModel):
    label: str
    href: str


class ProjectProfilePayload(BaseModel):
    period_label: str
    role_summary: str
    project_intro: str | None = None
    card_image_url: str
    highlights: list[str] = Field(default_factory=list)
    resource_links: list[ProjectResourceLink] = Field(default_factory=list)


class ProjectProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    period_label: str
    role_summary: str
    project_intro: str | None = None
    card_image_url: str
    highlights_json: list[str] = Field(default_factory=list)
    resource_links_json: list[ProjectResourceLink] = Field(default_factory=list)


class PostTagFilterRead(BaseModel):
    slug: str
    count: int


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
        description='Optional thumbnail image URL rendered for post cards and OG metadata.',
        json_schema_extra={'example': 'https://cdn.traceoflight.dev/images/my-first-post-cover.jpg'},
    )
    top_media_kind: PostTopMediaKind = Field(
        default=PostTopMediaKind.IMAGE,
        description='Shared top media kind rendered at the top of detail pages.',
    )
    top_media_image_url: str | None = Field(
        default=None,
        description='Optional top image URL for detail pages when top_media_kind=image.',
    )
    top_media_youtube_url: str | None = Field(
        default=None,
        description='Optional YouTube URL for detail pages when top_media_kind=youtube.',
    )
    top_media_video_url: str | None = Field(
        default=None,
        description='Optional uploaded video URL for detail pages when top_media_kind=video.',
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


class _PostBase(BaseModel):
    """Common fields shared by PostRead and PostSummaryRead.

    Lives as a private base so the two response schemas can stay
    distinct types (and thus distinct OpenAPI components / response
    models) while sharing one field definition.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    title: str
    excerpt: str | None
    cover_image_url: str | None
    top_media_kind: PostTopMediaKind = Field(default=PostTopMediaKind.IMAGE)
    top_media_image_url: str | None = None
    top_media_youtube_url: str | None = None
    top_media_video_url: str | None = None
    series_title: str | None = None
    content_kind: PostContentKind = Field(default=PostContentKind.BLOG)
    status: PostStatus
    visibility: PostVisibility
    published_at: datetime | None
    tags: list[TagRead] = Field(
        default_factory=list,
        description='Normalized tag objects assigned to this post.',
    )
    comment_count: int = Field(
        default=0,
        description='Total comments linked to this post.',
    )
    created_at: datetime
    updated_at: datetime


class PostRead(_PostBase):
    body_markdown: str
    series_context: PostSeriesContext | None = Field(
        default=None,
        description='Optional in-series projection used by post detail navigation.',
    )
    project_profile: ProjectProfileRead | None = Field(
        default=None,
        description='Optional project metadata used by /projects surfaces.',
    )


class PostSummaryRead(_PostBase):
    reading_label: str = Field(
        description='Estimated reading-time label derived from markdown content.',
    )


class PostVisibilityCountsRead(BaseModel):
    all: int = 0
    public: int = 0
    private: int = 0


class PostSummaryListRead(BaseModel):
    items: list[PostSummaryRead] = Field(default_factory=list)
    total_count: int
    next_offset: int | None
    has_more: bool
    tag_filters: list[PostTagFilterRead] = Field(default_factory=list)
    visibility_counts: PostVisibilityCountsRead = Field(
        default_factory=PostVisibilityCountsRead,
    )
