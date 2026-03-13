from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.api.deps import get_post_service
from app.main import app
from app.models.post import PostContentKind, PostStatus, PostVisibility


class _StubPostService:
    def __init__(self) -> None:
        self.summary_call: dict[str, object] | None = None

    def list_post_summaries(  # type: ignore[no-untyped-def]
        self,
        limit=20,
        offset=0,
        status=None,
        visibility=None,
        tags=None,
        tag_match="any",
        query=None,
        content_kind=None,
        sort="latest",
    ):
        self.summary_call = {
            "limit": limit,
            "offset": offset,
            "status": status,
            "visibility": visibility,
            "tags": tags,
            "tag_match": tag_match,
            "query": query,
            "content_kind": content_kind,
            "sort": sort,
        }
        now = datetime.now(timezone.utc)
        return {
            "items": [
                {
                    "id": "20b17431-9af1-4347-af16-2a6dd0f1306d",
                    "slug": "summary-post",
                    "title": "Summary Post",
                    "excerpt": "summary",
                    "cover_image_url": None,
                    "top_media_kind": "image",
                    "top_media_image_url": None,
                    "top_media_youtube_url": None,
                    "top_media_video_url": None,
                    "series_title": None,
                    "content_kind": "blog",
                    "status": "published",
                    "visibility": "public",
                    "published_at": now.isoformat(),
                    "reading_label": "1 min read",
                    "tags": [{"slug": "astro", "label": "astro"}],
                    "comment_count": 3,
                    "created_at": now.isoformat(),
                    "updated_at": now.isoformat(),
                }
            ],
            "total_count": 1,
            "next_offset": None,
            "has_more": False,
            "tag_filters": [{"slug": "astro", "count": 1}],
        }


def test_posts_summary_endpoint_returns_list_metadata_without_body_markdown() -> None:
    service = _StubPostService()
    app.dependency_overrides[get_post_service] = lambda: service
    client = TestClient(app)

    response = client.get("/api/v1/posts/summary?limit=12&offset=24&query=astro&tag=astro")

    app.dependency_overrides.clear()
    assert response.status_code == 200
    payload = response.json()
    assert "items" in payload
    assert payload["total_count"] == 1
    assert payload["has_more"] is False
    assert payload["tag_filters"] == [{"slug": "astro", "count": 1}]
    assert "body_markdown" not in payload["items"][0]
    assert service.summary_call is not None
    assert service.summary_call["limit"] == 12
    assert service.summary_call["offset"] == 24
    assert service.summary_call["status"] == PostStatus.PUBLISHED
    assert service.summary_call["visibility"] == PostVisibility.PUBLIC
    assert service.summary_call["query"] == "astro"
    assert service.summary_call["sort"] == "latest"


def test_posts_summary_endpoint_accepts_content_kind_query() -> None:
    service = _StubPostService()
    app.dependency_overrides[get_post_service] = lambda: service
    client = TestClient(app)

    response = client.get("/api/v1/posts/summary?content_kind=blog")

    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert service.summary_call is not None
    assert service.summary_call["content_kind"] == PostContentKind.BLOG
