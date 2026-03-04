from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from fastapi import APIRouter, Depends
from fastapi import HTTPException
from fastapi import Query
from fastapi import Response

from app.api.deps import get_post_service
from app.models.post import PostStatus, PostVisibility
from app.schemas.post import PostCreate, PostRead
from app.services.post_service import PostService

router = APIRouter()


@router.get('', response_model=list[PostRead])
def list_posts(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    status: PostStatus | None = Query(default=None),
    visibility: PostVisibility | None = Query(default=None),
    service: PostService = Depends(get_post_service),
) -> list[PostRead]:
    return service.list_posts(limit=limit, offset=offset, status=status, visibility=visibility)


@router.get('/{slug}', response_model=PostRead)
def get_post_by_slug(
    slug: str,
    status: PostStatus | None = Query(default=None),
    visibility: PostVisibility | None = Query(default=None),
    service: PostService = Depends(get_post_service),
) -> PostRead:
    post = service.get_post_by_slug(slug=slug, status=status, visibility=visibility)
    if post is None:
        raise HTTPException(status_code=404, detail='post not found')
    return post


@router.post('', response_model=PostRead)
def create_post(
    payload: PostCreate,
    service: PostService = Depends(get_post_service),
) -> PostRead:
    try:
        return service.create_post(payload)
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail='post slug already exists') from exc


@router.put('/{slug}', response_model=PostRead)
def update_post_by_slug(
    slug: str,
    payload: PostCreate,
    service: PostService = Depends(get_post_service),
) -> PostRead:
    try:
        updated = service.update_post_by_slug(slug=slug, payload=payload)
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail='post slug already exists') from exc
    if updated is None:
        raise HTTPException(status_code=404, detail='post not found')
    return updated


@router.delete('/{slug}', status_code=204)
def delete_post_by_slug(
    slug: str,
    status: PostStatus | None = Query(default=None),
    visibility: PostVisibility | None = Query(default=None),
    service: PostService = Depends(get_post_service),
) -> Response:
    deleted = service.delete_post_by_slug(slug=slug, status=status, visibility=visibility)
    if not deleted:
        raise HTTPException(status_code=404, detail='post not found')
    return Response(status_code=204)
