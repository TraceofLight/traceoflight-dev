from __future__ import annotations

from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, HTTPException, Request as FastAPIRequest

from app.api.deps import get_media_service
from app.schemas.media import MediaCreate, MediaRead, MediaUploadRequest, MediaUploadResponse
from app.services.media_service import MediaService

router = APIRouter()


@router.post(
    '/upload-url',
    response_model=MediaUploadResponse,
    summary='Create upload URL',
    description='Issue a pre-signed object storage upload URL for a client-provided media descriptor.',
    responses={
        200: {'description': 'Pre-signed upload URL issued'},
    },
)
def create_upload_url(
    payload: MediaUploadRequest,
    service: MediaService = Depends(get_media_service),
) -> MediaUploadResponse:
    """Create a pre-signed upload URL for object storage."""
    return service.create_upload_url(payload)


@router.post(
    '',
    response_model=MediaRead,
    summary='Register uploaded media',
    description='Persist metadata for media that has already been uploaded to object storage.',
    responses={
        200: {'description': 'Media metadata registered'},
    },
)
def register_media(
    payload: MediaCreate,
    service: MediaService = Depends(get_media_service),
) -> MediaRead:
    """Register uploaded media metadata in the database."""
    return service.register_media(payload)


@router.post(
    '/upload-proxy',
    summary='Proxy upload to object storage',
    description=(
        'Forward raw request body to a pre-signed object storage URL. '
        'Required header: x-upload-url. Optional header: x-upload-content-type.'
    ),
    responses={
        200: {'description': 'Binary payload uploaded successfully'},
        400: {'description': 'Missing header/body or unsupported protocol'},
        502: {'description': 'Object storage upload request failed'},
    },
    openapi_extra={
        'parameters': [
            {
                'name': 'x-upload-url',
                'in': 'header',
                'required': True,
                'schema': {'type': 'string'},
                'description': 'Pre-signed PUT URL from object storage.',
            },
            {
                'name': 'x-upload-content-type',
                'in': 'header',
                'required': False,
                'schema': {'type': 'string'},
                'description': 'Content-Type forwarded to object storage PUT request.',
            },
        ]
    },
)
async def upload_media_proxy(request: FastAPIRequest) -> dict[str, bool]:
    """Upload binary payload to object storage via server-side proxy."""
    upload_url = str(request.headers.get('x-upload-url', '')).strip()
    content_type = str(
        request.headers.get('x-upload-content-type')
        or request.headers.get('content-type')
        or 'application/octet-stream'
    ).strip()
    body = await request.body()

    if not upload_url:
        raise HTTPException(status_code=400, detail='x-upload-url header is required')
    if not body:
        raise HTTPException(status_code=400, detail='request body is empty')

    parsed = urlparse(upload_url)
    if parsed.scheme not in ('http', 'https'):
        raise HTTPException(status_code=400, detail='upload_url protocol is not supported')

    proxy_request = Request(
        upload_url,
        data=body,
        method='PUT',
        headers={'Content-Type': content_type or 'application/octet-stream'},
    )

    try:
        with urlopen(proxy_request, timeout=30) as response:
            status_code = response.getcode()
            if status_code < 200 or status_code >= 300:
                raise HTTPException(
                    status_code=502,
                    detail=f'object storage upload failed with status {status_code}',
                )
    except HTTPError as exc:
        message = exc.read().decode('utf-8', errors='ignore').strip()
        raise HTTPException(
            status_code=502,
            detail=message or f'object storage upload failed with status {exc.code}',
        ) from exc
    except URLError as exc:
        raise HTTPException(status_code=502, detail=f'object storage upload request failed: {exc.reason}') from exc

    return {'ok': True}
