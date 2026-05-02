from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.exc import IntegrityError

from app.api.deps import get_series_service
from app.api.security import optional_internal_secret, require_internal_secret
from app.repositories.series_repository import SeriesConflictError, SeriesValidationError
from app.schemas.series import (
    SeriesDetailRead,
    SeriesOrderReplace,
    SeriesPostsReplace,
    SeriesRead,
    SeriesUpsert,
)
from app.services.series_service import SeriesService

router = APIRouter()


def _integrity_conflict_detail(exc: IntegrityError) -> str:
    source = getattr(exc, "orig", exc)
    message = str(source).lower()
    if "ix_series_slug" in message or "series.slug" in message:
        return "series slug already exists"
    if "uq_series_posts_post_id" in message:
        return "post already belongs to another series"
    if "uq_series_posts_series_order" in message:
        return "series order index conflict"
    return "series integrity conflict"


def _resolve_include_private(include_private: bool | None, trusted_internal: bool) -> bool:
    if not trusted_internal:
        return False
    return include_private if include_private is not None else True


@router.get(
    "",
    response_model=list[SeriesRead],
    summary="List series",
    description=(
        "Return series list. Public callers receive only public-visible series. "
        "Internal callers may include private/draft-linked series using x-internal-api-secret."
    ),
)
def list_series(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    include_private: bool | None = Query(
        default=None,
        description="When internal secret is valid, controls whether private/draft-linked posts are included.",
    ),
    trusted_internal: bool = Depends(optional_internal_secret),
    service: SeriesService = Depends(get_series_service),
) -> list[SeriesRead]:
    return service.list_series(
        include_private=_resolve_include_private(include_private, trusted_internal),
        limit=limit,
        offset=offset,
    )


@router.put(
    "/order",
    response_model=list[SeriesRead],
    summary="Replace ordered series list",
    responses={
        400: {"description": "Invalid series slug payload"},
        401: {"description": "Missing or invalid internal API secret"},
    },
    dependencies=[Depends(require_internal_secret)],
)
def replace_series_order(
    payload: SeriesOrderReplace,
    service: SeriesService = Depends(get_series_service),
) -> list[SeriesRead]:
    try:
        return service.replace_series_order(payload.series_slugs)
    except SeriesValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get(
    "/{slug}",
    response_model=SeriesDetailRead,
    summary="Get series by slug",
    description=(
        "Return series detail with ordered posts. Public callers only see published/public posts. "
        "Internal callers can view all linked posts."
    ),
    responses={404: {"description": "Series not found"}},
)
def get_series_by_slug(
    slug: str,
    include_private: bool | None = Query(
        default=None,
        description="When internal secret is valid, controls whether private/draft-linked posts are included.",
    ),
    trusted_internal: bool = Depends(optional_internal_secret),
    service: SeriesService = Depends(get_series_service),
) -> SeriesDetailRead:
    series = service.get_series_by_slug(
        slug=slug,
        include_private=_resolve_include_private(include_private, trusted_internal),
    )
    if series is None:
        raise HTTPException(status_code=404, detail="series not found")
    return series


@router.post(
    "",
    response_model=SeriesDetailRead,
    summary="Create series",
    description="Create series metadata. Requires x-internal-api-secret authentication header.",
    responses={
        401: {"description": "Missing or invalid internal API secret"},
        409: {"description": "Series slug conflict"},
    },
    dependencies=[Depends(require_internal_secret)],
)
def create_series(
    payload: SeriesUpsert,
    service: SeriesService = Depends(get_series_service),
) -> SeriesDetailRead:
    try:
        return service.create_series(payload)
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail=_integrity_conflict_detail(exc)) from exc


@router.put(
    "/{slug}",
    response_model=SeriesDetailRead,
    summary="Update series",
    description="Update series metadata by slug. Requires x-internal-api-secret authentication header.",
    responses={
        401: {"description": "Missing or invalid internal API secret"},
        404: {"description": "Series not found"},
        409: {"description": "Series slug conflict"},
    },
    dependencies=[Depends(require_internal_secret)],
)
def update_series(
    slug: str,
    payload: SeriesUpsert,
    service: SeriesService = Depends(get_series_service),
) -> SeriesDetailRead:
    try:
        updated = service.update_series_by_slug(slug=slug, payload=payload)
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail=_integrity_conflict_detail(exc)) from exc
    if updated is None:
        raise HTTPException(status_code=404, detail="series not found")
    return updated


@router.delete(
    "/{slug}",
    status_code=204,
    summary="Delete series",
    description="Delete series by slug. Requires x-internal-api-secret authentication header.",
    responses={
        401: {"description": "Missing or invalid internal API secret"},
        404: {"description": "Series not found"},
    },
    dependencies=[Depends(require_internal_secret)],
)
def delete_series(
    slug: str,
    service: SeriesService = Depends(get_series_service),
) -> Response:
    deleted = service.delete_series_by_slug(slug=slug)
    if not deleted:
        raise HTTPException(status_code=404, detail="series not found")
    return Response(status_code=204)


@router.put(
    "/{slug}/posts",
    response_model=SeriesDetailRead,
    summary="Replace ordered series posts",
    description=(
        "Replace ordered post slug list for a series. "
        "Requires x-internal-api-secret authentication header."
    ),
    responses={
        400: {"description": "Invalid post slug payload"},
        401: {"description": "Missing or invalid internal API secret"},
        404: {"description": "Series not found"},
        409: {"description": "Post assignment conflict"},
    },
    dependencies=[Depends(require_internal_secret)],
)
def replace_series_posts(
    slug: str,
    payload: SeriesPostsReplace,
    service: SeriesService = Depends(get_series_service),
) -> SeriesDetailRead:
    try:
        replaced = service.replace_series_posts_by_slug(slug=slug, post_slugs=payload.post_slugs)
    except SeriesValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SeriesConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail=_integrity_conflict_detail(exc)) from exc

    if replaced is None:
        raise HTTPException(status_code=404, detail="series not found")
    return replaced
