from __future__ import annotations

from fastapi.testclient import TestClient

from app.api import security as security_module
from app.api.deps import get_tag_service
from app.main import app


class _StubTagService:
    def __init__(self) -> None:
        self.tags = [
            {"slug": "fastapi", "label": "FastAPI"},
            {"slug": "astro", "label": "Astro"},
        ]

    def list_tags(self, query: str | None = None, limit: int = 50, offset: int = 0):  # type: ignore[no-untyped-def]
        query_text = (query or "").strip().lower()
        filtered = [
            tag
            for tag in self.tags
            if not query_text
            or query_text in tag["slug"].lower()
            or query_text in tag["label"].lower()
        ]
        return filtered[offset : offset + limit]

    def create_tag(self, payload):  # type: ignore[no-untyped-def]
        created = {"slug": payload.slug, "label": payload.label}
        self.tags.append(created)
        return created

    def update_tag(self, current_slug: str, payload):  # type: ignore[no-untyped-def]
        for index, tag in enumerate(self.tags):
            if tag["slug"] != current_slug:
                continue
            updated = {
                "slug": payload.slug if payload.slug is not None else tag["slug"],
                "label": payload.label if payload.label is not None else tag["label"],
            }
            self.tags[index] = updated
            return updated
        return None

    def delete_tag(self, slug: str, force: bool = False) -> bool:  # type: ignore[no-untyped-def]
        del force
        for index, tag in enumerate(self.tags):
            if tag["slug"] != slug:
                continue
            self.tags.pop(index)
            return True
        return False


def _client_with_service(service: _StubTagService) -> TestClient:
    app.dependency_overrides[get_tag_service] = lambda: service
    return TestClient(app)


def test_list_tags_supports_query_filter(monkeypatch) -> None:
    monkeypatch.setattr(security_module.settings, "internal_api_secret", "test-shared-secret")
    service = _StubTagService()
    client = _client_with_service(service)
    headers = {"x-internal-api-secret": "test-shared-secret"}

    response = client.get("/api/v1/web-service/tags?query=fast", headers=headers)

    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json() == [{"slug": "fastapi", "label": "FastAPI"}]


def test_tag_mutation_requires_internal_secret(monkeypatch) -> None:
    monkeypatch.setattr(security_module.settings, "internal_api_secret", "test-shared-secret")
    service = _StubTagService()
    client = _client_with_service(service)

    create_response = client.post("/api/v1/web-service/tags", json={"slug": "python", "label": "Python"})
    update_response = client.patch("/api/v1/web-service/tags/fastapi", json={"slug": "fastapi", "label": "FastAPI 2"})
    delete_response = client.delete("/api/v1/web-service/tags/fastapi")

    app.dependency_overrides.clear()
    assert create_response.status_code == 401
    assert update_response.status_code == 401
    assert delete_response.status_code == 401


def test_tag_mutation_allows_internal_secret(monkeypatch) -> None:
    monkeypatch.setattr(security_module.settings, "internal_api_secret", "test-shared-secret")
    service = _StubTagService()
    client = _client_with_service(service)
    headers = {"x-internal-api-secret": "test-shared-secret"}

    create_response = client.post(
        "/api/v1/web-service/tags",
        json={"slug": "python", "label": "Python"},
        headers=headers,
    )
    patch_response = client.patch(
        "/api/v1/web-service/tags/python",
        json={"slug": "py", "label": "Python Language"},
        headers=headers,
    )
    delete_response = client.delete("/api/v1/web-service/tags/py", headers=headers)

    app.dependency_overrides.clear()
    assert create_response.status_code == 200
    assert patch_response.status_code == 200
    assert delete_response.status_code == 204
