from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException

from app.storage.minio_client import MinioStorageClient

RESUME_OBJECT_KEY = "file/resume.pdf"
PDF_SIGNATURE = b"%PDF-"
ALLOWED_PDF_CONTENT_TYPES = {
    "",
    "application/octet-stream",
    "application/pdf",
}


@dataclass(frozen=True)
class ResumeDownload:
    filename: str
    content_type: str
    body: bytes


class ResumeService:
    def __init__(self, storage: MinioStorageClient) -> None:
        self.storage = storage

    def get_status(self) -> dict[str, bool]:
        return {"available": self.storage.object_exists(RESUME_OBJECT_KEY)}

    def download_pdf(self) -> ResumeDownload | None:
        if not self.storage.object_exists(RESUME_OBJECT_KEY):
            return None

        return ResumeDownload(
            filename="portfolio.pdf",
            content_type="application/pdf",
            body=self.storage.get_bytes(RESUME_OBJECT_KEY),
        )

    def upload_pdf(
        self,
        filename: str,
        data: bytes,
        content_type: str | None,
    ) -> dict[str, bool]:
        normalized_filename = filename.strip()
        normalized_content_type = (content_type or "").strip().lower()

        if not normalized_filename:
            raise HTTPException(status_code=400, detail="resume filename is required")
        if normalized_content_type not in ALLOWED_PDF_CONTENT_TYPES:
            raise HTTPException(status_code=400, detail="resume file must be a PDF")
        if not data.startswith(PDF_SIGNATURE):
            raise HTTPException(status_code=400, detail="resume file must be a valid PDF")

        self.storage.ensure_bucket()
        self.storage.put_bytes(
            RESUME_OBJECT_KEY,
            data=data,
            content_type="application/pdf",
        )
        return {"available": True}
