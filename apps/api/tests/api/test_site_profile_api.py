from __future__ import annotations

from dataclasses import dataclass

from fastapi.testclient import TestClient

from app.api.deps import get_site_profile_service
from app.main import app


@dataclass
class _StubSiteProfile:
    email: str = "rickyjun96@gmail.com"
    github_url: str = "https://github.com/TraceofLight"


class _StubSiteProfileService:
    def __init__(self) -> None:
        self.profile = _StubSiteProfile()
        self.update_calls: list[tuple[str, str]] = []
        self.raise_message: str | None = None

    def get_profile(self) -> _StubSiteProfile:
        return self.profile

    def update_profile(self, email: str, github_url: str) -> _StubSiteProfile:
        self.update_calls.append((email, github_url))
        if self.raise_message is not None:
            raise ValueError(self.raise_message)
        self.profile = _StubSiteProfile(email=email, github_url=github_url)
        return self.profile


def _client_with_service(service: _StubSiteProfileService) -> TestClient:
    app.dependency_overrides[get_site_profile_service] = lambda: service
    return TestClient(app)


def test_site_profile_get_returns_footer_contact_data() -> None:
    service = _StubSiteProfileService()
    client = _client_with_service(service)

    response = client.get("/api/v1/site-profile")

    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json() == {
        "email": "rickyjun96@gmail.com",
        "github_url": "https://github.com/TraceofLight",
    }


def test_site_profile_update_requires_internal_secret() -> None:
    client = TestClient(app)

    response = client.put(
        "/api/v1/site-profile",
        json={
            "email": "contact@traceoflight.dev",
            "github_url": "https://github.com/TraceofLight",
        },
    )

    assert response.status_code == 401


def test_site_profile_update_uses_service_with_internal_secret(monkeypatch) -> None:
    from app.api.v1.endpoints import imports as imports_endpoint

    monkeypatch.setattr(imports_endpoint.settings, "internal_api_secret", "test-shared-secret")
    service = _StubSiteProfileService()
    client = _client_with_service(service)

    response = client.put(
        "/api/v1/site-profile",
        json={
            "email": "contact@traceoflight.dev",
            "github_url": "https://github.com/TraceofLight",
        },
        headers={"x-internal-api-secret": "test-shared-secret"},
    )

    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert service.update_calls == [("contact@traceoflight.dev", "https://github.com/TraceofLight")]
    assert response.json() == {
        "email": "contact@traceoflight.dev",
        "github_url": "https://github.com/TraceofLight",
    }


def test_site_profile_update_returns_bad_request_for_validation_errors(monkeypatch) -> None:
    from app.api.v1.endpoints import imports as imports_endpoint

    monkeypatch.setattr(imports_endpoint.settings, "internal_api_secret", "test-shared-secret")
    service = _StubSiteProfileService()
    service.raise_message = "email must be a valid address"
    client = _client_with_service(service)

    response = client.put(
        "/api/v1/site-profile",
        json={
            "email": "invalid",
            "github_url": "https://github.com/TraceofLight",
        },
        headers={"x-internal-api-secret": "test-shared-secret"},
    )

    app.dependency_overrides.clear()
    assert response.status_code == 400
    assert response.json() == {"detail": "email must be a valid address"}
