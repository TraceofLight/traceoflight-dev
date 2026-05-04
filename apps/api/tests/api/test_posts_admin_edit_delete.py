from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from app.api import security as security_module
from app.api.deps import get_post_service
from app.main import app
from app.models.post import PostStatus, PostVisibility


def _build_post_payload(
    slug: str,
    status: PostStatus = PostStatus.DRAFT,
    visibility: PostVisibility = PostVisibility.PUBLIC,
) -> dict[str, object]:
    now = datetime.now(timezone.utc)
    return {
        "id": uuid.uuid4(),
        "slug": slug,
        "title": "Post title",
        "excerpt": "excerpt",
        "body_markdown": "body",
        "cover_image_url": None,
        "status": status,
        "visibility": visibility,
        "locale": "ko",
        "translation_group_id": uuid.uuid4(),
        "source_post_id": None,
        "published_at": now if status == PostStatus.PUBLISHED else None,
        "tags": [],
        "created_at": now,
        "updated_at": now,
    }


def _build_update_request_payload(slug: str) -> dict[str, object]:
    return {
        "slug": slug,
        "title": "Updated title",
        "excerpt": "updated excerpt",
        "body_markdown": "updated body",
        "cover_image_url": None,
        "top_media_kind": "video",
        "top_media_image_url": None,
        "top_media_youtube_url": None,
        "top_media_video_url": "/media/project-demo.mp4",
        "content_kind": "project",
        "series_title": "Rendering Deep Dive",
        "status": "draft",
        "visibility": "private",
        "published_at": None,
        "tags": ["fastapi"],
        "project_profile": {
            "period_label": "2026.03 - ongoing",
            "role_summary": "Graphics programmer",
            "project_intro": "interactive fluid simulation plugin overview",
            "card_image_url": "/media/project-card.png",
            "highlights": ["Render graph"],
            "resource_links": [{"label": "GitHub", "href": "https://github.com/traceoflight"}],
        },
    }


class _StubPostService:
    def __init__(self) -> None:
        self.update_called_with: tuple[str, object] | None = None
        self.delete_called_with: tuple[str, object, object] | None = None
        self.update_result = _build_post_payload("updated-slug", PostStatus.DRAFT, PostVisibility.PRIVATE)
        self.update_conflict = False
        self.delete_result = True

    def update_post_by_slug(self, slug: str, payload):  # type: ignore[no-untyped-def]
        self.update_called_with = (slug, payload)
        if self.update_conflict:
            raise IntegrityError(
                statement="update posts",
                params={},
                orig=Exception("ix_posts_slug"),
            )
        return self.update_result

    def delete_post_by_slug(self, slug: str, status=None, visibility=None):  # type: ignore[no-untyped-def]
        self.delete_called_with = (slug, status, visibility)
        return self.delete_result


def _client_with_service(service: _StubPostService) -> TestClient:
    app.dependency_overrides[get_post_service] = lambda: service
    return TestClient(app)


def test_admin_update_delete_require_internal_secret(monkeypatch) -> None:
    monkeypatch.setattr(security_module.settings, "internal_api_secret", "test-shared-secret")
    service = _StubPostService()
    client = _client_with_service(service)

    payload = _build_update_request_payload("updated-slug")
    update_response = client.put("/api/v1/web-service/posts/original-slug", json=payload)
    delete_response = client.delete("/api/v1/web-service/posts/original-slug")

    app.dependency_overrides.clear()
    assert update_response.status_code == 401
    assert delete_response.status_code == 401
    assert service.update_called_with is None
    assert service.delete_called_with is None


def test_admin_update_allows_internal_secret_and_uses_path_slug(monkeypatch) -> None:
    monkeypatch.setattr(security_module.settings, "internal_api_secret", "test-shared-secret")
    service = _StubPostService()
    client = _client_with_service(service)

    payload = _build_update_request_payload("renamed-slug")
    response = client.put(
        "/api/v1/web-service/posts/original-slug",
        json=payload,
        headers={"x-internal-api-secret": "test-shared-secret"},
    )

    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert service.update_called_with is not None
    assert service.update_called_with[0] == "original-slug"
    assert response.json()["slug"] == "updated-slug"
    assert response.json()["visibility"] == "private"


def test_admin_update_accepts_project_video_payload(monkeypatch) -> None:
    monkeypatch.setattr(security_module.settings, "internal_api_secret", "test-shared-secret")
    service = _StubPostService()
    client = _client_with_service(service)

    payload = _build_update_request_payload("renamed-slug")
    response = client.put(
        "/api/v1/web-service/posts/original-slug",
        json=payload,
        headers={"x-internal-api-secret": "test-shared-secret"},
    )

    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert service.update_called_with is not None
    submitted_payload = service.update_called_with[1]
    assert submitted_payload.top_media_kind.value == "video"
    assert submitted_payload.top_media_video_url == "/media/project-demo.mp4"
    assert submitted_payload.project_profile.project_intro == "interactive fluid simulation plugin overview"


def test_admin_update_returns_409_on_slug_conflict(monkeypatch) -> None:
    monkeypatch.setattr(security_module.settings, "internal_api_secret", "test-shared-secret")
    service = _StubPostService()
    service.update_conflict = True
    client = _client_with_service(service)

    payload = _build_update_request_payload("duplicated-slug")
    response = client.put(
        "/api/v1/web-service/posts/original-slug",
        json=payload,
        headers={"x-internal-api-secret": "test-shared-secret"},
    )

    app.dependency_overrides.clear()
    assert response.status_code == 409
    assert response.json()["detail"] == "post slug already exists"


def test_admin_delete_allows_internal_secret_and_returns_404_when_missing(monkeypatch) -> None:
    monkeypatch.setattr(security_module.settings, "internal_api_secret", "test-shared-secret")
    service = _StubPostService()
    service.delete_result = False
    client = _client_with_service(service)

    response = client.delete(
        "/api/v1/web-service/posts/missing-slug",
        headers={"x-internal-api-secret": "test-shared-secret"},
    )

    app.dependency_overrides.clear()
    assert response.status_code == 404
    assert service.delete_called_with is not None
    assert service.delete_called_with[0] == "missing-slug"
