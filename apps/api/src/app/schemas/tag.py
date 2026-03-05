from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class TagCreate(BaseModel):
    slug: str = Field(
        description="URL-safe unique tag slug.",
        json_schema_extra={"example": "fastapi"},
    )
    label: str = Field(
        description="Display label rendered in UI chips.",
        json_schema_extra={"example": "FastAPI"},
    )


class TagUpdate(BaseModel):
    slug: str | None = Field(
        default=None,
        description="Optional replacement slug.",
        json_schema_extra={"example": "fastapi"},
    )
    label: str | None = Field(
        default=None,
        description="Optional replacement display label.",
        json_schema_extra={"example": "FastAPI"},
    )


class TagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    label: str
