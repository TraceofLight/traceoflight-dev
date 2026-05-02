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
        self.login_calls: list[tuple[str, str]] = []
        self.update_calls: list[tuple[str, str]] = []
        self.login_result = _LoginResult(ok=True, credential_source="operational", revision=3)

    async def login(self, login_id: str, password: str):  # type: ignore[no-untyped-def]
        self.login_calls.append((login_id, password))
        return type(
            "_LoginPayload",
            (),
            {
                "ok": self.login_result.ok,
                "credential_source": self.login_result.credential_source,
                "revision": self.login_result.revision,
                "token_pair": type(
                    "_TokenPair",
                    (),
                    {
                        "access_token": "access-token",
                        "refresh_token": "refresh-token",
                        "access_max_age_seconds": 900,
                        "refresh_max_age_seconds": 1209600,
                    },
                )(),
            },
        )()

    async def rotate_refresh_token(self, refresh_token: str):  # type: ignore[no-untyped-def]
        return type(
            "_RefreshPayload",
            (),
            {
                "kind": "rotated",
                "revision": self.login_result.revision,
                "token_pair": type(
                    "_TokenPair",
                    (),
                    {
                        "access_token": "rotated-access",
                        "refresh_token": "rotated-refresh",
                        "access_max_age_seconds": 900,
                        "refresh_max_age_seconds": 1209600,
                    },
                )(),
            },
        )()

    async def revoke_refresh_token_family(self, refresh_token: str):  # type: ignore[no-untyped-def]
        return None

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
        "/api/v1/web-service/admin/auth/login",
        json={"login_id": "ops-admin", "password": "secret-password"},
    )

    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert service.login_calls == [("ops-admin", "secret-password")]
    assert response.json()["ok"] is True
    assert response.json()["credential_source"] == "operational"
    assert response.json()["credential_revision"] == 3
    assert response.json()["access_token"] == "access-token"
    assert response.json()["refresh_token"] == "refresh-token"


def test_admin_auth_login_rejects_invalid_credentials() -> None:
    service = _StubAdminAuthService()
    service.login_result = _LoginResult(ok=False, credential_source=None, revision=0)
    client = _client_with_service(service)

    response = client.post(
        "/api/v1/web-service/admin/auth/login",
        json={"login_id": "wrong", "password": "wrong"},
    )

    app.dependency_overrides.clear()
    assert response.status_code == 401


def test_admin_auth_refresh_returns_rotated_token_pair() -> None:
    service = _StubAdminAuthService()
    client = _client_with_service(service)

    response = client.post(
        "/api/v1/web-service/admin/auth/refresh",
        json={"refresh_token": "existing-refresh"},
    )

    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json()["access_token"] == "rotated-access"
    assert response.json()["refresh_token"] == "rotated-refresh"


def test_admin_auth_credentials_update_requires_internal_secret() -> None:
    client = TestClient(app)

    response = client.put(
        "/api/v1/web-service/admin/auth/credentials",
        json={"login_id": "next-admin", "password": "next-password"},
    )

    assert response.status_code == 401


def test_admin_auth_credentials_update_uses_backend_service_with_internal_secret(monkeypatch) -> None:
    from app.api import security as security_module

    monkeypatch.setattr(security_module.settings, "internal_api_secret", "test-shared-secret")
    service = _StubAdminAuthService()
    client = _client_with_service(service)

    response = client.put(
        "/api/v1/web-service/admin/auth/credentials",
        json={"login_id": "next-admin", "password": "next-password"},
        headers={"x-internal-api-secret": "test-shared-secret"},
    )

    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert service.update_calls == [("next-admin", "next-password")]
    assert response.json()["login_id"] == "next-admin"
    assert response.json()["credential_revision"] == 4
