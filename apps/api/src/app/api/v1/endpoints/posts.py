from __future__ import annotations

from typing import Literal

from sqlalchemy.exc import IntegrityError
from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.api.deps import get_post_service, get_slug_redirect_repository
from app.repositories.slug_redirect_repository import SlugRedirectRepository
from app.api.error_handlers import integrity_conflict_detail
from app.api.security import optional_internal_secret, require_internal_secret
from app.core.config import settings
from app.models.post import PostContentKind, PostLocale, PostStatus, PostVisibility
from app.schemas.post import PostCreate, PostRead, PostSummaryListRead
from app.services.post_service import PostService

router = APIRouter()


_POST_INTEGRITY_RULES: tuple[tuple[tuple[str, ...], str], ...] = (
    (("ix_posts_slug", "posts.slug", "posts_slug_key"), "post slug already exists"),
)


def _post_conflict_detail(exc: IntegrityError) -> str:
    return integrity_conflict_detail(
        exc,
        rules=_POST_INTEGRITY_RULES,
        fallback="post integrity conflict",
    )


def _public_visibility_filters(
    status: PostStatus | None,
    visibility: PostVisibility | None,
    *,
    is_internal_request: bool,
) -> tuple[PostStatus | None, PostVisibility | None]:
    if is_internal_request:
        return status, visibility
    return PostStatus.PUBLISHED, PostVisibility.PUBLIC


@router.get(
    '/summary',
    response_model=PostSummaryListRead,
    summary='List post summaries',
    description=(
        'Return post-card summaries without markdown bodies. Public callers are restricted to '
        'published/public posts. Internal callers may request draft/private filters via '
        'x-internal-api-secret.'
    ),
    responses={
        200: {'description': 'Post summaries returned'},
    },
)
def list_post_summaries(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    status: PostStatus | None = Query(default=None),
    visibility: PostVisibility | None = Query(default=None),
    content_kind: PostContentKind | None = Query(default=None),
    locale: PostLocale | None = Query(default=None),
    tag: list[str] | None = Query(
        default=None,
        description='Repeatable tag query parameter. Example: ?tag=fastapi&tag=astro',
    ),
    tag_match: Literal['any', 'all'] = Query(
        default='any',
        description='Tag match strategy. "any" matches at least one tag; "all" requires all requested tags.',
    ),
    query: str | None = Query(
        default=None,
        description='Optional search query matched against title and excerpt.',
    ),
    sort: Literal['latest', 'oldest', 'title'] = Query(
        default='latest',
        description='Archive sort mode.',
    ),
    is_internal_request: bool = Depends(optional_internal_secret),
    service: PostService = Depends(get_post_service),
) -> PostSummaryListRead:
    effective_status, effective_visibility = _public_visibility_filters(
        status, visibility, is_internal_request=is_internal_request
    )

    return service.list_post_summaries(
        limit=limit,
        offset=offset,
        status=effective_status,
        visibility=effective_visibility,
        tags=tag,
        tag_match=tag_match,
        query=query,
        content_kind=content_kind,
        sort=sort,
        include_private_visibility_counts=is_internal_request,
        locale=locale,
    )


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
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    status: PostStatus | None = Query(default=None),
    visibility: PostVisibility | None = Query(default=None),
    content_kind: PostContentKind | None = Query(default=None),
    locale: PostLocale | None = Query(default=None),
    tag: list[str] | None = Query(
        default=None,
        description='Repeatable tag query parameter. Example: ?tag=fastapi&tag=astro',
    ),
    tag_match: Literal['any', 'all'] = Query(
        default='any',
        description='Tag match strategy. "any" matches at least one tag; "all" requires all requested tags.',
    ),
    is_internal_request: bool = Depends(optional_internal_secret),
    service: PostService = Depends(get_post_service),
) -> list[PostRead]:
    effective_status, effective_visibility = _public_visibility_filters(
        status, visibility, is_internal_request=is_internal_request
    )

    return service.list_posts(
        limit=limit,
        offset=offset,
        status=effective_status,
        visibility=effective_visibility,
        content_kind=content_kind,
        tags=tag,
        tag_match=tag_match,
        locale=locale,
    )


@router.get(
    '/redirects/{old_slug}',
    summary='Resolve old blog slug to current blog slug',
    description='Resolve a redirect from an old blog slug to the canonical current slug. Returns 404 if no redirect exists or the target is no longer a published, public blog post.',
    responses={
        200: {'description': 'Redirect resolved', 'content': {'application/json': {'example': {'target_slug': 'current-slug'}}}},
        404: {'description': 'No active redirect for this slug'},
    },
)
def resolve_post_redirect(
    old_slug: str,
    locale: PostLocale = Query(...),
    redirect_repo: SlugRedirectRepository = Depends(get_slug_redirect_repository),
) -> dict[str, str]:
    resolution = redirect_repo.lookup_post_redirect(
        old_slug=old_slug,
        locale=locale,
        content_kind=PostContentKind.BLOG,
    )
    if resolution is None:
        raise HTTPException(status_code=404, detail='no redirect for this slug')
    redirect_repo.record_post_hit(redirect_id=resolution.redirect_id)
    return {'target_slug': resolution.target_slug}


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
    slug: str,
    status: PostStatus | None = Query(default=None),
    visibility: PostVisibility | None = Query(default=None),
    content_kind: PostContentKind | None = Query(default=None),
    locale: PostLocale | None = Query(default=None),
    is_internal_request: bool = Depends(optional_internal_secret),
    service: PostService = Depends(get_post_service),
) -> PostRead:
    effective_status, effective_visibility = _public_visibility_filters(
        status, visibility, is_internal_request=is_internal_request
    )

    post = service.get_post_by_slug(
        slug=slug,
        status=effective_status,
        visibility=effective_visibility,
        content_kind=content_kind,
        locale=locale,
    )
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
    dependencies=[Depends(require_internal_secret)],
)
def create_post(
    payload: PostCreate,
    service: PostService = Depends(get_post_service),
) -> PostRead:
    try:
        return service.create_post(payload)
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail=_post_conflict_detail(exc)) from exc


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
    dependencies=[Depends(require_internal_secret)],
)
def update_post_by_slug(
    slug: str,
    payload: PostCreate,
    service: PostService = Depends(get_post_service),
) -> PostRead:
    try:
        updated = service.update_post_by_slug(slug=slug, payload=payload)
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail=_post_conflict_detail(exc)) from exc
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
    dependencies=[Depends(require_internal_secret)],
)
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
