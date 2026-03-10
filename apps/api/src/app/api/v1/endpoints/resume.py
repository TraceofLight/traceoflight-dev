from __future__ import annotations

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from fastapi.responses import Response

from app.api.deps import get_resume_service
from app.core.config import settings
from app.schemas.resume import ResumeStatusRead
from app.services.resume_service import ResumeService

router = APIRouter()


def _require_internal_secret(header_value: str | None) -> None:
    configured_secret = settings.internal_api_secret.strip()
    if not configured_secret:
        raise HTTPException(status_code=503, detail="internal api secret is not configured")
    if (header_value or "").strip() != configured_secret:
        raise HTTPException(status_code=401, detail="unauthorized")


@router.get(
    "/status",
    response_model=ResumeStatusRead,
    summary="Read resume PDF status",
)
def get_resume_status(
    service: ResumeService = Depends(get_resume_service),
) -> ResumeStatusRead:
    return ResumeStatusRead.model_validate(service.get_status())


@router.get(
    "",
    summary="Download public resume PDF",
)
def get_resume_pdf(
    service: ResumeService = Depends(get_resume_service),
) -> Response:
    payload = service.download_pdf()
    if payload is None:
        raise HTTPException(status_code=404, detail="resume pdf is not registered")

    return Response(
        content=payload.body,
        media_type=payload.content_type,
        headers={
            "content-disposition": f'inline; filename="{payload.filename}"',
        },
    )


@router.post(
    "",
    response_model=ResumeStatusRead,
    summary="Upload or replace resume PDF",
)
async def upload_resume_pdf(
    file: UploadFile = File(...),
    x_internal_api_secret: str | None = Header(default=None),
    service: ResumeService = Depends(get_resume_service),
) -> ResumeStatusRead:
    _require_internal_secret(x_internal_api_secret)
    payload = service.upload_pdf(
        filename=file.filename or "",
        data=await file.read(),
        content_type=file.content_type,
    )
    return ResumeStatusRead.model_validate(payload)
