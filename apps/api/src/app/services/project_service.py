from __future__ import annotations

from app.models.post import PostContentKind, PostStatus, PostVisibility
from app.repositories.post_repository import PostRepository
from app.repositories.series_repository import SeriesRepository


class ProjectService:
    def __init__(self, post_repo: PostRepository, series_repo: SeriesRepository) -> None:
        self.post_repo = post_repo
        self.series_repo = series_repo

    def list_projects(self, limit: int = 20, offset: int = 0, include_private: bool = False):
        status = None if include_private else PostStatus.PUBLISHED
        visibility = None if include_private else PostVisibility.PUBLIC
        return self.post_repo.list(
            limit=limit,
            offset=offset,
            status=status,
            visibility=visibility,
            content_kind=PostContentKind.PROJECT,
        )

    def get_project_by_slug(self, slug: str, include_private: bool = False):
        status = None if include_private else PostStatus.PUBLISHED
        visibility = None if include_private else PostVisibility.PUBLIC
        project = self.post_repo.get_by_slug(
            slug=slug,
            status=status,
            visibility=visibility,
            content_kind=PostContentKind.PROJECT,
        )
        if project is None:
            return None

        related_series_posts: list[dict[str, object]] = []
        series_context = getattr(project, "series_context", None)
        series_slug = series_context.get("series_slug") if isinstance(series_context, dict) else None
        if isinstance(series_slug, str) and series_slug.strip():
            series = self.series_repo.get_by_slug(series_slug.strip(), include_private=include_private)
            if series is not None:
                related_series_posts = list(series.get("posts") or [])

        setattr(project, "related_series_posts", related_series_posts)
        return project
