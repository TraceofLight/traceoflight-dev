from __future__ import annotations

import enum
from datetime import datetime

from pydantic import BaseModel, Field


class SourceProvider(str, enum.Enum):
    VELOG = "velog"


class SnapshotStatus(str, enum.Enum):
    READY = "ready"
    FAILED = "failed"


class ImportMode(str, enum.Enum):
    DRY_RUN = "dry_run"
    APPLY = "apply"


class ImportJobStatus(str, enum.Enum):
    SUCCEEDED = "succeeded"
    PARTIALLY_FAILED = "partially_failed"
    FAILED = "failed"


class VelogSnapshotCreate(BaseModel):
    username: str = Field(
        description="Velog username without leading @.",
        json_schema_extra={"example": "traceoflight"},
    )


class SnapshotCreateRead(BaseModel):
    snapshot_id: str
    source_provider: SourceProvider
    source_identity: str
    status: SnapshotStatus
    total_items: int
    artifact_object_key: str
    created_at: datetime
    updated_at: datetime


class SnapshotImportRunCreate(BaseModel):
    mode: ImportMode = Field(default=ImportMode.APPLY)


class SnapshotImportErrorItem(BaseModel):
    external_post_id: str
    slug: str
    detail: str


class SnapshotImportRunRead(BaseModel):
    job_id: str
    snapshot_id: str
    mode: ImportMode
    status: ImportJobStatus
    total_items: int
    created_items: int
    updated_items: int
    failed_items: int
    errors: list[SnapshotImportErrorItem] = Field(default_factory=list)


class BackupLoadRead(BaseModel):
    restored_posts: int
    restored_media: int
    restored_series_overrides: int
