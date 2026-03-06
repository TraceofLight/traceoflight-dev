from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, File, Header, HTTPException, Request, Response, UploadFile

from app.api.deps import get_import_service
from app.core.config import settings
from app.schemas.imports import (
    BackupLoadRead,
    SnapshotCreateRead,
    SnapshotImportRunCreate,
    SnapshotImportRunRead,
    VelogSnapshotCreate,
)
from app.services.import_service import (
    ImportService,
    ImportSourceError,
    ImportValidationError,
    SnapshotNotFoundError,
)

router = APIRouter()


INTERNAL_SECRET_HEADER_DESCRIPTION = (
    "Internal shared secret for privileged filtering and write operations."
)


def is_trusted_internal_request(request: Request, request_secret: str | None = None) -> bool:
    configured_secret = settings.internal_api_secret.strip()
    if not configured_secret:
        return False
    if request_secret is None:
        request_secret = request.headers.get("x-internal-api-secret", "")
    request_secret = request_secret.strip()
    if not request_secret:
        return False
    return secrets.compare_digest(request_secret, configured_secret)


def ensure_trusted_internal_request(request: Request, request_secret: str | None = None) -> None:
    if is_trusted_internal_request(request, request_secret):
        return
    raise HTTPException(status_code=401, detail="unauthorized")


@router.post(
    "/snapshots/velog",
    response_model=SnapshotCreateRead,
    status_code=202,
    summary="Create Velog snapshot",
    description="Crawl Velog posts and store reusable ZIP snapshot. Requires x-internal-api-secret.",
    responses={
        202: {"description": "Snapshot build finished"},
        400: {"description": "Invalid request payload"},
        401: {"description": "Missing or invalid internal API secret"},
        503: {"description": "Velog source unavailable"},
    },
)
def create_velog_snapshot(
    request: Request,
    payload: VelogSnapshotCreate,
    x_internal_api_secret: str | None = Header(
        default=None,
        alias="x-internal-api-secret",
        description=INTERNAL_SECRET_HEADER_DESCRIPTION,
    ),
    service: ImportService = Depends(get_import_service),
) -> SnapshotCreateRead:
    ensure_trusted_internal_request(request, x_internal_api_secret)
    try:
        return service.create_velog_snapshot(payload.username)
    except ImportValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ImportSourceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post(
    "/snapshots/{snapshot_id}/jobs",
    response_model=SnapshotImportRunRead,
    status_code=202,
    summary="Run snapshot import job",
    description=(
        "Import posts into DB from an existing snapshot ZIP artifact. "
        "Requires x-internal-api-secret."
    ),
    responses={
        202: {"description": "Import execution finished"},
        400: {"description": "Invalid request payload"},
        401: {"description": "Missing or invalid internal API secret"},
        404: {"description": "Snapshot not found"},
    },
)
def run_snapshot_import(
    request: Request,
    snapshot_id: str,
    payload: SnapshotImportRunCreate,
    x_internal_api_secret: str | None = Header(
        default=None,
        alias="x-internal-api-secret",
        description=INTERNAL_SECRET_HEADER_DESCRIPTION,
    ),
    service: ImportService = Depends(get_import_service),
) -> SnapshotImportRunRead:
    ensure_trusted_internal_request(request, x_internal_api_secret)
    try:
        return service.run_snapshot_import(snapshot_id=snapshot_id, mode=payload.mode)
    except ImportValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SnapshotNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get(
    "/backups/posts.zip",
    status_code=200,
    summary="Download posts backup ZIP",
    description="Export all DB-backed posts and media into a ZIP backup. Requires x-internal-api-secret.",
    responses={
        200: {"description": "Backup ZIP stream"},
        400: {"description": "Invalid backup request"},
        401: {"description": "Missing or invalid internal API secret"},
    },
)
def download_posts_backup(
    request: Request,
    x_internal_api_secret: str | None = Header(
        default=None,
        alias="x-internal-api-secret",
        description=INTERNAL_SECRET_HEADER_DESCRIPTION,
    ),
    service: ImportService = Depends(get_import_service),
) -> Response:
    ensure_trusted_internal_request(request, x_internal_api_secret)
    try:
        file_name, payload = service.download_posts_backup()
    except ImportValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    headers = {"content-disposition": f'attachment; filename="{file_name}"'}
    return Response(content=payload, status_code=200, headers=headers, media_type="application/zip")


@router.post(
    "/backups/load",
    response_model=BackupLoadRead,
    status_code=200,
    summary="Load posts backup ZIP",
    description=(
        "Restore posts and media from a backup ZIP. Existing posts are cleared before rebuild. "
        "Requires x-internal-api-secret."
    ),
    responses={
        200: {"description": "Backup restore finished"},
        400: {"description": "Invalid backup payload"},
        401: {"description": "Missing or invalid internal API secret"},
    },
)
async def load_posts_backup(
    request: Request,
    file: UploadFile = File(...),
    x_internal_api_secret: str | None = Header(
        default=None,
        alias="x-internal-api-secret",
        description=INTERNAL_SECRET_HEADER_DESCRIPTION,
    ),
    service: ImportService = Depends(get_import_service),
) -> BackupLoadRead:
    ensure_trusted_internal_request(request, x_internal_api_secret)
    try:
        payload = await file.read()
        return service.load_posts_backup(file.filename or "", payload)
    except ImportValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
