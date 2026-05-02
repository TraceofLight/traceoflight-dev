from __future__ import annotations

from app.core.config import settings
from app.repositories.media_repository import MediaRepository
from app.schemas.media import MediaCreate, MediaUploadRequest, MediaUploadResponse
from app.storage.minio_client import MinioStorageClient


class MediaService:
    def __init__(self, storage: MinioStorageClient, repo: MediaRepository) -> None:
        self.storage = storage
        self.repo = repo

    def create_upload_url(self, payload: MediaUploadRequest) -> MediaUploadResponse:
        self.storage.ensure_bucket()
        object_key = self.storage.build_object_key(kind=payload.kind.value, filename=payload.filename)
        upload_url = self.storage.presigned_put_url(
            object_key=object_key,
            content_type=payload.mime_type,
            expires_seconds=settings.minio_presigned_expire_seconds,
        )
        return MediaUploadResponse(
            object_key=object_key,
            bucket=settings.minio_bucket,
            upload_url=upload_url,
            expires_in_seconds=settings.minio_presigned_expire_seconds,
        )

    def register_media(self, payload: MediaCreate):
        media = self.repo.create(payload=payload, bucket=settings.minio_bucket)
        self.repo.db.commit()
        return media
