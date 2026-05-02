from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile

from app.api.deps import get_import_service
from app.api.security import require_internal_secret
from app.schemas.imports import BackupLoadRead
from app.services.import_service import ImportService, ImportValidationError

router = APIRouter(dependencies=[Depends(require_internal_secret)])


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
    service: ImportService = Depends(get_import_service),
) -> Response:
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
    file: UploadFile = File(...),
    service: ImportService = Depends(get_import_service),
) -> BackupLoadRead:
    try:
        payload = await file.read()
        return service.load_posts_backup(file.filename or "", payload)
    except ImportValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
