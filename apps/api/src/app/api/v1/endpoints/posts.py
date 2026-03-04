from __future__ import annotations

import secrets

from sqlalchemy.exc import IntegrityError
from fastapi import APIRouter, Depends
from fastapi import HTTPException
from fastapi import Query
from fastapi import Request
from fastapi import Response

from app.api.deps import get_post_service
from app.core.config import settings
from app.models.post import PostStatus, PostVisibility
from app.schemas.post import PostCreate, PostRead
from app.services.post_service import PostService

router = APIRouter()


def is_trusted_internal_request(request: Request) -> bool:
    configured_secret = settings.internal_api_secret.strip()
    if not configured_secret:
        return False
    request_secret = request.headers.get('x-internal-api-secret', '').strip()
    if not request_secret:
        return False
    return secrets.compare_digest(request_secret, configured_secret)


def ensure_trusted_internal_request(request: Request) -> None:
    if is_trusted_internal_request(request):
        return
    raise HTTPException(status_code=401, detail='unauthorized')


@router.get('', response_model=list[PostRead])
def list_posts(
    request: Request,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    status: PostStatus | None = Query(default=None),
    visibility: PostVisibility | None = Query(default=None),
    service: PostService = Depends(get_post_service),
) -> list[PostRead]:
    effective_status = status
    effective_visibility = visibility
    if not is_trusted_internal_request(request):
        effective_status = PostStatus.PUBLISHED
        effective_visibility = PostVisibility.PUBLIC

    return service.list_posts(limit=limit, offset=offset, status=effective_status, visibility=effective_visibility)


@router.get('/{slug}', response_model=PostRead)
def get_post_by_slug(
    request: Request,
    slug: str,
    status: PostStatus | None = Query(default=None),
    visibility: PostVisibility | None = Query(default=None),
    service: PostService = Depends(get_post_service),
) -> PostRead:
    effective_status = status
    effective_visibility = visibility
    if not is_trusted_internal_request(request):
        effective_status = PostStatus.PUBLISHED
        effective_visibility = PostVisibility.PUBLIC

    post = service.get_post_by_slug(slug=slug, status=effective_status, visibility=effective_visibility)
    if post is None:
        raise HTTPException(status_code=404, detail='post not found')
    return post


@router.post('', response_model=PostRead)
def create_post(
    request: Request,
    payload: PostCreate,
    service: PostService = Depends(get_post_service),
) -> PostRead:
    ensure_trusted_internal_request(request)
    try:
        return service.create_post(payload)
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail='post slug already exists') from exc


@router.put('/{slug}', response_model=PostRead)
def update_post_by_slug(
    request: Request,
    slug: str,
    payload: PostCreate,
    service: PostService = Depends(get_post_service),
) -> PostRead:
    ensure_trusted_internal_request(request)
    try:
        updated = service.update_post_by_slug(slug=slug, payload=payload)
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail='post slug already exists') from exc
    if updated is None:
        raise HTTPException(status_code=404, detail='post not found')
    return updated


@router.delete('/{slug}', status_code=204)
def delete_post_by_slug(
    request: Request,
    slug: str,
    status: PostStatus | None = Query(default=None),
    visibility: PostVisibility | None = Query(default=None),
    service: PostService = Depends(get_post_service),
) -> Response:
    ensure_trusted_internal_request(request)
    deleted = service.delete_post_by_slug(slug=slug, status=status, visibility=visibility)
    if not deleted:
        raise HTTPException(status_code=404, detail='post not found')
    return Response(status_code=204)
