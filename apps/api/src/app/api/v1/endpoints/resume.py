from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response

from app.api.deps import get_resume_service
from app.api.security import require_internal_secret
from app.schemas.resume import ResumeStatusRead
from app.services.resume_service import PdfAssetService

router = APIRouter()


@router.get(
    "/status",
    response_model=ResumeStatusRead,
    summary="Read resume PDF status",
)
def get_resume_status(
    service: PdfAssetService = Depends(get_resume_service),
) -> ResumeStatusRead:
    return ResumeStatusRead.model_validate(service.get_status())


@router.get(
    "",
    summary="Download public resume PDF",
)
def get_resume_pdf(
    service: PdfAssetService = Depends(get_resume_service),
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
    dependencies=[Depends(require_internal_secret)],
)
async def upload_resume_pdf(
    file: UploadFile = File(...),
    service: PdfAssetService = Depends(get_resume_service),
) -> ResumeStatusRead:
    payload = service.upload_pdf(
        filename=file.filename or "",
        data=await file.read(),
        content_type=file.content_type,
    )
    return ResumeStatusRead.model_validate(payload)


@router.delete(
    "",
    response_model=ResumeStatusRead,
    summary="Delete resume PDF",
    dependencies=[Depends(require_internal_secret)],
)
def delete_resume_pdf(
    service: PdfAssetService = Depends(get_resume_service),
) -> ResumeStatusRead:
    return ResumeStatusRead.model_validate(service.delete_pdf())
