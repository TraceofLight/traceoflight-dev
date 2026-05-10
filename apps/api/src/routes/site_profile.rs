use axum::{extract::State, response::Json};
use tracing::{debug, info};

use crate::{
    AppState,
    auth::RequireInternalSecret,
    error::{AppError, ErrorDetail},
    site_profile::{SiteProfileRead, get_site_profile, update_site_profile},
};

#[utoipa::path(
    get,
    path = "/site-profile",
    tag = "site-profile",
    operation_id = "get_site_profile",
    summary = "Get site profile",
    description = "Footer email and GitHub address served by the site. Falls back to built-in defaults when the row is unset.",
    responses(
        (status = 200, description = "Profile returned", body = SiteProfileRead),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
)]
pub async fn get_site_profile_handler(
    State(state): State<AppState>,
) -> Result<Json<SiteProfileRead>, AppError> {
    debug!(
        event = "site_profile.get_requested",
        "site profile requested"
    );
    let profile = get_site_profile(&state.db).await?;
    debug!(
        event = "site_profile.get_returned",
        has_email = !profile.email.trim().is_empty(),
        has_github_url = !profile.github_url.trim().is_empty(),
        "site profile returned"
    );
    Ok(Json(profile))
}

#[utoipa::path(
    put,
    path = "/site-profile",
    tag = "site-profile",
    operation_id = "update_site_profile",
    summary = "Update site profile",
    description = "Replace the footer email and GitHub URL. Whitespace-trimmed, validated, and upserted into the singleton row.",
    request_body = SiteProfileRead,
    responses(
        (status = 200, description = "Profile updated", body = SiteProfileRead),
        (status = 400, description = "Invalid email or GitHub URL", body = ErrorDetail),
        (status = 401, description = "Missing or invalid internal API secret", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
    security(("internal_api_secret" = [])),
)]
pub async fn update_site_profile_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
    Json(payload): Json<SiteProfileRead>,
) -> Result<Json<SiteProfileRead>, AppError> {
    let profile = update_site_profile(&state.db, payload).await?;
    info!(
        event = "site_profile.updated",
        has_email = !profile.email.trim().is_empty(),
        has_github_url = !profile.github_url.trim().is_empty(),
        "site profile updated"
    );
    Ok(Json(profile))
}
