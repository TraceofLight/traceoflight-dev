from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from sqlalchemy.exc import IntegrityError

from app.api.deps import get_series_service
from app.core.config import settings
from app.repositories.series_repository import SeriesConflictError, SeriesValidationError
from app.schemas.series import SeriesDetailRead, SeriesPostsReplace, SeriesRead, SeriesUpsert
from app.services.series_service import SeriesService

router = APIRouter()


INTERNAL_SECRET_HEADER_DESCRIPTION = (
    "Internal shared secret for privileged filtering and write operations."
)


def is_trusted_internal_request(request: Request, request_secret: str | None = None) -> bool:
    configured_secret = settings.internal_api_secret.strip()
    if not configured_secret:
        return False
    if request_secret is None:
        request_secret = request.headers.get("x-internal-api-secret", "")
    request_secret = request_secret.strip()
    if not request_secret:
        return False
    return secrets.compare_digest(request_secret, configured_secret)


def ensure_trusted_internal_request(request: Request, request_secret: str | None = None) -> None:
    if is_trusted_internal_request(request, request_secret):
        return
    raise HTTPException(status_code=401, detail="unauthorized")


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
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    include_private: bool | None = Query(
        default=None,
        description="When internal secret is valid, controls whether private/draft-linked posts are included.",
    ),
    x_internal_api_secret: str | None = Header(
        default=None,
        alias="x-internal-api-secret",
        description=INTERNAL_SECRET_HEADER_DESCRIPTION,
    ),
    service: SeriesService = Depends(get_series_service),
) -> list[SeriesRead]:
    trusted_internal = is_trusted_internal_request(request, x_internal_api_secret)
    effective_include_private = (include_private if include_private is not None else True) if trusted_internal else False
    return service.list_series(include_private=effective_include_private, limit=limit, offset=offset)


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
    request: Request,
    slug: str,
    include_private: bool | None = Query(
        default=None,
        description="When internal secret is valid, controls whether private/draft-linked posts are included.",
    ),
    x_internal_api_secret: str | None = Header(
        default=None,
        alias="x-internal-api-secret",
        description=INTERNAL_SECRET_HEADER_DESCRIPTION,
    ),
    service: SeriesService = Depends(get_series_service),
) -> SeriesDetailRead:
    trusted_internal = is_trusted_internal_request(request, x_internal_api_secret)
    effective_include_private = (include_private if include_private is not None else True) if trusted_internal else False
    series = service.get_series_by_slug(slug=slug, include_private=effective_include_private)
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
)
def create_series(
    request: Request,
    payload: SeriesUpsert,
    x_internal_api_secret: str | None = Header(
        default=None,
        alias="x-internal-api-secret",
        description=INTERNAL_SECRET_HEADER_DESCRIPTION,
    ),
    service: SeriesService = Depends(get_series_service),
) -> SeriesDetailRead:
    ensure_trusted_internal_request(request, x_internal_api_secret)
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
)
def update_series(
    request: Request,
    slug: str,
    payload: SeriesUpsert,
    x_internal_api_secret: str | None = Header(
        default=None,
        alias="x-internal-api-secret",
        description=INTERNAL_SECRET_HEADER_DESCRIPTION,
    ),
    service: SeriesService = Depends(get_series_service),
) -> SeriesDetailRead:
    ensure_trusted_internal_request(request, x_internal_api_secret)
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
)
def delete_series(
    request: Request,
    slug: str,
    x_internal_api_secret: str | None = Header(
        default=None,
        alias="x-internal-api-secret",
        description=INTERNAL_SECRET_HEADER_DESCRIPTION,
    ),
    service: SeriesService = Depends(get_series_service),
) -> Response:
    ensure_trusted_internal_request(request, x_internal_api_secret)
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
)
def replace_series_posts(
    request: Request,
    slug: str,
    payload: SeriesPostsReplace,
    x_internal_api_secret: str | None = Header(
        default=None,
        alias="x-internal-api-secret",
        description=INTERNAL_SECRET_HEADER_DESCRIPTION,
    ),
    service: SeriesService = Depends(get_series_service),
) -> SeriesDetailRead:
    ensure_trusted_internal_request(request, x_internal_api_secret)
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
