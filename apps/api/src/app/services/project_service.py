from __future__ import annotations

from app.core.text import normalize_optional_text
from app.models.post import PostContentKind, PostLocale, PostStatus, PostVisibility
from app.repositories.post_repository import PostRepository
from app.repositories.series_repository import SeriesRepository


def _slugify_series_title(title: str) -> str:
    chars: list[str] = []
    last_was_dash = False
    for char in title.strip():
        if char.isalnum():
            chars.append(char)
            last_was_dash = False
            continue
        if last_was_dash:
            continue
        chars.append("-")
        last_was_dash = True
    normalized = "".join(chars).strip("-")
    return normalized or "series"


class ProjectService:
    def __init__(self, post_repo: PostRepository, series_repo: SeriesRepository) -> None:
        self.post_repo = post_repo
        self.series_repo = series_repo

    def list_projects(
        self,
        limit: int = 20,
        offset: int = 0,
        include_private: bool = False,
        locale: PostLocale | None = None,
    ):
        status = None if include_private else PostStatus.PUBLISHED
        visibility = None if include_private else PostVisibility.PUBLIC
        return self.post_repo.list(
            limit=limit,
            offset=offset,
            status=status,
            visibility=visibility,
            content_kind=PostContentKind.PROJECT,
            locale=locale,
        )

    def get_project_by_slug(
        self,
        slug: str,
        include_private: bool = False,
        locale: PostLocale | None = None,
    ):
        status = None if include_private else PostStatus.PUBLISHED
        visibility = None if include_private else PostVisibility.PUBLIC
        project = self.post_repo.get_by_slug(
            slug=slug,
            status=status,
            visibility=visibility,
            content_kind=PostContentKind.PROJECT,
            locale=locale,
        )
        if project is None:
            return None

        related_series_posts: list[dict[str, object]] = []
        series_title = normalize_optional_text(getattr(project, "series_title", None))
        if series_title is not None:
            series_slug = _slugify_series_title(series_title)
            series = self.series_repo.get_by_slug(series_slug, include_private=include_private)
            if series is not None:
                related_series_posts = [
                    row
                    for row in list(series.get("posts") or [])
                    if row.get("slug") != getattr(project, "slug", None)
                ]

        setattr(project, "related_series_posts", related_series_posts)
        return project

    def replace_project_order(self, project_slugs: list[str]):
        result = self.post_repo.replace_project_order(project_slugs)
        self.post_repo.db.commit()
        return result
