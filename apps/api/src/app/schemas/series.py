from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.post import PostVisibility


class SeriesUpsert(BaseModel):
    slug: str = Field(
        description="URL-friendly unique series identifier.",
        json_schema_extra={"example": "fastapi-deep-dive"},
    )
    title: str = Field(
        description="Series title shown in list/detail pages.",
        json_schema_extra={"example": "FastAPI Deep Dive"},
    )
    description: str = Field(
        description="Series summary text.",
        json_schema_extra={"example": "Backend API design and production patterns."},
    )
    cover_image_url: str | None = Field(
        default=None,
        description="Optional cover image URL for series card and detail header.",
        json_schema_extra={"example": "https://traceoflight.dev/media/image/series-cover.jpg"},
    )


class SeriesPostsReplace(BaseModel):
    post_slugs: list[str] = Field(
        default_factory=list,
        description="Ordered post slug list to assign into the series.",
        json_schema_extra={"example": ["fastapi-intro", "fastapi-auth", "fastapi-deploy"]},
    )


class SeriesOrderReplace(BaseModel):
    series_slugs: list[str] = Field(
        default_factory=list,
        description="Ordered series slug list for series archive layout.",
    )


class SeriesPostRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    title: str
    excerpt: str | None
    cover_image_url: str | None
    order_index: int
    published_at: datetime | None
    visibility: PostVisibility


class SeriesRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    title: str
    description: str
    cover_image_url: str | None
    post_count: int = Field(
        description="Number of posts included in current visibility scope.",
    )
    created_at: datetime
    updated_at: datetime


class SeriesDetailRead(SeriesRead):
    posts: list[SeriesPostRead] = Field(default_factory=list)


class PostSeriesContext(BaseModel):
    series_slug: str = Field(description="Owning series slug.")
    series_title: str = Field(description="Owning series title.")
    order_index: int = Field(description="Current post order inside the series.")
    total_posts: int = Field(description="Total visible posts inside the series.")
    prev_post_slug: str | None = Field(default=None, description="Previous post slug within series.")
    prev_post_title: str | None = Field(default=None, description="Previous post title within series.")
    next_post_slug: str | None = Field(default=None, description="Next post slug within series.")
    next_post_title: str | None = Field(default=None, description="Next post title within series.")
