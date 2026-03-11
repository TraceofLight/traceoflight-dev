from __future__ import annotations

from app.models.post import PostContentKind
from app.services.project_service import ProjectService


class _ProjectStub:
    def __init__(self, slug: str, series_title: str | None) -> None:
        self.slug = slug
        self.series_title = series_title


class _PostRepoStub:
    def __init__(self, project: _ProjectStub | None) -> None:
        self.project = project

    def get_by_slug(self, **kwargs):  # type: ignore[no-untyped-def]
        return self.project


class _SeriesRepoStub:
    def __init__(self) -> None:
        self.called_with: tuple[str, bool] | None = None

    def get_by_slug(self, slug: str, include_private: bool = False):  # type: ignore[no-untyped-def]
        self.called_with = (slug, include_private)
        return {
            "slug": slug,
            "title": "Rendering Deep Dive",
            "description": "series",
            "cover_image_url": None,
            "post_count": 2,
            "posts": [
                {
                    "slug": "project-entry",
                    "title": "Project Entry",
                    "excerpt": "should be filtered",
                    "cover_image_url": None,
                    "order_index": 1,
                    "published_at": None,
                    "visibility": "public",
                    "content_kind": PostContentKind.PROJECT,
                },
                {
                    "slug": "blog-entry",
                    "title": "Blog Entry",
                    "excerpt": "keep this",
                    "cover_image_url": None,
                    "order_index": 2,
                    "published_at": None,
                    "visibility": "public",
                    "content_kind": PostContentKind.BLOG,
                },
            ],
        }


def test_project_service_resolves_related_series_by_series_title_and_filters_self() -> None:
    post_repo = _PostRepoStub(_ProjectStub(slug="project-entry", series_title="Rendering Deep Dive"))
    series_repo = _SeriesRepoStub()
    service = ProjectService(post_repo=post_repo, series_repo=series_repo)

    project = service.get_project_by_slug("project-entry")

    assert project is not None
    assert series_repo.called_with == ("Rendering-Deep-Dive", False)
    assert getattr(project, "related_series_posts") == [
        {
            "slug": "blog-entry",
            "title": "Blog Entry",
            "excerpt": "keep this",
            "cover_image_url": None,
            "order_index": 2,
            "published_at": None,
            "visibility": "public",
            "content_kind": PostContentKind.BLOG,
        }
    ]


def test_project_service_skips_related_series_lookup_without_series_title() -> None:
    post_repo = _PostRepoStub(_ProjectStub(slug="project-entry", series_title=None))
    series_repo = _SeriesRepoStub()
    service = ProjectService(post_repo=post_repo, series_repo=series_repo)

    project = service.get_project_by_slug("project-entry")

    assert project is not None
    assert series_repo.called_with is None
    assert getattr(project, "related_series_posts") == []
