use axum::{
    extract::{Path, State},
    response::Json,
};
use axum_extra::extract::Query;
use serde::Deserialize;
use tracing::{debug, info};
use utoipa::IntoParams;

use crate::{
    AppState,
    auth::{OptionalInternalSecret, RequireInternalSecret},
    error::{AppError, ErrorDetail},
    list_params::{resolve_include_private, validate_limit_offset},
    posts::PostLocale,
    projects::{
        ListProjectsParams, ProjectRead, ProjectsOrderReplace, get_project_by_slug, list_projects,
        replace_project_order, resolve_project_redirect,
    },
    routes::posts::{RedirectQuery, RedirectResolution},
};

#[derive(Debug, Deserialize, IntoParams, Default)]
#[into_params(parameter_in = Query)]
pub struct ListProjectsQuery {
    /// Page size (1..=100, default 20).
    limit: Option<i64>,
    /// Items skipped before this page (>= 0, default 0).
    offset: Option<i64>,
    /// Anonymous callers can never include private; trusted callers default
    /// to true and can pass `false` to scope back to public-only.
    include_private: Option<bool>,
    /// Locale filter; omit to return all locales.
    locale: Option<PostLocale>,
}

#[utoipa::path(
    get,
    path = "/projects",
    tag = "projects",
    operation_id = "list_projects",
    summary = "List projects",
    description = "Project posts (a slice of /posts narrowed to `content_kind=project`). Anonymous callers always see published+public only; trusted callers can broaden via `include_private`.",
    params(ListProjectsQuery),
    responses(
        (status = 200, description = "Projects returned", body = Vec<ProjectRead>),
        (status = 400, description = "Invalid query parameter", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
)]
pub async fn list_projects_handler(
    State(state): State<AppState>,
    OptionalInternalSecret(trusted): OptionalInternalSecret,
    Query(params): Query<ListProjectsQuery>,
) -> Result<Json<Vec<ProjectRead>>, AppError> {
    let (limit, offset) = validate_limit_offset(params.limit, params.offset, 20, 100)?;

    let include_private = resolve_include_private(params.include_private, trusted);
    debug!(
        event = "project.list_requested",
        trusted,
        limit,
        offset,
        include_private,
        locale = params.locale.map(|value| value.as_str()).unwrap_or("any"),
        "project list requested"
    );
    let projects = list_projects(
        &state.db,
        ListProjectsParams {
            limit,
            offset,
            include_private,
            locale: params.locale,
        },
    )
    .await?;
    debug!(
        event = "project.list_returned",
        trusted,
        limit,
        offset,
        returned_count = projects.len(),
        "project list returned"
    );
    Ok(Json(projects))
}

#[derive(Debug, Deserialize, IntoParams, Default)]
#[into_params(parameter_in = Query)]
pub struct GetProjectQuery {
    include_private: Option<bool>,
    locale: Option<PostLocale>,
}

#[utoipa::path(
    get,
    path = "/projects/{slug}",
    tag = "projects",
    operation_id = "get_project_by_slug",
    summary = "Get project detail",
    description = "Project detail with `related_series_posts` populated when the project belongs to a series.",
    params(
        ("slug" = String, Path, description = "Project slug"),
        GetProjectQuery,
    ),
    responses(
        (status = 200, description = "Project returned", body = ProjectRead),
        (status = 404, description = "Project not found", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
)]
pub async fn get_project_by_slug_handler(
    State(state): State<AppState>,
    OptionalInternalSecret(trusted): OptionalInternalSecret,
    Path(slug): Path<String>,
    Query(params): Query<GetProjectQuery>,
) -> Result<Json<ProjectRead>, AppError> {
    let include_private = resolve_include_private(params.include_private, trusted);
    debug!(
        event = "project.detail_requested",
        trusted,
        slug = %slug,
        include_private,
        locale = params.locale.map(|value| value.as_str()).unwrap_or("any"),
        "project detail requested"
    );
    let project = get_project_by_slug(&state.db, &slug, include_private, params.locale)
        .await?
        .ok_or(AppError::NotFound("project not found"))?;
    debug!(
        event = "project.detail_returned",
        trusted,
        post_id = %project.id,
        slug = %project.slug,
        locale = project.locale.as_str(),
        status = project.status.as_str(),
        visibility = project.visibility.as_str(),
        related_series_posts = project.related_series_posts.len(),
        "project detail returned"
    );
    Ok(Json(project))
}

#[utoipa::path(
    get,
    path = "/projects/redirects/{old_slug}",
    tag = "projects",
    operation_id = "resolve_project_redirect",
    summary = "Resolve old project slug",
    description = "Look up the canonical current slug for a renamed project. Restricted to published+public projects.",
    params(
        ("old_slug" = String, Path, description = "Slug as it appeared before the rename"),
        RedirectQuery,
    ),
    responses(
        (status = 200, description = "Redirect resolved", body = RedirectResolution),
        (status = 404, description = "No active redirect for this slug", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
)]
pub async fn resolve_project_redirect_handler(
    State(state): State<AppState>,
    Path(old_slug): Path<String>,
    Query(params): Query<RedirectQuery>,
) -> Result<Json<RedirectResolution>, AppError> {
    let target = resolve_project_redirect(&state.db, &old_slug, params.locale)
        .await?
        .ok_or(AppError::NotFound("no redirect for this slug"))?;
    debug!(
        event = "project.redirect_resolved",
        old_slug = %old_slug,
        locale = params.locale.as_str(),
        target_slug = %target,
        "project redirect resolved"
    );
    Ok(Json(RedirectResolution {
        target_slug: target,
    }))
}

#[utoipa::path(
    put,
    path = "/projects/order",
    tag = "projects",
    operation_id = "replace_project_order",
    summary = "Replace project archive order",
    description = "Apply the supplied slug list as `project_order_index` (1-based). Returns the freshly ordered project list. Empty list is a no-op. Requires `x-internal-api-secret`.",
    request_body = ProjectsOrderReplace,
    responses(
        (status = 200, description = "Projects reordered", body = Vec<ProjectRead>),
        (status = 400, description = "Unknown project slug", body = ErrorDetail),
        (status = 401, description = "Missing or invalid internal API secret", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
    security(("internal_api_secret" = [])),
)]
pub async fn replace_project_order_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
    Json(payload): Json<ProjectsOrderReplace>,
) -> Result<Json<Vec<ProjectRead>>, AppError> {
    let requested_count = payload.project_slugs.len();
    let projects = replace_project_order(&state.db, payload.project_slugs).await?;
    info!(
        event = "project.order_replaced",
        requested_count,
        returned_count = projects.len(),
        "project order replaced"
    );
    Ok(Json(projects))
}
