from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request

from app.api.deps import get_project_service
from app.core.config import settings
from app.schemas.project import ProjectRead, ProjectsOrderReplace
from app.services.project_service import ProjectService

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


@router.get("", response_model=list[ProjectRead], summary="List published projects")
def list_projects(
    request: Request,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    include_private: bool | None = Query(default=None),
    x_internal_api_secret: str | None = Header(
        default=None,
        alias="x-internal-api-secret",
        description=INTERNAL_SECRET_HEADER_DESCRIPTION,
    ),
    service: ProjectService = Depends(get_project_service),
) -> list[ProjectRead]:
    trusted_internal = is_trusted_internal_request(request, x_internal_api_secret)
    effective_include_private = (include_private if include_private is not None else True) if trusted_internal else False
    return service.list_projects(limit=limit, offset=offset, include_private=effective_include_private)


@router.get("/{slug}", response_model=ProjectRead, summary="Get project detail")
def get_project_by_slug(
    request: Request,
    slug: str,
    include_private: bool | None = Query(default=None),
    x_internal_api_secret: str | None = Header(
        default=None,
        alias="x-internal-api-secret",
        description=INTERNAL_SECRET_HEADER_DESCRIPTION,
    ),
    service: ProjectService = Depends(get_project_service),
) -> ProjectRead:
    trusted_internal = is_trusted_internal_request(request, x_internal_api_secret)
    effective_include_private = (include_private if include_private is not None else True) if trusted_internal else False
    project = service.get_project_by_slug(slug=slug, include_private=effective_include_private)
    if project is None:
        raise HTTPException(status_code=404, detail="project not found")
    return project


@router.put(
    "/order",
    response_model=list[ProjectRead],
    summary="Replace ordered projects",
    responses={
        401: {"description": "Missing or invalid internal API secret"},
    },
)
def replace_project_order(
    request: Request,
    payload: ProjectsOrderReplace,
    x_internal_api_secret: str | None = Header(
        default=None,
        alias="x-internal-api-secret",
        description=INTERNAL_SECRET_HEADER_DESCRIPTION,
    ),
    service: ProjectService = Depends(get_project_service),
) -> list[ProjectRead]:
    ensure_trusted_internal_request(request, x_internal_api_secret)
    try:
        return service.replace_project_order(payload.project_slugs)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
