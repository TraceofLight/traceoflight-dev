from __future__ import annotations

from pydantic import BaseModel, Field


class SiteProfileRead(BaseModel):
    email: str = Field(
        min_length=3,
        max_length=255,
        description="Footer email address used for the mailto link.",
    )
    github_url: str = Field(
        min_length=8,
        max_length=500,
        description="Footer GitHub URL used for the GitHub icon link.",
    )


class SiteProfileUpdateRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    github_url: str = Field(min_length=8, max_length=500)
