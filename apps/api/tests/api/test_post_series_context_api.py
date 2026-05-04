from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.api.deps import get_post_service
from app.main import app
from app.models.post import PostStatus, PostVisibility


def _build_post_payload(slug: str) -> dict[str, object]:
    now = datetime.now(timezone.utc)
    return {
        "id": uuid.uuid4(),
        "slug": slug,
        "title": "Post title",
        "excerpt": "excerpt",
        "body_markdown": "body",
        "cover_image_url": None,
        "status": PostStatus.PUBLISHED,
        "visibility": PostVisibility.PUBLIC,
        "locale": "ko",
        "translation_group_id": uuid.uuid4(),
        "source_post_id": None,
        "published_at": now,
        "tags": [],
        "series_context": {
            "series_slug": "my-series",
            "series_title": "My series",
            "order_index": 2,
            "total_posts": 3,
            "prev_post_slug": "first-post",
            "prev_post_title": "First post",
            "next_post_slug": "third-post",
            "next_post_title": "Third post",
        },
        "created_at": now,
        "updated_at": now,
    }


class _StubPostService:
    def get_post_by_slug(self, slug: str, status=None, visibility=None, locale=None, content_kind=None):  # type: ignore[no-untyped-def]
        del status, visibility, locale, content_kind
        if slug == "missing":
            return None
        return _build_post_payload(slug)


def _client_with_service(service: _StubPostService) -> TestClient:
    app.dependency_overrides[get_post_service] = lambda: service
    return TestClient(app)


def test_post_read_includes_series_context_projection() -> None:
    service = _StubPostService()
    client = _client_with_service(service)

    response = client.get("/api/v1/web-service/posts/with-series")

    app.dependency_overrides.clear()
    assert response.status_code == 200
    payload = response.json()
    assert "series_context" in payload
    assert payload["series_context"]["series_slug"] == "my-series"
    assert payload["series_context"]["order_index"] == 2


def test_openapi_documents_post_series_context_schema() -> None:
    client = TestClient(app)
    response = client.get("/openapi.json")
    assert response.status_code == 200

    schema = response.json()
    post_read_properties = schema["components"]["schemas"]["PostRead"]["properties"]
    assert "series_context" in post_read_properties
