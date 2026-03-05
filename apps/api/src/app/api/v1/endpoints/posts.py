from __future__ import annotations

import secrets
from typing import Literal

from sqlalchemy.exc import IntegrityError
from fastapi import APIRouter, Depends
from fastapi import Header
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


INTERNAL_SECRET_HEADER_DESCRIPTION = (
    'Internal shared secret for privileged filtering and write operations.'
)


def is_trusted_internal_request(request: Request, request_secret: str | None = None) -> bool:
    configured_secret = settings.internal_api_secret.strip()
    if not configured_secret:
        return False
    if request_secret is None:
        request_secret = request.headers.get('x-internal-api-secret', '')
    request_secret = request_secret.strip()
    if not request_secret:
        return False
    return secrets.compare_digest(request_secret, configured_secret)


def ensure_trusted_internal_request(request: Request, request_secret: str | None = None) -> None:
    if is_trusted_internal_request(request, request_secret):
        return
    raise HTTPException(status_code=401, detail='unauthorized')


def _integrity_conflict_detail(exc: IntegrityError) -> str:
    source = getattr(exc, "orig", exc)
    message = str(source).lower()
    if "ix_posts_slug" in message or "posts.slug" in message or "posts_slug_key" in message:
        return "post slug already exists"
    return "post integrity conflict"


@router.get(
    '',
    response_model=list[PostRead],
    summary='List posts',
    description=(
        'Return posts list. Public callers are restricted to published/public posts. '
        'Internal callers may request draft/private filters via x-internal-api-secret.'
    ),
    responses={
        200: {'description': 'Posts returned'},
    },
)
def list_posts(
    request: Request,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    status: PostStatus | None = Query(default=None),
    visibility: PostVisibility | None = Query(default=None),
    tag: list[str] | None = Query(
        default=None,
        description='Repeatable tag query parameter. Example: ?tag=fastapi&tag=astro',
    ),
    tag_match: Literal['any', 'all'] = Query(
        default='any',
        description='Tag match strategy. "any" matches at least one tag; "all" requires all requested tags.',
    ),
    x_internal_api_secret: str | None = Header(
        default=None,
        alias='x-internal-api-secret',
        description=INTERNAL_SECRET_HEADER_DESCRIPTION,
    ),
    service: PostService = Depends(get_post_service),
) -> list[PostRead]:
    """List posts with automatic public fallback for non-internal callers."""
    effective_status = status
    effective_visibility = visibility
    if not is_trusted_internal_request(request, x_internal_api_secret):
        effective_status = PostStatus.PUBLISHED
        effective_visibility = PostVisibility.PUBLIC

    return service.list_posts(
        limit=limit,
        offset=offset,
        status=effective_status,
        visibility=effective_visibility,
        tags=tag,
        tag_match=tag_match,
    )


@router.get(
    '/{slug}',
    response_model=PostRead,
    summary='Get post by slug',
    description=(
        'Return a single post by slug. Public callers can access published/public posts only. '
        'Internal callers may use x-internal-api-secret to query draft/private posts.'
    ),
    responses={
        200: {'description': 'Post returned'},
        404: {'description': 'Post not found'},
    },
)
def get_post_by_slug(
    request: Request,
    slug: str,
    status: PostStatus | None = Query(default=None),
    visibility: PostVisibility | None = Query(default=None),
    x_internal_api_secret: str | None = Header(
        default=None,
        alias='x-internal-api-secret',
        description=INTERNAL_SECRET_HEADER_DESCRIPTION,
    ),
    service: PostService = Depends(get_post_service),
) -> PostRead:
    """Fetch one post while applying public fallback to non-internal callers."""
    effective_status = status
    effective_visibility = visibility
    if not is_trusted_internal_request(request, x_internal_api_secret):
        effective_status = PostStatus.PUBLISHED
        effective_visibility = PostVisibility.PUBLIC

    post = service.get_post_by_slug(slug=slug, status=effective_status, visibility=effective_visibility)
    if post is None:
        raise HTTPException(status_code=404, detail='post not found')
    return post


@router.post(
    '',
    response_model=PostRead,
    summary='Create post',
    description='Create a post record. Requires x-internal-api-secret authentication header.',
    responses={
        200: {'description': 'Post created'},
        401: {'description': 'Missing or invalid internal API secret'},
        409: {'description': 'Post slug already exists'},
    },
)
def create_post(
    request: Request,
    payload: PostCreate,
    x_internal_api_secret: str | None = Header(
        default=None,
        alias='x-internal-api-secret',
        description=INTERNAL_SECRET_HEADER_DESCRIPTION,
    ),
    service: PostService = Depends(get_post_service),
) -> PostRead:
    """Create a post using privileged internal credentials."""
    ensure_trusted_internal_request(request, x_internal_api_secret)
    try:
        return service.create_post(payload)
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail=_integrity_conflict_detail(exc)) from exc


@router.put(
    '/{slug}',
    response_model=PostRead,
    summary='Update post',
    description='Update an existing post by slug. Requires x-internal-api-secret authentication header.',
    responses={
        200: {'description': 'Post updated'},
        401: {'description': 'Missing or invalid internal API secret'},
        404: {'description': 'Post not found'},
        409: {'description': 'Post slug already exists'},
    },
)
def update_post_by_slug(
    request: Request,
    slug: str,
    payload: PostCreate,
    x_internal_api_secret: str | None = Header(
        default=None,
        alias='x-internal-api-secret',
        description=INTERNAL_SECRET_HEADER_DESCRIPTION,
    ),
    service: PostService = Depends(get_post_service),
) -> PostRead:
    """Update post content and publication metadata."""
    ensure_trusted_internal_request(request, x_internal_api_secret)
    try:
        updated = service.update_post_by_slug(slug=slug, payload=payload)
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail=_integrity_conflict_detail(exc)) from exc
    if updated is None:
        raise HTTPException(status_code=404, detail='post not found')
    return updated


@router.delete(
    '/{slug}',
    status_code=204,
    summary='Delete post',
    description='Delete a post by slug. Requires x-internal-api-secret authentication header.',
    responses={
        204: {'description': 'Post deleted'},
        401: {'description': 'Missing or invalid internal API secret'},
        404: {'description': 'Post not found'},
    },
)
def delete_post_by_slug(
    request: Request,
    slug: str,
    status: PostStatus | None = Query(default=None),
    visibility: PostVisibility | None = Query(default=None),
    x_internal_api_secret: str | None = Header(
        default=None,
        alias='x-internal-api-secret',
        description=INTERNAL_SECRET_HEADER_DESCRIPTION,
    ),
    service: PostService = Depends(get_post_service),
) -> Response:
    """Delete a post when privileged internal authentication is provided."""
    ensure_trusted_internal_request(request, x_internal_api_secret)
    deleted = service.delete_post_by_slug(slug=slug, status=status, visibility=visibility)
    if not deleted:
        raise HTTPException(status_code=404, detail='post not found')
    return Response(status_code=204)
