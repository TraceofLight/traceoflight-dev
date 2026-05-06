from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.schemas.imports import BackupLoadRead
from app.services.imports.backup import (
    BackupRestoreCoordinator,
    build_backup_zip,
    collect_bundle,
    parse_backup_zip,
)
from app.services.imports.errors import ImportValidationError
from app.storage.minio_client import MinioStorageClient


class ImportService:
    def __init__(
        self,
        storage: MinioStorageClient,
        db: Session | None = None,
    ) -> None:
        self.storage = storage
        self.db = db

    def download_posts_backup(self) -> tuple[str, bytes]:
        if self.db is None:
            raise ImportValidationError("database session is required")
        self.storage.ensure_bucket()
        bundle = collect_bundle(self.db, self.storage)
        archive_data = build_backup_zip(bundle)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        return f"traceoflight-posts-backup-{timestamp}.zip", archive_data

    def load_posts_backup(self, filename: str, data: bytes) -> BackupLoadRead:
        if self.db is None:
            raise ImportValidationError("database session is required")
        if not filename.strip():
            raise ImportValidationError("backup filename is required")
        if not data:
            raise ImportValidationError("backup file is empty")
        bundle = parse_backup_zip(data)
        return BackupRestoreCoordinator(storage=self.storage, db=self.db).restore(
            bundle
        )
