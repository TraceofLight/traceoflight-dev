from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request

from app.api.deps import get_post_comment_service
from app.api.v1.endpoints.posts import (
    INTERNAL_SECRET_HEADER_DESCRIPTION,
    ensure_trusted_internal_request,
    is_trusted_internal_request,
)
from app.schemas.post_comment import (
    AdminCommentFeed,
    AdminCommentFeedQuery,
    PostCommentCreate,
    PostCommentDelete,
    PostCommentRead,
    PostCommentThreadList,
    PostCommentUpdate,
)
from app.services.post_comment_service import (
    CommentAuthError,
    CommentConflictError,
    CommentNotFoundError,
    PostCommentService,
)

router = APIRouter()


@router.get(
    "/posts/{slug}/comments",
    response_model=PostCommentThreadList,
    summary="List post comments",
    description=(
        "Return comments for a post. Public callers receive private comments as placeholders. "
        "Internal callers may include private bodies with x-internal-api-secret."
    ),
)
def list_post_comments(
    request: Request,
    slug: str,
    x_internal_api_secret: str | None = Header(
        default=None,
        alias="x-internal-api-secret",
        description=INTERNAL_SECRET_HEADER_DESCRIPTION,
    ),
    service: PostCommentService = Depends(get_post_comment_service),
) -> PostCommentThreadList:
    include_private = is_trusted_internal_request(request, x_internal_api_secret)
    try:
        return service.list_post_comments(slug, include_private=include_private)
    except CommentNotFoundError as exc:
        raise HTTPException(status_code=404, detail="post not found") from exc


@router.post(
    "/posts/{slug}/comments",
    response_model=PostCommentRead,
    summary="Create post comment",
    description=(
        "Create a guest or admin-authored comment. Internal callers create admin comments; "
        "public callers create guest comments with name/password."
    ),
    responses={401: {"description": "Unauthorized"}, 404: {"description": "Post not found"}},
)
def create_post_comment(
    request: Request,
    slug: str,
    payload: PostCommentCreate,
    x_internal_api_secret: str | None = Header(
        default=None,
        alias="x-internal-api-secret",
        description=INTERNAL_SECRET_HEADER_DESCRIPTION,
    ),
    service: PostCommentService = Depends(get_post_comment_service),
) -> PostCommentRead:
    try:
        return service.create_comment(
            slug,
            payload,
            is_admin=is_trusted_internal_request(request, x_internal_api_secret),
        )
    except CommentNotFoundError as exc:
        raise HTTPException(status_code=404, detail="post not found") from exc
    except CommentAuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except CommentConflictError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch(
    "/comments/{comment_id}",
    response_model=PostCommentRead,
    summary="Update comment",
    responses={401: {"description": "Unauthorized"}, 404: {"description": "Comment not found"}},
)
def update_comment(
    request: Request,
    comment_id: uuid.UUID,
    payload: PostCommentUpdate,
    x_internal_api_secret: str | None = Header(
        default=None,
        alias="x-internal-api-secret",
        description=INTERNAL_SECRET_HEADER_DESCRIPTION,
    ),
    service: PostCommentService = Depends(get_post_comment_service),
) -> PostCommentRead:
    try:
        return service.update_comment(
            comment_id,
            payload,
            is_admin=is_trusted_internal_request(request, x_internal_api_secret),
        )
    except CommentNotFoundError as exc:
        raise HTTPException(status_code=404, detail="comment not found") from exc
    except CommentAuthError as exc:
        raise HTTPException(status_code=401, detail="authentication failed") from exc
    except CommentConflictError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete(
    "/comments/{comment_id}",
    response_model=PostCommentRead,
    summary="Delete comment",
    responses={401: {"description": "Unauthorized"}, 404: {"description": "Comment not found"}},
)
def delete_comment(
    request: Request,
    comment_id: uuid.UUID,
    payload: PostCommentDelete,
    x_internal_api_secret: str | None = Header(
        default=None,
        alias="x-internal-api-secret",
        description=INTERNAL_SECRET_HEADER_DESCRIPTION,
    ),
    service: PostCommentService = Depends(get_post_comment_service),
) -> PostCommentRead:
    try:
        return service.delete_comment(
            comment_id,
            payload,
            is_admin=is_trusted_internal_request(request, x_internal_api_secret),
        )
    except CommentNotFoundError as exc:
        raise HTTPException(status_code=404, detail="comment not found") from exc
    except CommentAuthError as exc:
        raise HTTPException(status_code=401, detail="authentication failed") from exc
    except CommentConflictError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get(
    "/admin/comments",
    response_model=AdminCommentFeed,
    summary="List admin comments",
    description="Return newest-first comment review feed for admin viewers only.",
    responses={401: {"description": "Unauthorized"}},
)
def list_admin_comments(
    request: Request,
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    post_slug: str | None = Query(default=None),
    x_internal_api_secret: str | None = Header(
        default=None,
        alias="x-internal-api-secret",
        description=INTERNAL_SECRET_HEADER_DESCRIPTION,
    ),
    service: PostCommentService = Depends(get_post_comment_service),
) -> AdminCommentFeed:
    ensure_trusted_internal_request(request, x_internal_api_secret)
    return service.list_admin_comments(
        AdminCommentFeedQuery(limit=limit, offset=offset, post_slug=post_slug)
    )
