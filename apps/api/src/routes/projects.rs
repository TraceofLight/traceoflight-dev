use axum::{
    extract::{Path, State},
    response::Json,
};
use axum_extra::extract::Query;
use serde::Deserialize;
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
    let projects = list_projects(
        &state.pool,
        ListProjectsParams {
            limit,
            offset,
            include_private,
            locale: params.locale,
        },
    )
    .await?;
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
    let project = get_project_by_slug(&state.pool, &slug, include_private, params.locale)
        .await?
        .ok_or(AppError::NotFound("project not found"))?;
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
    let target = resolve_project_redirect(&state.pool, &old_slug, params.locale)
        .await?
        .ok_or(AppError::NotFound("no redirect for this slug"))?;
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
    let projects = replace_project_order(&state.pool, payload.project_slugs).await?;
    Ok(Json(projects))
}
