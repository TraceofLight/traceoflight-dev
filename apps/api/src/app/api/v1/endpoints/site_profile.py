from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Request

from app.api.deps import get_site_profile_service
from app.api.v1.endpoints.imports import (
    INTERNAL_SECRET_HEADER_DESCRIPTION,
    ensure_trusted_internal_request,
)
from app.schemas.site_profile import SiteProfileRead, SiteProfileUpdateRequest
from app.services.site_profile_service import SiteProfileService

router = APIRouter(prefix="/site-profile")


@router.get(
    "",
    response_model=SiteProfileRead,
    status_code=200,
    summary="Get site profile",
    description="Return the footer email and GitHub address currently served by the site.",
)
def get_site_profile(
    service: SiteProfileService = Depends(get_site_profile_service),
) -> SiteProfileRead:
    profile = service.get_profile()
    return SiteProfileRead(email=profile.email, github_url=profile.github_url)


@router.put(
    "",
    response_model=SiteProfileRead,
    status_code=200,
    summary="Update site profile",
    description=(
        "Update the footer email and GitHub address. Requires x-internal-api-secret."
    ),
    responses={
        400: {"description": "Invalid site profile payload"},
        401: {"description": "Missing or invalid internal API secret"},
    },
)
def update_site_profile(
    request: Request,
    payload: SiteProfileUpdateRequest,
    x_internal_api_secret: str | None = Header(
        default=None,
        alias="x-internal-api-secret",
        description=INTERNAL_SECRET_HEADER_DESCRIPTION,
    ),
    service: SiteProfileService = Depends(get_site_profile_service),
) -> SiteProfileRead:
    ensure_trusted_internal_request(request, x_internal_api_secret)
    try:
        profile = service.update_profile(payload.email, payload.github_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return SiteProfileRead(email=profile.email, github_url=profile.github_url)
