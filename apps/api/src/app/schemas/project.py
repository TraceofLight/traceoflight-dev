from __future__ import annotations

from pydantic import Field
from pydantic import BaseModel

from app.schemas.post import PostRead, ProjectProfileRead
from app.schemas.series import SeriesPostRead


class ProjectRead(PostRead):
    project_profile: ProjectProfileRead
    related_series_posts: list[SeriesPostRead] = Field(default_factory=list)


class ProjectsOrderReplace(BaseModel):
    project_slugs: list[str] = Field(
        default_factory=list,
        description="Ordered project slug list for projects archive layout.",
    )
