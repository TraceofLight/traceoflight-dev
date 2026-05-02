from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_admin_auth_service
from app.api.security import require_internal_secret
from app.schemas.admin_auth import (
    AdminAuthLoginRequest,
    AdminAuthLoginResponse,
    AdminCredentialRevisionResponse,
    AdminLogoutRequest,
    AdminCredentialUpdateRequest,
    AdminCredentialUpdateResponse,
    AdminRefreshRequest,
    AdminRefreshResponse,
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
    result = await service.login(payload.login_id, payload.password)
    if not result.ok or result.credential_source is None or result.token_pair is None:
        raise HTTPException(status_code=401, detail="invalid admin credentials")

    return AdminAuthLoginResponse(
        credential_source=result.credential_source,  # type: ignore[arg-type]
        credential_revision=result.revision,
        access_token=result.token_pair.access_token,
        refresh_token=result.token_pair.refresh_token,
        access_max_age_seconds=result.token_pair.access_max_age_seconds,
        refresh_max_age_seconds=result.token_pair.refresh_max_age_seconds,
    )


@router.post(
    "/refresh",
    response_model=AdminRefreshResponse,
    status_code=200,
    responses={
        401: {"description": "Invalid or expired refresh token"},
        409: {"description": "Stale refresh token from a completed rotation"},
    },
)
async def refresh_admin(
    payload: AdminRefreshRequest,
    service: AdminAuthService = Depends(get_admin_auth_service),
) -> AdminRefreshResponse:
    result = await service.rotate_refresh_token(payload.refresh_token)
    if result.kind == "stale":
        raise HTTPException(status_code=409, detail="refresh token is stale")
    if result.kind in {"invalid", "expired", "reuse_detected"} or result.token_pair is None:
        raise HTTPException(status_code=401, detail=f"refresh token {result.kind}")
    return AdminRefreshResponse(
        credential_revision=result.revision,
        access_token=result.token_pair.access_token,
        refresh_token=result.token_pair.refresh_token,
        access_max_age_seconds=result.token_pair.access_max_age_seconds,
        refresh_max_age_seconds=result.token_pair.refresh_max_age_seconds,
    )


@router.post(
    "/logout",
    status_code=200,
)
async def logout_admin(
    payload: AdminLogoutRequest,
    service: AdminAuthService = Depends(get_admin_auth_service),
) -> dict[str, bool]:
    await service.revoke_refresh_token_family(payload.refresh_token)
    return {"ok": True}


@router.get(
    "/revision",
    response_model=AdminCredentialRevisionResponse,
    status_code=200,
    responses={401: {"description": "Missing or invalid internal API secret"}},
    dependencies=[Depends(require_internal_secret)],
)
async def get_admin_credential_revision(
    service: AdminAuthService = Depends(get_admin_auth_service),
) -> AdminCredentialRevisionResponse:
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
    dependencies=[Depends(require_internal_secret)],
)
async def update_admin_credentials(
    payload: AdminCredentialUpdateRequest,
    service: AdminAuthService = Depends(get_admin_auth_service),
) -> AdminCredentialUpdateResponse:
    try:
        result = await service.update_operational_credentials(payload.login_id, payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return AdminCredentialUpdateResponse(
        login_id=result.login_id,
        credential_revision=result.revision,
    )
