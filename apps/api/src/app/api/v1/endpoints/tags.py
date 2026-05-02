from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.api.deps import get_tag_service
from app.api.security import require_internal_secret
from app.schemas.tag import TagCreate, TagRead, TagUpdate
from app.services.tag_service import TagInUseError, TagService, TagValidationError

router = APIRouter(dependencies=[Depends(require_internal_secret)])


@router.get(
    "",
    response_model=list[TagRead],
    summary="List tags",
    description=(
        "List or search tags for writer autosuggest and admin filtering. "
        "Requires x-internal-api-secret authentication header."
    ),
    responses={
        200: {"description": "Tags returned"},
        401: {"description": "Missing or invalid internal API secret"},
    },
)
def list_tags(
    query: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    service: TagService = Depends(get_tag_service),
) -> list[TagRead]:
    return service.list_tags(query=query, limit=limit, offset=offset)


@router.post(
    "",
    response_model=TagRead,
    summary="Create tag",
    description="Create a tag. Requires x-internal-api-secret authentication header.",
    responses={
        200: {"description": "Tag created"},
        400: {"description": "Tag payload is invalid"},
        401: {"description": "Missing or invalid internal API secret"},
        409: {"description": "Tag slug already exists"},
    },
)
def create_tag(
    payload: TagCreate,
    service: TagService = Depends(get_tag_service),
) -> TagRead:
    try:
        return service.create_tag(payload)
    except TagValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail="tag slug already exists") from exc


@router.patch(
    "/{slug}",
    response_model=TagRead,
    summary="Update tag",
    description="Update a tag by slug. Requires x-internal-api-secret authentication header.",
    responses={
        200: {"description": "Tag updated"},
        400: {"description": "Tag payload is invalid"},
        401: {"description": "Missing or invalid internal API secret"},
        404: {"description": "Tag not found"},
        409: {"description": "Tag slug already exists"},
    },
)
def update_tag(
    slug: str,
    payload: TagUpdate,
    service: TagService = Depends(get_tag_service),
) -> TagRead:
    if payload.slug is None and payload.label is None:
        raise HTTPException(status_code=400, detail="at least one field is required")
    try:
        updated = service.update_tag(slug, payload)
    except TagValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail="tag slug already exists") from exc
    if updated is None:
        raise HTTPException(status_code=404, detail="tag not found")
    return updated


@router.delete(
    "/{slug}",
    status_code=204,
    summary="Delete tag",
    description="Delete a tag by slug. Requires x-internal-api-secret authentication header.",
    responses={
        204: {"description": "Tag deleted"},
        401: {"description": "Missing or invalid internal API secret"},
        404: {"description": "Tag not found"},
        409: {"description": "Tag is linked to one or more posts"},
    },
)
def delete_tag(
    slug: str,
    force: bool = Query(default=False),
    service: TagService = Depends(get_tag_service),
) -> Response:
    try:
        deleted = service.delete_tag(slug, force=force)
    except TagInUseError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if not deleted:
        raise HTTPException(status_code=404, detail="tag not found")
    return Response(status_code=204)
