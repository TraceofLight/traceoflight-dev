use axum::{extract::State, response::Json};

use crate::{
    AppState,
    admin_auth::{
        AdminAuthLoginRequest, AdminAuthLoginResponse, AdminCredentialRevisionResponse,
        AdminCredentialUpdateRequest, AdminCredentialUpdateResponse, AdminLogoutRequest,
        AdminLogoutResponse, AdminRefreshRequest, AdminRefreshResponse, RefreshOutcome,
        get_active_credential_revision, login as admin_login, revoke_refresh_token_family,
        rotate_refresh_token, update_operational_credentials,
    },
    auth::RequireInternalSecret,
    error::{AppError, ErrorDetail},
};

#[utoipa::path(
    post,
    path = "/admin/auth/login",
    tag = "admin-auth",
    operation_id = "admin_login",
    summary = "Admin login",
    description = "Verify credentials (operational row → master env fallback) and issue an access+refresh token pair.",
    request_body = AdminAuthLoginRequest,
    responses(
        (status = 200, description = "Login succeeded", body = AdminAuthLoginResponse),
        (status = 401, description = "Invalid admin credentials", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
)]
pub async fn admin_login_handler(
    State(state): State<AppState>,
    Json(payload): Json<AdminAuthLoginRequest>,
) -> Result<Json<AdminAuthLoginResponse>, AppError> {
    let response = admin_login(&state.pool, &state.admin, payload).await?;
    Ok(Json(response))
}

#[utoipa::path(
    post,
    path = "/admin/auth/refresh",
    tag = "admin-auth",
    operation_id = "admin_refresh",
    summary = "Admin refresh-token rotation",
    description = "RTR: validate the supplied refresh token, issue a new pair, mark the old jti as used+rotated. Reuse of an already-used token revokes the family.",
    request_body = AdminRefreshRequest,
    responses(
        (status = 200, description = "Tokens rotated", body = AdminRefreshResponse),
        (status = 401, description = "Refresh token invalid/expired/reused", body = ErrorDetail),
        (status = 409, description = "Refresh token superseded by a newer rotation", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
)]
pub async fn admin_refresh_handler(
    State(state): State<AppState>,
    Json(payload): Json<AdminRefreshRequest>,
) -> Result<Json<AdminRefreshResponse>, AppError> {
    let outcome = rotate_refresh_token(&state.pool, &state.admin, &payload.refresh_token).await?;
    match outcome {
        RefreshOutcome::Rotated { revision, pair } => Ok(Json(AdminRefreshResponse {
            ok: true,
            credential_revision: revision,
            access_token: pair.access_token,
            refresh_token: pair.refresh_token,
            access_max_age_seconds: pair.access_max_age_seconds,
            refresh_max_age_seconds: pair.refresh_max_age_seconds,
        })),
        RefreshOutcome::Stale { .. } => Err(AppError::Conflict("refresh token is stale".into())),
        RefreshOutcome::InvalidOrExpired { kind, .. } => Err(AppError::UnauthorizedDetail(
            format!("refresh token {kind}"),
        )),
        RefreshOutcome::ReuseDetected { .. } => Err(AppError::UnauthorizedDetail(
            "refresh token reuse_detected".into(),
        )),
    }
}

#[utoipa::path(
    post,
    path = "/admin/auth/logout",
    tag = "admin-auth",
    operation_id = "admin_logout",
    summary = "Admin logout",
    description = "Revoke the entire refresh-token family the supplied token belongs to. Always 200 even if the token is unknown.",
    request_body = AdminLogoutRequest,
    responses(
        (status = 200, description = "Logout acknowledged", body = AdminLogoutResponse),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
)]
pub async fn admin_logout_handler(
    State(state): State<AppState>,
    Json(payload): Json<AdminLogoutRequest>,
) -> Result<Json<AdminLogoutResponse>, AppError> {
    revoke_refresh_token_family(&state.admin, &payload.refresh_token).await?;
    Ok(Json(AdminLogoutResponse { ok: true }))
}

#[utoipa::path(
    get,
    path = "/admin/auth/revision",
    tag = "admin-auth",
    operation_id = "admin_get_revision",
    summary = "Get current admin credential revision",
    description = "Returns the active operational credential revision, or 0 if no operational row exists. Requires `x-internal-api-secret`.",
    responses(
        (status = 200, description = "Revision returned", body = AdminCredentialRevisionResponse),
        (status = 401, description = "Missing or invalid internal API secret", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
    security(("internal_api_secret" = [])),
)]
pub async fn admin_get_revision_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
) -> Result<Json<AdminCredentialRevisionResponse>, AppError> {
    let credential_revision = get_active_credential_revision(&state.pool).await?;
    Ok(Json(AdminCredentialRevisionResponse {
        credential_revision,
    }))
}

#[utoipa::path(
    put,
    path = "/admin/auth/credentials",
    tag = "admin-auth",
    operation_id = "admin_update_credentials",
    summary = "Update admin operational credentials",
    description = "Store/replace the operational admin credentials in the DB. Bumps `credential_revision`, which invalidates older refresh tokens. Requires `x-internal-api-secret`.",
    request_body = AdminCredentialUpdateRequest,
    responses(
        (status = 200, description = "Credentials updated", body = AdminCredentialUpdateResponse),
        (status = 400, description = "Invalid credential payload", body = ErrorDetail),
        (status = 401, description = "Missing or invalid internal API secret", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
    security(("internal_api_secret" = [])),
)]
pub async fn admin_update_credentials_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
    Json(payload): Json<AdminCredentialUpdateRequest>,
) -> Result<Json<AdminCredentialUpdateResponse>, AppError> {
    let response = update_operational_credentials(&state.pool, payload).await?;
    Ok(Json(response))
}
