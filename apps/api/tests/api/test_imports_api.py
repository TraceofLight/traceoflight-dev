from __future__ import annotations

from dataclasses import dataclass

from fastapi.testclient import TestClient

from app.api.deps import get_import_service
from app.api.v1.endpoints import imports as imports_endpoint
from app.main import app


@dataclass
class _StubImportService:
    snapshot_username: str | None = None
    import_snapshot_id: str | None = None
    import_mode: str | None = None
    restored_filename: str | None = None
    restored_size: int | None = None

    def create_velog_snapshot(self, username: str):  # type: ignore[no-untyped-def]
        self.snapshot_username = username
        return {
            "snapshot_id": "snapshot-1",
            "source_provider": "velog",
            "source_identity": username,
            "status": "ready",
            "total_items": 3,
            "artifact_object_key": "imports/snapshots/snapshot-1.zip",
            "created_at": "2026-03-06T00:00:00Z",
            "updated_at": "2026-03-06T00:00:00Z",
        }

    def run_snapshot_import(self, snapshot_id: str, mode):  # type: ignore[no-untyped-def]
        self.import_snapshot_id = snapshot_id
        self.import_mode = mode.value if hasattr(mode, "value") else mode
        return {
            "job_id": "job-1",
            "snapshot_id": snapshot_id,
            "mode": self.import_mode,
            "status": "succeeded",
            "total_items": 3,
            "created_items": 2,
            "updated_items": 1,
            "failed_items": 0,
            "errors": [],
        }

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


def test_import_endpoints_require_internal_secret(monkeypatch) -> None:
    monkeypatch.setattr(imports_endpoint.settings, "internal_api_secret", "test-shared-secret")
    service = _StubImportService()
    client = _client_with_service(service)

    snapshot_response = client.post(
        "/api/v1/imports/snapshots/velog",
        json={"username": "traceoflight"},
    )
    job_response = client.post(
        "/api/v1/imports/snapshots/snapshot-1/jobs",
        json={"mode": "apply"},
    )

    app.dependency_overrides.clear()
    assert snapshot_response.status_code == 401
    assert job_response.status_code == 401
    assert service.snapshot_username is None
    assert service.import_snapshot_id is None


def test_create_snapshot_and_apply_import_with_internal_secret(monkeypatch) -> None:
    monkeypatch.setattr(imports_endpoint.settings, "internal_api_secret", "test-shared-secret")
    service = _StubImportService()
    client = _client_with_service(service)
    headers = {"x-internal-api-secret": "test-shared-secret"}

    snapshot_response = client.post(
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
    assert snapshot_response.status_code == 202
    assert snapshot_response.json()["snapshot_id"] == "snapshot-1"
    assert service.snapshot_username == "traceoflight"

    assert job_response.status_code == 202
    assert job_response.json()["status"] == "succeeded"
    assert service.import_snapshot_id == "snapshot-1"
    assert service.import_mode == "apply"


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
