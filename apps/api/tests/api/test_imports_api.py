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
