from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_project_service
from app.api.security import optional_internal_secret, require_internal_secret
from app.models.post import PostLocale
from app.schemas.project import ProjectRead, ProjectsOrderReplace
from app.services.project_service import ProjectService

router = APIRouter()


def _resolve_include_private(include_private: bool | None, trusted_internal: bool) -> bool:
    if not trusted_internal:
        return False
    return include_private if include_private is not None else True


@router.get("", response_model=list[ProjectRead], summary="List published projects")
def list_projects(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    include_private: bool | None = Query(default=None),
    locale: PostLocale | None = Query(default=None, description="Filter projects by locale. When omitted, returns all locales."),
    trusted_internal: bool = Depends(optional_internal_secret),
    service: ProjectService = Depends(get_project_service),
) -> list[ProjectRead]:
    return service.list_projects(
        limit=limit,
        offset=offset,
        include_private=_resolve_include_private(include_private, trusted_internal),
        locale=locale,
    )


@router.get("/{slug}", response_model=ProjectRead, summary="Get project detail")
def get_project_by_slug(
    slug: str,
    include_private: bool | None = Query(default=None),
    locale: PostLocale | None = Query(default=None, description="Filter by locale. When omitted, any locale matches."),
    trusted_internal: bool = Depends(optional_internal_secret),
    service: ProjectService = Depends(get_project_service),
) -> ProjectRead:
    project = service.get_project_by_slug(
        slug=slug,
        include_private=_resolve_include_private(include_private, trusted_internal),
        locale=locale,
    )
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
    dependencies=[Depends(require_internal_secret)],
)
def replace_project_order(
    payload: ProjectsOrderReplace,
    service: ProjectService = Depends(get_project_service),
) -> list[ProjectRead]:
    try:
        return service.replace_project_order(payload.project_slugs)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
