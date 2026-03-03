from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import get_post_service
from app.schemas.post import PostCreate, PostRead
from app.services.post_service import PostService

router = APIRouter()


@router.get('', response_model=list[PostRead])
def list_posts(
    limit: int = 20,
    offset: int = 0,
    service: PostService = Depends(get_post_service),
) -> list[PostRead]:
    return service.list_posts(limit=limit, offset=offset)


@router.post('', response_model=PostRead)
def create_post(
    payload: PostCreate,
    service: PostService = Depends(get_post_service),
) -> PostRead:
    return service.create_post(payload)