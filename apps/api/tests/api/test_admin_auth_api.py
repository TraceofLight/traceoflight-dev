from __future__ import annotations

from dataclasses import dataclass

from fastapi.testclient import TestClient

from app.api.deps import get_admin_auth_service
from app.main import app


@dataclass
class _LoginResult:
    ok: bool
    credential_source: str | None = None
    revision: int = 0


@dataclass
class _UpdateResult:
    login_id: str
    revision: int


class _StubAdminAuthService:
    def __init__(self) -> None:
        self.verify_calls: list[tuple[str, str]] = []
        self.update_calls: list[tuple[str, str]] = []
        self.login_result = _LoginResult(ok=True, credential_source="operational", revision=3)

    async def verify_credentials(self, login_id: str, password: str):  # type: ignore[no-untyped-def]
        self.verify_calls.append((login_id, password))
        return self.login_result

    async def update_operational_credentials(self, login_id: str, password: str):  # type: ignore[no-untyped-def]
        self.update_calls.append((login_id, password))
        return _UpdateResult(login_id=login_id, revision=4)

    async def get_active_credential_revision(self) -> int:
        return self.login_result.revision


def _client_with_service(service: _StubAdminAuthService) -> TestClient:
    app.dependency_overrides[get_admin_auth_service] = lambda: service
    return TestClient(app)


def test_admin_auth_login_endpoint_uses_backend_service_and_reports_source() -> None:
    service = _StubAdminAuthService()
    client = _client_with_service(service)

    response = client.post(
        "/api/v1/admin/auth/login",
        json={"login_id": "ops-admin", "password": "secret-password"},
    )

    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert service.verify_calls == [("ops-admin", "secret-password")]
    assert response.json()["ok"] is True
    assert response.json()["credential_source"] == "operational"
    assert response.json()["credential_revision"] == 3


def test_admin_auth_login_rejects_invalid_credentials() -> None:
    service = _StubAdminAuthService()
    service.login_result = _LoginResult(ok=False, credential_source=None, revision=0)
    client = _client_with_service(service)

    response = client.post(
        "/api/v1/admin/auth/login",
        json={"login_id": "wrong", "password": "wrong"},
    )

    app.dependency_overrides.clear()
    assert response.status_code == 401


def test_admin_auth_credentials_update_requires_internal_secret() -> None:
    client = TestClient(app)

    response = client.put(
        "/api/v1/admin/auth/credentials",
        json={"login_id": "next-admin", "password": "next-password"},
    )

    assert response.status_code == 401


def test_admin_auth_credentials_update_uses_backend_service_with_internal_secret(monkeypatch) -> None:
    from app.api.v1.endpoints import admin_auth as admin_auth_endpoint

    monkeypatch.setattr(admin_auth_endpoint.settings, "internal_api_secret", "test-shared-secret")
    service = _StubAdminAuthService()
    client = _client_with_service(service)

    response = client.put(
        "/api/v1/admin/auth/credentials",
        json={"login_id": "next-admin", "password": "next-password"},
        headers={"x-internal-api-secret": "test-shared-secret"},
    )

    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert service.update_calls == [("next-admin", "next-password")]
    assert response.json()["login_id"] == "next-admin"
    assert response.json()["credential_revision"] == 4
