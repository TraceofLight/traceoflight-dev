from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.services.resume_service import RESUME_PDF_CONFIG, PdfAssetService


class _StorageStub:
    def __init__(self) -> None:
        self.object_bytes: dict[str, bytes] = {}
        self.put_calls: list[tuple[str, str]] = []

    def ensure_bucket(self) -> None:
        return None

    def put_bytes(self, object_key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
        self.put_calls.append((object_key, content_type))
        self.object_bytes[object_key] = data

    def get_bytes(self, object_key: str) -> bytes:
        return self.object_bytes[object_key]

    def object_exists(self, object_key: str) -> bool:
        return object_key in self.object_bytes


def _build_service(storage: _StorageStub) -> PdfAssetService:
    return PdfAssetService(storage=storage, config=RESUME_PDF_CONFIG)


def test_resume_service_rejects_non_pdf_payloads() -> None:
    service = _build_service(_StorageStub())

    with pytest.raises(HTTPException, match="resume file must be a PDF"):
        service.upload_pdf(
            filename="resume.txt",
            data=b"not-a-pdf",
            content_type="text/plain",
        )


def test_resume_service_uploads_valid_pdf_to_fixed_object_key() -> None:
    storage = _StorageStub()
    service = _build_service(storage)

    result = service.upload_pdf(
        filename="resume.pdf",
        data=b"%PDF-1.7\nresume-data",
        content_type="application/pdf",
    )

    assert result == {"available": True}
    assert storage.object_bytes[RESUME_PDF_CONFIG.object_key] == b"%PDF-1.7\nresume-data"
    assert storage.put_calls == [(RESUME_PDF_CONFIG.object_key, "application/pdf")]


def test_resume_service_download_uses_resume_filename() -> None:
    storage = _StorageStub()
    storage.object_bytes[RESUME_PDF_CONFIG.object_key] = b"%PDF-1.7\nresume-data"
    service = _build_service(storage)

    result = service.download_pdf()

    assert result is not None
    assert result.filename == "resume.pdf"
