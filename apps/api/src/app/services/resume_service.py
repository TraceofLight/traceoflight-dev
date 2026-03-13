from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException

from app.storage.minio_client import MinioStorageClient

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


@dataclass(frozen=True)
class PdfAssetConfig:
    object_key: str
    download_filename: str
    missing_detail: str
    validation_label: str


PORTFOLIO_PDF_CONFIG = PdfAssetConfig(
    object_key="file/portfolio.pdf",
    download_filename="portfolio.pdf",
    missing_detail="portfolio pdf is not registered",
    validation_label="portfolio",
)

RESUME_PDF_CONFIG = PdfAssetConfig(
    object_key="file/resume.pdf",
    download_filename="resume.pdf",
    missing_detail="resume pdf is not registered",
    validation_label="resume",
)


class PdfAssetService:
    def __init__(self, storage: MinioStorageClient, config: PdfAssetConfig) -> None:
        self.storage = storage
        self.config = config

    def get_status(self) -> dict[str, bool]:
        return {"available": self.storage.object_exists(self.config.object_key)}

    def download_pdf(self) -> ResumeDownload | None:
        if not self.storage.object_exists(self.config.object_key):
            return None

        return ResumeDownload(
            filename=self.config.download_filename,
            content_type="application/pdf",
            body=self.storage.get_bytes(self.config.object_key),
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
            raise HTTPException(
                status_code=400,
                detail=f"{self.config.validation_label} filename is required",
            )
        if normalized_content_type not in ALLOWED_PDF_CONTENT_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"{self.config.validation_label} file must be a PDF",
            )
        if not data.startswith(PDF_SIGNATURE):
            raise HTTPException(
                status_code=400,
                detail=f"{self.config.validation_label} file must be a valid PDF",
            )

        self.storage.ensure_bucket()
        self.storage.put_bytes(
            self.config.object_key,
            data=data,
            content_type="application/pdf",
        )
        return {"available": True}

    def delete_pdf(self) -> dict[str, bool]:
        self.storage.delete_object(self.config.object_key)
        return {"available": False}
