from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Request

from app.api.deps import get_admin_auth_service
from app.api.v1.endpoints.imports import (
    INTERNAL_SECRET_HEADER_DESCRIPTION,
    ensure_trusted_internal_request,
)
from app.core.config import settings
from app.schemas.admin_auth import (
    AdminAuthLoginRequest,
    AdminAuthLoginResponse,
    AdminCredentialRevisionResponse,
    AdminCredentialUpdateRequest,
    AdminCredentialUpdateResponse,
)
from app.services.admin_auth_service import AdminAuthService

router = APIRouter(prefix="/admin/auth")


@router.post(
    "/login",
    response_model=AdminAuthLoginResponse,
    status_code=200,
    responses={401: {"description": "Invalid admin credentials"}},
)
async def login_admin(
    payload: AdminAuthLoginRequest,
    service: AdminAuthService = Depends(get_admin_auth_service),
) -> AdminAuthLoginResponse:
    result = await service.verify_credentials(payload.login_id, payload.password)
    if not result.ok or result.credential_source is None:
        raise HTTPException(status_code=401, detail="invalid admin credentials")

    return AdminAuthLoginResponse(
        credential_source=result.credential_source,  # type: ignore[arg-type]
        credential_revision=result.revision,
    )


@router.get(
    "/revision",
    response_model=AdminCredentialRevisionResponse,
    status_code=200,
    responses={401: {"description": "Missing or invalid internal API secret"}},
)
async def get_admin_credential_revision(
    request: Request,
    x_internal_api_secret: str | None = Header(
        default=None,
        alias="x-internal-api-secret",
        description=INTERNAL_SECRET_HEADER_DESCRIPTION,
    ),
    service: AdminAuthService = Depends(get_admin_auth_service),
) -> AdminCredentialRevisionResponse:
    ensure_trusted_internal_request(request, x_internal_api_secret)
    return AdminCredentialRevisionResponse(
        credential_revision=await service.get_active_credential_revision()
    )


@router.put(
    "/credentials",
    response_model=AdminCredentialUpdateResponse,
    status_code=200,
    responses={
        400: {"description": "Invalid credential payload"},
        401: {"description": "Missing or invalid internal API secret"},
    },
)
async def update_admin_credentials(
    request: Request,
    payload: AdminCredentialUpdateRequest,
    x_internal_api_secret: str | None = Header(
        default=None,
        alias="x-internal-api-secret",
        description=INTERNAL_SECRET_HEADER_DESCRIPTION,
    ),
    service: AdminAuthService = Depends(get_admin_auth_service),
) -> AdminCredentialUpdateResponse:
    ensure_trusted_internal_request(request, x_internal_api_secret)
    try:
        result = await service.update_operational_credentials(payload.login_id, payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return AdminCredentialUpdateResponse(
        login_id=result.login_id,
        credential_revision=result.revision,
    )
