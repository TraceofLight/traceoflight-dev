from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.api.deps import get_project_service
from app.main import app
from app.models.post import PostContentKind, PostStatus, PostVisibility


def _build_project_payload(slug: str) -> dict[str, object]:
    now = datetime.now(timezone.utc)
    return {
        "id": uuid.uuid4(),
        "slug": slug,
        "title": "Project title",
        "excerpt": "project excerpt",
        "body_markdown": "body",
        "cover_image_url": "/media/project-cover.png",
        "series_title": "Rendering Deep Dive",
        "content_kind": PostContentKind.PROJECT,
        "status": PostStatus.PUBLISHED,
        "visibility": PostVisibility.PUBLIC,
        "published_at": now,
        "tags": [{"slug": "graphics", "label": "graphics"}],
        "project_profile": {
            "period_label": "2026.03 - ongoing",
            "role_summary": "Graphics programmer",
            "project_intro": "interactive fluid simulation plugin overview",
            "card_image_url": "/media/project-card.png",
            "detail_media_kind": "youtube",
            "detail_image_url": None,
            "youtube_url": "https://www.youtube.com/watch?v=abcdefghijk",
            "highlights_json": ["Render graph", "Shader toolchain"],
            "resource_links_json": [{"label": "GitHub", "href": "https://github.com/traceoflight"}],
        },
        "related_series_posts": [
            {
                "slug": "graphics-post-1",
                "title": "Graphics Post 1",
                "excerpt": "related",
                "cover_image_url": "/media/related.png",
                "order_index": 1,
                "published_at": now,
                "visibility": PostVisibility.PUBLIC,
            }
        ],
        "created_at": now,
        "updated_at": now,
    }


class _StubProjectService:
    def __init__(self) -> None:
        self.list_called_with: dict[str, object] | None = None
        self.get_called_with: dict[str, object] | None = None

    def list_projects(self, limit=20, offset=0, include_private=False):  # type: ignore[no-untyped-def]
        self.list_called_with = {
            "limit": limit,
            "offset": offset,
            "include_private": include_private,
        }
        return [_build_project_payload("trace-renderer")]

    def get_project_by_slug(self, slug: str, include_private=False):  # type: ignore[no-untyped-def]
        self.get_called_with = {
            "slug": slug,
            "include_private": include_private,
        }
        if slug == "missing":
            return None
        return _build_project_payload(slug)


def _client_with_service(service: _StubProjectService) -> TestClient:
    app.dependency_overrides[get_project_service] = lambda: service
    return TestClient(app)


def test_projects_list_returns_project_only_payload() -> None:
    service = _StubProjectService()
    client = _client_with_service(service)

    response = client.get("/api/v1/projects")

    app.dependency_overrides.clear()
    assert response.status_code == 200
    payload = response.json()
    assert payload[0]["content_kind"] == "project"
    assert payload[0]["project_profile"]["period_label"] == "2026.03 - ongoing"
    assert payload[0]["project_profile"]["project_intro"] == "interactive fluid simulation plugin overview"
    assert service.list_called_with == {
        "limit": 20,
        "offset": 0,
        "include_private": False,
    }


def test_project_detail_includes_profile_and_related_series_posts() -> None:
    service = _StubProjectService()
    client = _client_with_service(service)

    response = client.get("/api/v1/projects/trace-renderer")

    app.dependency_overrides.clear()
    assert response.status_code == 200
    payload = response.json()
    assert payload["content_kind"] == "project"
    assert payload["project_profile"]["detail_media_kind"] == "youtube"
    assert payload["project_profile"]["project_intro"] == "interactive fluid simulation plugin overview"
    assert payload["related_series_posts"][0]["slug"] == "graphics-post-1"
    assert service.get_called_with == {
        "slug": "trace-renderer",
        "include_private": False,
    }


def test_project_detail_allows_uploaded_video_media_payload() -> None:
    service = _StubProjectService()

    def _video_payload(slug: str) -> dict[str, object]:
        payload = _build_project_payload(slug)
        payload["project_profile"]["detail_media_kind"] = "video"  # type: ignore[index]
        payload["project_profile"]["detail_image_url"] = None  # type: ignore[index]
        payload["project_profile"]["youtube_url"] = None  # type: ignore[index]
        payload["project_profile"]["detail_video_url"] = "/media/project-demo.mp4"  # type: ignore[index]
        return payload

    service.get_project_by_slug = lambda slug, include_private=False: _video_payload(slug)  # type: ignore[assignment]
    client = _client_with_service(service)

    response = client.get("/api/v1/projects/trace-renderer")

    app.dependency_overrides.clear()
    assert response.status_code == 200
    payload = response.json()
    assert payload["project_profile"]["detail_media_kind"] == "video"
    assert payload["project_profile"]["detail_video_url"] == "/media/project-demo.mp4"
