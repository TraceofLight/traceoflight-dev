from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.api import security as security_module
from app.api.deps import get_series_service
from app.main import app


def _series_payload(slug: str) -> dict[str, object]:
    now = datetime.now(timezone.utc)
    return {
        "id": uuid.uuid4(),
        "slug": slug,
        "title": "Series title",
        "description": "Series description",
        "cover_image_url": None,
        "post_count": 1,
        "created_at": now,
        "updated_at": now,
    }


def _series_detail_payload(slug: str) -> dict[str, object]:
    payload = _series_payload(slug)
    payload["posts"] = [
        {
            "slug": "first-post",
            "title": "First post",
            "excerpt": "excerpt",
            "cover_image_url": None,
            "order_index": 1,
            "published_at": datetime.now(timezone.utc),
            "visibility": "public",
        }
    ]
    return payload


class _StubSeriesService:
    def __init__(self) -> None:
        self.list_calls: list[tuple[bool, int, int]] = []
        self.get_calls: list[tuple[str, bool, object]] = []
        self.write_calls: list[str] = []

    def list_series(
        self,
        include_private: bool = False,
        limit: int = 50,
        offset: int = 0,
        locale=None,
    ):  # type: ignore[no-untyped-def]
        self.list_calls.append((include_private, limit, offset))
        return [_series_payload("my-series")]

    def get_series_by_slug(self, slug: str, include_private: bool = False, locale=None):  # type: ignore[no-untyped-def]
        self.get_calls.append((slug, include_private, locale))
        if slug == "missing":
            return None
        return _series_detail_payload(slug)

    def create_series(self, payload):  # type: ignore[no-untyped-def]
        self.write_calls.append("create")
        return _series_detail_payload(payload.slug)

    def update_series_by_slug(self, slug: str, payload):  # type: ignore[no-untyped-def]
        self.write_calls.append("update")
        if slug == "missing":
            return None
        return _series_detail_payload(payload.slug or slug)

    def delete_series_by_slug(self, slug: str):  # type: ignore[no-untyped-def]
        self.write_calls.append("delete")
        return slug != "missing"

    def replace_series_posts_by_slug(self, slug: str, post_slugs: list[str]):  # type: ignore[no-untyped-def]
        self.write_calls.append("reorder")
        if slug == "missing":
            return None
        payload = _series_detail_payload(slug)
        payload["posts"] = [
            {
                "slug": post_slug,
                "title": post_slug,
                "excerpt": None,
                "cover_image_url": None,
                "order_index": index + 1,
                "published_at": datetime.now(timezone.utc),
                "visibility": "public",
            }
            for index, post_slug in enumerate(post_slugs)
        ]
        payload["post_count"] = len(post_slugs)
        return payload

    def replace_series_order(self, series_slugs: list[str]):  # type: ignore[no-untyped-def]
        self.write_calls.append("reorder-series")
        return [_series_payload(slug) for slug in series_slugs]


def _client_with_service(service: _StubSeriesService) -> TestClient:
    app.dependency_overrides[get_series_service] = lambda: service
    return TestClient(app)


def test_series_list_and_detail_apply_public_fallback_without_internal_secret(monkeypatch) -> None:
    monkeypatch.setattr(security_module.settings, "internal_api_secret", "test-shared-secret")
    service = _StubSeriesService()
    client = _client_with_service(service)

    list_response = client.get("/api/v1/web-service/series")
    detail_response = client.get("/api/v1/web-service/series/my-series")

    app.dependency_overrides.clear()
    assert list_response.status_code == 200
    assert detail_response.status_code == 200
    assert service.list_calls == [(False, 50, 0)]
    assert service.get_calls == [("my-series", False, None)]


def test_series_list_and_detail_allow_internal_secret(monkeypatch) -> None:
    monkeypatch.setattr(security_module.settings, "internal_api_secret", "test-shared-secret")
    service = _StubSeriesService()
    client = _client_with_service(service)
    headers = {"x-internal-api-secret": "test-shared-secret"}

    list_response = client.get("/api/v1/web-service/series", headers=headers)
    detail_response = client.get("/api/v1/web-service/series/my-series", headers=headers)

    app.dependency_overrides.clear()
    assert list_response.status_code == 200
    assert detail_response.status_code == 200
    assert service.list_calls == [(True, 50, 0)]
    assert service.get_calls == [("my-series", True, None)]


def test_series_write_requires_internal_secret(monkeypatch) -> None:
    monkeypatch.setattr(security_module.settings, "internal_api_secret", "test-shared-secret")
    service = _StubSeriesService()
    client = _client_with_service(service)

    payload = {
        "slug": "my-series",
        "title": "Series title",
        "description": "Series description",
        "cover_image_url": None,
    }
    create_response = client.post("/api/v1/web-service/series", json=payload)
    update_response = client.put("/api/v1/web-service/series/my-series", json=payload)
    delete_response = client.delete("/api/v1/web-service/series/my-series")
    reorder_response = client.put("/api/v1/web-service/series/my-series/posts", json={"post_slugs": ["first-post"]})

    app.dependency_overrides.clear()
    assert create_response.status_code == 401
    assert update_response.status_code == 401
    assert delete_response.status_code == 401
    assert reorder_response.status_code == 401
    assert service.write_calls == []


def test_series_order_write_requires_internal_secret(monkeypatch) -> None:
    monkeypatch.setattr(security_module.settings, "internal_api_secret", "test-shared-secret")
    service = _StubSeriesService()
    client = _client_with_service(service)

    response = client.put("/api/v1/web-service/series/order", json={"series_slugs": ["my-series"]})

    app.dependency_overrides.clear()
    assert response.status_code == 401
    assert service.write_calls == []


def test_series_order_replaces_sequence_for_internal_requests(monkeypatch) -> None:
    monkeypatch.setattr(security_module.settings, "internal_api_secret", "test-shared-secret")
    service = _StubSeriesService()
    client = _client_with_service(service)

    response = client.put(
        "/api/v1/web-service/series/order",
        headers={"x-internal-api-secret": "test-shared-secret"},
        json={"series_slugs": ["my-series", "next-series"]},
    )

    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert service.write_calls[-1] == "reorder-series"
    payload = response.json()
    assert [row["slug"] for row in payload] == ["my-series", "next-series"]
