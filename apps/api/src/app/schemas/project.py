from __future__ import annotations

from pydantic import Field

from app.schemas.post import PostRead, ProjectProfileRead
from app.schemas.series import SeriesPostRead


class ProjectRead(PostRead):
    project_profile: ProjectProfileRead
    related_series_posts: list[SeriesPostRead] = Field(default_factory=list)
