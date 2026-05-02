from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.api import security as security_module
from app.api.deps import get_post_comment_service
from app.main import app
from app.schemas.post_comment import (
    AdminCommentFeed,
    AdminCommentFeedItem,
    PostCommentRead,
    PostCommentThreadItem,
    PostCommentThreadList,
)
from app.services.post_comment_service import CommentAuthError


def _comment_read(
    *,
    body: str = "hello",
    author_name: str = "Guest",
    author_type: str = "guest",
    visibility: str = "public",
    status: str = "active",
    root_comment_id=None,
    reply_to_comment_id=None,
) -> PostCommentRead:
    return PostCommentRead(
        id=uuid.uuid4(),
        root_comment_id=root_comment_id,
        reply_to_comment_id=reply_to_comment_id,
        author_name=author_name,
        author_type=author_type,
        visibility=visibility,
        status=status,
        body=body,
        password_hash=None,
        can_reply=status != "deleted",
        reply_to_author_name=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )


class _StubPostCommentService:
    def __init__(self) -> None:
        self.list_call: dict[str, object] | None = None
        self.create_call: dict[str, object] | None = None
        self.update_call: dict[str, object] | None = None
        self.delete_call: dict[str, object] | None = None
        self.admin_feed_call: dict[str, object] | None = None

    def list_post_comments(self, post_slug: str, include_private: bool = False):  # type: ignore[no-untyped-def]
        self.list_call = {
            "post_slug": post_slug,
            "include_private": include_private,
        }
        return PostCommentThreadList(
            comment_count=1,
            items=[
                PostCommentThreadItem(
                    **_comment_read(body="listed", visibility="private" if include_private else "public").model_dump(),
                    replies=[],
                )
            ],
        )

    def create_comment(self, post_slug: str, payload, *, is_admin: bool):  # type: ignore[no-untyped-def]
        self.create_call = {
            "post_slug": post_slug,
            "payload": payload,
            "is_admin": is_admin,
        }
        return _comment_read(
            body=payload.body,
            author_name="TraceofLight" if is_admin else (payload.author_name or "anonymous"),
            author_type="admin" if is_admin else "guest",
            visibility=payload.visibility,
        )

    def update_comment(self, comment_id, payload, *, is_admin: bool):  # type: ignore[no-untyped-def]
        self.update_call = {
            "comment_id": comment_id,
            "payload": payload,
            "is_admin": is_admin,
        }
        return _comment_read(body=payload.body or "updated", visibility=payload.visibility or "public")

    def delete_comment(self, comment_id, payload, *, is_admin: bool):  # type: ignore[no-untyped-def]
        self.delete_call = {
            "comment_id": comment_id,
            "payload": payload,
            "is_admin": is_admin,
        }
        return _comment_read(body="삭제된 댓글입니다.", status="deleted")

    def list_admin_comments(self, query):  # type: ignore[no-untyped-def]
        self.admin_feed_call = {
            "query": query,
        }
        return AdminCommentFeed(
            total_count=1,
            items=[
                AdminCommentFeedItem(
                    **_comment_read(body="admin listed", visibility="private").model_dump(),
                    post_slug="sample-post",
                    post_title="Sample Post",
                    is_reply=False,
                )
            ],
        )


class _RejectingPostCommentService(_StubPostCommentService):
    def create_comment(self, post_slug: str, payload, *, is_admin: bool):  # type: ignore[no-untyped-def]
        raise CommentAuthError("이름을 입력해 주세요.")


def _client_with_service(service: _StubPostCommentService) -> TestClient:
    app.dependency_overrides[get_post_comment_service] = lambda: service
    return TestClient(app)


def test_comment_list_defaults_to_public_view_without_internal_secret(monkeypatch) -> None:
    monkeypatch.setattr(security_module.settings, "internal_api_secret", "test-shared-secret")
    service = _StubPostCommentService()
    client = _client_with_service(service)

    response = client.get("/api/v1/web-service/posts/sample-post/comments")

    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert service.list_call == {
        "post_slug": "sample-post",
        "include_private": False,
    }


def test_comment_list_includes_private_for_valid_internal_secret(monkeypatch) -> None:
    monkeypatch.setattr(security_module.settings, "internal_api_secret", "test-shared-secret")
    service = _StubPostCommentService()
    client = _client_with_service(service)

    response = client.get(
        "/api/v1/web-service/posts/sample-post/comments",
        headers={"x-internal-api-secret": "test-shared-secret"},
    )

    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert service.list_call == {
        "post_slug": "sample-post",
        "include_private": True,
    }


def test_guest_comment_create_does_not_require_internal_secret(monkeypatch) -> None:
    monkeypatch.setattr(security_module.settings, "internal_api_secret", "test-shared-secret")
    service = _StubPostCommentService()
    client = _client_with_service(service)

    response = client.post(
        "/api/v1/web-service/posts/sample-post/comments",
        json={
            "author_name": "Guest",
            "password": "secret123",
            "visibility": "public",
            "body": "hello",
        },
    )

    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert service.create_call is not None
    assert service.create_call["is_admin"] is False


def test_admin_comment_create_uses_internal_secret(monkeypatch) -> None:
    monkeypatch.setattr(security_module.settings, "internal_api_secret", "test-shared-secret")
    service = _StubPostCommentService()
    client = _client_with_service(service)

    response = client.post(
        "/api/v1/web-service/posts/sample-post/comments",
        headers={"x-internal-api-secret": "test-shared-secret"},
        json={
            "visibility": "public",
            "body": "admin hello",
        },
    )

    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert service.create_call is not None
    assert service.create_call["is_admin"] is True
    assert response.json()["author_name"] == "TraceofLight"


def test_guest_comment_create_rejects_blank_author_name_with_detail(monkeypatch) -> None:
    monkeypatch.setattr(security_module.settings, "internal_api_secret", "test-shared-secret")
    service = _RejectingPostCommentService()
    client = _client_with_service(service)

    response = client.post(
        "/api/v1/web-service/posts/sample-post/comments",
        json={
            "author_name": "",
            "password": "secret123",
            "visibility": "public",
            "body": "hello",
        },
    )

    app.dependency_overrides.clear()
    assert response.status_code == 401
    assert response.json() == {"detail": "이름을 입력해 주세요."}


def test_guest_comment_patch_and_delete_forward_password_without_internal_secret(monkeypatch) -> None:
    monkeypatch.setattr(security_module.settings, "internal_api_secret", "test-shared-secret")
    service = _StubPostCommentService()
    client = _client_with_service(service)
    comment_id = str(uuid.uuid4())

    patch_response = client.patch(
        f"/api/v1/web-service/comments/{comment_id}",
        json={"password": "secret123", "body": "edited"},
    )
    delete_response = client.request(
        "DELETE",
        f"/api/v1/web-service/comments/{comment_id}",
        json={"password": "secret123"},
    )

    app.dependency_overrides.clear()
    assert patch_response.status_code == 200
    assert delete_response.status_code == 200
    assert service.update_call is not None
    assert service.delete_call is not None
    assert service.update_call["is_admin"] is False
    assert service.delete_call["is_admin"] is False


def test_admin_comment_feed_requires_internal_secret(monkeypatch) -> None:
    monkeypatch.setattr(security_module.settings, "internal_api_secret", "test-shared-secret")
    service = _StubPostCommentService()
    client = _client_with_service(service)

    unauthorized = client.get("/api/v1/web-service/admin/comments")
    authorized = client.get(
        "/api/v1/web-service/admin/comments",
        headers={"x-internal-api-secret": "test-shared-secret"},
    )

    app.dependency_overrides.clear()
    assert unauthorized.status_code == 401
    assert authorized.status_code == 200
    assert service.admin_feed_call is not None
