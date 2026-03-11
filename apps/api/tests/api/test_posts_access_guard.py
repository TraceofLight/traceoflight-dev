from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.api.deps import get_post_service
from app.api.v1.endpoints import posts as posts_endpoint
from app.main import app
from app.models.post import PostContentKind, PostStatus, PostVisibility


def _build_post_payload(
    slug: str,
    status: PostStatus = PostStatus.PUBLISHED,
    visibility: PostVisibility = PostVisibility.PUBLIC,
    content_kind: PostContentKind = PostContentKind.BLOG,
    project_profile: dict[str, object] | None = None,
) -> dict[str, object]:
    now = datetime.now(timezone.utc)
    return {
        'id': uuid.uuid4(),
        'slug': slug,
        'title': 'Post title',
        'excerpt': 'excerpt',
        'body_markdown': 'body',
        'cover_image_url': None,
        'content_kind': content_kind,
        'status': status,
        'visibility': visibility,
        'published_at': now if status == PostStatus.PUBLISHED else None,
        'project_profile': project_profile,
        'created_at': now,
        'updated_at': now,
    }


class _StubPostService:
    def __init__(self) -> None:
        self.list_call: dict[str, object] | None = None
        self.get_call: dict[str, object] | None = None
        self.create_called = False
        self.update_called = False
        self.delete_called = False

    def list_posts(  # type: ignore[no-untyped-def]
        self,
        limit=20,
        offset=0,
        status=None,
        visibility=None,
        tags=None,
        tag_match="any",
    ):
        self.list_call = {
            'limit': limit,
            'offset': offset,
            'status': status,
            'visibility': visibility,
            'tags': tags,
            'tag_match': tag_match,
        }
        return []

    def get_post_by_slug(self, slug: str, status=None, visibility=None):  # type: ignore[no-untyped-def]
        self.get_call = {
            'slug': slug,
            'status': status,
            'visibility': visibility,
        }
        return _build_post_payload(slug=slug)

    def create_post(self, payload):  # type: ignore[no-untyped-def]
        self.create_called = True
        return _build_post_payload(slug=payload.slug, status=payload.status, visibility=payload.visibility)

    def update_post_by_slug(self, slug: str, payload):  # type: ignore[no-untyped-def]
        self.update_called = True
        return _build_post_payload(slug=payload.slug or slug, status=payload.status, visibility=payload.visibility)

    def delete_post_by_slug(self, slug: str, status=None, visibility=None):  # type: ignore[no-untyped-def]
        self.delete_called = True
        return True


def _client_with_service(service: _StubPostService) -> TestClient:
    app.dependency_overrides[get_post_service] = lambda: service
    return TestClient(app)


def test_posts_list_forces_public_filters_without_internal_secret(monkeypatch) -> None:
    monkeypatch.setattr(posts_endpoint.settings, 'internal_api_secret', 'test-shared-secret')
    service = _StubPostService()
    client = _client_with_service(service)

    response = client.get('/api/v1/posts?status=draft&visibility=private')

    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert service.list_call is not None
    assert service.list_call['status'] == PostStatus.PUBLISHED
    assert service.list_call['visibility'] == PostVisibility.PUBLIC


def test_posts_list_respects_filters_with_valid_internal_secret(monkeypatch) -> None:
    monkeypatch.setattr(posts_endpoint.settings, 'internal_api_secret', 'test-shared-secret')
    service = _StubPostService()
    client = _client_with_service(service)

    response = client.get(
        '/api/v1/posts?status=draft&visibility=private',
        headers={'x-internal-api-secret': 'test-shared-secret'},
    )

    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert service.list_call is not None
    assert service.list_call['status'] == PostStatus.DRAFT
    assert service.list_call['visibility'] == PostVisibility.PRIVATE


def test_posts_get_forces_public_filters_without_internal_secret(monkeypatch) -> None:
    monkeypatch.setattr(posts_endpoint.settings, 'internal_api_secret', 'test-shared-secret')
    service = _StubPostService()
    client = _client_with_service(service)

    response = client.get('/api/v1/posts/hidden-post?status=draft&visibility=private')

    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert service.get_call is not None
    assert service.get_call['status'] == PostStatus.PUBLISHED
    assert service.get_call['visibility'] == PostVisibility.PUBLIC


def test_posts_write_requires_internal_secret(monkeypatch) -> None:
    monkeypatch.setattr(posts_endpoint.settings, 'internal_api_secret', 'test-shared-secret')
    service = _StubPostService()
    client = _client_with_service(service)

    payload = {
        'slug': 'private-post',
        'title': 'Private post',
        'excerpt': None,
        'body_markdown': '',
        'cover_image_url': None,
        'status': 'published',
        'visibility': 'private',
        'published_at': None,
    }

    create_response = client.post('/api/v1/posts', json=payload)
    update_response = client.put('/api/v1/posts/private-post', json=payload)
    delete_response = client.delete('/api/v1/posts/private-post')

    app.dependency_overrides.clear()
    assert create_response.status_code == 401
    assert update_response.status_code == 401
    assert delete_response.status_code == 401
    assert service.create_called is False
    assert service.update_called is False
    assert service.delete_called is False


def test_posts_write_allows_valid_internal_secret(monkeypatch) -> None:
    monkeypatch.setattr(posts_endpoint.settings, 'internal_api_secret', 'test-shared-secret')
    service = _StubPostService()
    client = _client_with_service(service)

    payload = {
        'slug': 'private-post',
        'title': 'Private post',
        'excerpt': None,
        'body_markdown': '',
        'cover_image_url': None,
        'status': 'published',
        'visibility': 'private',
        'published_at': None,
    }

    response = client.post(
        '/api/v1/posts',
        json=payload,
        headers={'x-internal-api-secret': 'test-shared-secret'},
    )

    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert service.create_called is True
    assert response.json()['visibility'] == 'private'


def test_posts_write_accepts_project_payload(monkeypatch) -> None:
    monkeypatch.setattr(posts_endpoint.settings, 'internal_api_secret', 'test-shared-secret')
    service = _StubPostService()
    client = _client_with_service(service)

    project_profile = {
        'period_label': '2026.03 - ongoing',
        'role_summary': 'Graphics programmer',
        'card_image_url': 'https://example.com/project-card.png',
        'detail_media_kind': 'youtube',
        'detail_image_url': None,
        'youtube_url': 'https://www.youtube.com/watch?v=abcdefghijk',
        'highlights_json': ['Highlight A', 'Highlight B'],
        'resource_links_json': [
            {'label': 'GitHub', 'href': 'https://github.com/example/project'},
        ],
    }

    payload = {
        'slug': 'graphics-showcase',
        'title': 'Graphics Showcase',
        'excerpt': 'project summary',
        'body_markdown': 'body',
        'cover_image_url': 'https://example.com/project-card.png',
        'content_kind': 'project',
        'status': 'published',
        'visibility': 'public',
        'published_at': None,
        'project_profile': project_profile,
    }

    service.create_post = lambda request_payload: _build_post_payload(  # type: ignore[method-assign]
        slug=request_payload.slug,
        status=request_payload.status,
        visibility=request_payload.visibility,
        content_kind=request_payload.content_kind,
        project_profile=project_profile,
    )

    response = client.post(
        '/api/v1/posts',
        json=payload,
        headers={'x-internal-api-secret': 'test-shared-secret'},
    )

    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json()['content_kind'] == 'project'
    assert response.json()['project_profile']['detail_media_kind'] == 'youtube'
