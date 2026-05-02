from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_post_comment_service
from app.api.security import optional_internal_secret, require_internal_secret
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
    slug: str,
    is_admin: bool = Depends(optional_internal_secret),
    service: PostCommentService = Depends(get_post_comment_service),
) -> PostCommentThreadList:
    try:
        return service.list_post_comments(slug, include_private=is_admin)
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
    slug: str,
    payload: PostCommentCreate,
    is_admin: bool = Depends(optional_internal_secret),
    service: PostCommentService = Depends(get_post_comment_service),
) -> PostCommentRead:
    try:
        return service.create_comment(slug, payload, is_admin=is_admin)
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
    comment_id: uuid.UUID,
    payload: PostCommentUpdate,
    is_admin: bool = Depends(optional_internal_secret),
    service: PostCommentService = Depends(get_post_comment_service),
) -> PostCommentRead:
    try:
        return service.update_comment(comment_id, payload, is_admin=is_admin)
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
    comment_id: uuid.UUID,
    payload: PostCommentDelete,
    is_admin: bool = Depends(optional_internal_secret),
    service: PostCommentService = Depends(get_post_comment_service),
) -> PostCommentRead:
    try:
        return service.delete_comment(comment_id, payload, is_admin=is_admin)
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
    dependencies=[Depends(require_internal_secret)],
)
def list_admin_comments(
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    post_slug: str | None = Query(default=None),
    service: PostCommentService = Depends(get_post_comment_service),
) -> AdminCommentFeed:
    return service.list_admin_comments(
        AdminCommentFeedQuery(limit=limit, offset=offset, post_slug=post_slug)
    )
