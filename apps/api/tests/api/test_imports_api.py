from __future__ import annotations

from dataclasses import dataclass

from fastapi.testclient import TestClient

from app.api.deps import get_import_service
from app.api.v1.endpoints import imports as imports_endpoint
from app.main import app


@dataclass
class _StubImportService:
    restored_filename: str | None = None
    restored_size: int | None = None

    def download_posts_backup(self):  # type: ignore[no-untyped-def]
        return ("traceoflight-posts-backup.zip", b"fake-zip-binary")

    def load_posts_backup(self, filename: str, data: bytes):  # type: ignore[no-untyped-def]
        self.restored_filename = filename
        self.restored_size = len(data)
        return {
            "restored_posts": 2,
            "restored_media": 3,
            "restored_series_overrides": 1,
        }


def _client_with_service(service: _StubImportService) -> TestClient:
    app.dependency_overrides[get_import_service] = lambda: service
    return TestClient(app)


def test_snapshot_endpoints_are_not_available(monkeypatch) -> None:
    monkeypatch.setattr(imports_endpoint.settings, "internal_api_secret", "test-shared-secret")
    service = _StubImportService()
    client = _client_with_service(service)
    headers = {"x-internal-api-secret": "test-shared-secret"}

    velog_response = client.post(
        "/api/v1/imports/snapshots/velog",
        json={"username": "traceoflight"},
        headers=headers,
    )
    job_response = client.post(
        "/api/v1/imports/snapshots/snapshot-1/jobs",
        json={"mode": "apply"},
        headers=headers,
    )

    app.dependency_overrides.clear()
    assert velog_response.status_code == 404
    assert job_response.status_code == 404


def test_backup_endpoints_require_internal_secret(monkeypatch) -> None:
    monkeypatch.setattr(imports_endpoint.settings, "internal_api_secret", "test-shared-secret")
    service = _StubImportService()
    client = _client_with_service(service)

    download_response = client.get("/api/v1/imports/backups/posts.zip")
    load_response = client.post(
        "/api/v1/imports/backups/load",
        files={"file": ("backup.zip", b"zip-data", "application/zip")},
    )

    app.dependency_overrides.clear()
    assert download_response.status_code == 401
    assert load_response.status_code == 401
    assert service.restored_filename is None


def test_download_and_load_backup_with_internal_secret(monkeypatch) -> None:
    monkeypatch.setattr(imports_endpoint.settings, "internal_api_secret", "test-shared-secret")
    service = _StubImportService()
    client = _client_with_service(service)
    headers = {"x-internal-api-secret": "test-shared-secret"}

    download_response = client.get("/api/v1/imports/backups/posts.zip", headers=headers)
    load_response = client.post(
        "/api/v1/imports/backups/load",
        headers=headers,
        files={"file": ("backup.zip", b"zip-data", "application/zip")},
    )

    app.dependency_overrides.clear()
    assert download_response.status_code == 200
    assert download_response.content == b"fake-zip-binary"
    assert download_response.headers["content-type"] == "application/zip"
    assert "traceoflight-posts-backup.zip" in download_response.headers["content-disposition"]

    assert load_response.status_code == 200
    assert load_response.json() == {
        "restored_posts": 2,
        "restored_media": 3,
        "restored_series_overrides": 1,
    }
    assert service.restored_filename == "backup.zip"
    assert service.restored_size == len(b"zip-data")
