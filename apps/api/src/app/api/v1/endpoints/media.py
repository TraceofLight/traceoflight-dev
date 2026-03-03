from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import get_media_service
from app.schemas.media import MediaCreate, MediaRead, MediaUploadRequest, MediaUploadResponse
from app.services.media_service import MediaService

router = APIRouter()


@router.post('/upload-url', response_model=MediaUploadResponse)
def create_upload_url(
    payload: MediaUploadRequest,
    service: MediaService = Depends(get_media_service),
) -> MediaUploadResponse:
    return service.create_upload_url(payload)


@router.post('', response_model=MediaRead)
def register_media(
    payload: MediaCreate,
    service: MediaService = Depends(get_media_service),
) -> MediaRead:
    return service.register_media(payload)