from __future__ import annotations

from dataclasses import dataclass

from fastapi.testclient import TestClient

from app.api import security as security_module
from app.api.deps import get_portfolio_pdf_service, get_resume_service
from app.main import app
from app.services.resume_service import ResumeDownload


@dataclass
class _StubResumeService:
    available: bool = False
    pdf_bytes: bytes = b"%PDF-1.7\nstub"
    download_filename: str = "portfolio.pdf"
    upload_filename: str | None = None
    upload_size: int | None = None
    upload_content_type: str | None = None
    delete_calls: int = 0

    def get_status(self):  # type: ignore[no-untyped-def]
        return {"available": self.available}

    def download_pdf(self):  # type: ignore[no-untyped-def]
        if not self.available:
          return None
        return ResumeDownload(
            filename=self.download_filename,
            content_type="application/pdf",
            body=self.pdf_bytes,
        )

    def upload_pdf(self, filename: str, data: bytes, content_type: str | None):  # type: ignore[no-untyped-def]
        self.available = True
        self.upload_filename = filename
        self.upload_size = len(data)
        self.upload_content_type = content_type
        self.pdf_bytes = data
        return {"available": True}

    def delete_pdf(self):  # type: ignore[no-untyped-def]
        self.available = False
        self.delete_calls += 1
        return {"available": False}


def _client_with_service(
    portfolio_service: _StubResumeService | None = None,
    resume_service: _StubResumeService | None = None,
) -> TestClient:
    app.dependency_overrides[get_portfolio_pdf_service] = (
        lambda: portfolio_service or _StubResumeService()
    )
    app.dependency_overrides[get_resume_service] = (
        lambda: resume_service or _StubResumeService()
    )
    return TestClient(app)


def test_portfolio_status_and_download_return_not_found_when_missing() -> None:
    service = _StubResumeService(available=False)
    client = _client_with_service(portfolio_service=service)

    status_response = client.get("/api/v1/portfolio/status")
    file_response = client.get("/api/v1/portfolio")

    app.dependency_overrides.clear()
    assert status_response.status_code == 200
    assert status_response.json() == {"available": False}
    assert file_response.status_code == 404


def test_portfolio_download_streams_pdf_when_available() -> None:
    service = _StubResumeService(available=True, pdf_bytes=b"%PDF-1.7\nresume-data")
    client = _client_with_service(portfolio_service=service)

    response = client.get("/api/v1/portfolio")

    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.content == b"%PDF-1.7\nresume-data"
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["content-disposition"] == 'inline; filename="portfolio.pdf"'


def test_portfolio_upload_requires_internal_secret(monkeypatch) -> None:
    monkeypatch.setattr(security_module.settings, "internal_api_secret", "test-shared-secret")
    service = _StubResumeService(available=False)
    client = _client_with_service(portfolio_service=service)

    response = client.post(
        "/api/v1/portfolio",
        files={"file": ("resume.pdf", b"%PDF-1.7\nresume-data", "application/pdf")},
    )

    app.dependency_overrides.clear()
    assert response.status_code == 401
    assert service.upload_filename is None


def test_portfolio_upload_accepts_pdf_with_internal_secret(monkeypatch) -> None:
    monkeypatch.setattr(security_module.settings, "internal_api_secret", "test-shared-secret")
    service = _StubResumeService(available=False)
    client = _client_with_service(portfolio_service=service)

    response = client.post(
        "/api/v1/portfolio",
        headers={"x-internal-api-secret": "test-shared-secret"},
        files={"file": ("resume.pdf", b"%PDF-1.7\nresume-data", "application/pdf")},
    )

    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json() == {"available": True}
    assert service.upload_filename == "resume.pdf"
    assert service.upload_size == len(b"%PDF-1.7\nresume-data")
    assert service.upload_content_type == "application/pdf"


def test_portfolio_delete_clears_registered_pdf(monkeypatch) -> None:
    monkeypatch.setattr(security_module.settings, "internal_api_secret", "test-shared-secret")
    service = _StubResumeService(available=True)
    client = _client_with_service(portfolio_service=service)

    response = client.delete(
        "/api/v1/portfolio",
        headers={"x-internal-api-secret": "test-shared-secret"},
    )

    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json() == {"available": False}
    assert service.delete_calls == 1


def test_resume_status_upload_and_delete_are_active(monkeypatch) -> None:
    service = _StubResumeService(available=True, download_filename="resume.pdf")
    client = _client_with_service(resume_service=service)

    status_response = client.get("/api/v1/resume/status")
    file_response = client.get("/api/v1/resume")
    monkeypatch.setattr(security_module.settings, "internal_api_secret", "test-shared-secret")
    upload_response = client.post(
        "/api/v1/resume",
        headers={"x-internal-api-secret": "test-shared-secret"},
        files={"file": ("resume.pdf", b"%PDF-1.7\nresume-data", "application/pdf")},
    )
    delete_response = client.delete(
        "/api/v1/resume",
        headers={"x-internal-api-secret": "test-shared-secret"},
    )

    app.dependency_overrides.clear()
    assert status_response.status_code == 200
    assert status_response.json() == {"available": True}
    assert file_response.status_code == 200
    assert file_response.headers["content-disposition"] == 'inline; filename="resume.pdf"'
    assert upload_response.status_code == 200
    assert upload_response.json() == {"available": True}
    assert delete_response.status_code == 200
    assert delete_response.json() == {"available": False}
