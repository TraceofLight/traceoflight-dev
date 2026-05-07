use axum::{
    extract::{Path, State},
    http::StatusCode,
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
    routes::posts::{RedirectQuery, RedirectResolution},
    series::{
        ListSeriesParams, SeriesDetailRead, SeriesOrderReplace, SeriesPostsReplace, SeriesRead,
        SeriesUpsert, create_series, delete_series_by_slug, get_series_by_slug, list_series,
        replace_series_order, replace_series_posts_by_slug, resolve_series_redirect,
        update_series_by_slug,
    },
};

#[derive(Debug, Deserialize, IntoParams, Default)]
#[into_params(parameter_in = Query)]
pub struct ListSeriesQuery {
    /// Page size (1..=200, default 50).
    limit: Option<i64>,
    /// Items skipped before this page (>= 0, default 0).
    offset: Option<i64>,
    include_private: Option<bool>,
    locale: Option<PostLocale>,
}

#[utoipa::path(
    get,
    path = "/series",
    tag = "series",
    operation_id = "list_series",
    summary = "List series",
    description = "Public callers see only series with at least one published+public post. Trusted callers can include private/draft-linked series via `include_private`.",
    params(ListSeriesQuery),
    responses(
        (status = 200, description = "Series returned", body = Vec<SeriesRead>),
        (status = 400, description = "Invalid query parameter", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
)]
pub async fn list_series_handler(
    State(state): State<AppState>,
    OptionalInternalSecret(trusted): OptionalInternalSecret,
    Query(params): Query<ListSeriesQuery>,
) -> Result<Json<Vec<SeriesRead>>, AppError> {
    let (limit, offset) = validate_limit_offset(params.limit, params.offset, 50, 200)?;
    let include_private = resolve_include_private(params.include_private, trusted);
    let series = list_series(
        &state.pool,
        ListSeriesParams {
            limit,
            offset,
            include_private,
            locale: params.locale,
        },
    )
    .await?;
    Ok(Json(series))
}

#[utoipa::path(
    put,
    path = "/series/order",
    tag = "series",
    operation_id = "replace_series_order",
    summary = "Replace series archive order",
    description = "Apply the supplied slug list as `list_order_index` (1-based) on series rows. Empty list is a no-op. Returns the freshly ordered Korean source rows. Requires `x-internal-api-secret`.",
    request_body = SeriesOrderReplace,
    responses(
        (status = 200, description = "Series reordered", body = Vec<SeriesRead>),
        (status = 400, description = "Unknown series slug", body = ErrorDetail),
        (status = 401, description = "Missing or invalid internal API secret", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
    security(("internal_api_secret" = [])),
)]
pub async fn replace_series_order_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
    Json(payload): Json<SeriesOrderReplace>,
) -> Result<Json<Vec<SeriesRead>>, AppError> {
    let series = replace_series_order(&state.pool, payload.series_slugs).await?;
    Ok(Json(series))
}

#[utoipa::path(
    get,
    path = "/series/redirects/{old_slug}",
    tag = "series",
    operation_id = "resolve_series_redirect",
    summary = "Resolve old series slug",
    description = "Return the canonical current slug for a renamed series.",
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
pub async fn resolve_series_redirect_handler(
    State(state): State<AppState>,
    Path(old_slug): Path<String>,
    Query(params): Query<RedirectQuery>,
) -> Result<Json<RedirectResolution>, AppError> {
    let target = resolve_series_redirect(&state.pool, &old_slug, params.locale)
        .await?
        .ok_or(AppError::NotFound("no redirect for this slug"))?;
    Ok(Json(RedirectResolution {
        target_slug: target,
    }))
}

#[derive(Debug, Deserialize, IntoParams, Default)]
#[into_params(parameter_in = Query)]
pub struct GetSeriesQuery {
    include_private: Option<bool>,
    locale: Option<PostLocale>,
}

#[utoipa::path(
    get,
    path = "/series/{slug}",
    tag = "series",
    operation_id = "get_series_by_slug",
    summary = "Get series detail",
    description = "Series detail with ordered posts. Public callers only see published+public posts; trusted callers can include private via `include_private`.",
    params(
        ("slug" = String, Path, description = "Series slug"),
        GetSeriesQuery,
    ),
    responses(
        (status = 200, description = "Series returned", body = SeriesDetailRead),
        (status = 404, description = "Series not found", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
)]
pub async fn get_series_by_slug_handler(
    State(state): State<AppState>,
    OptionalInternalSecret(trusted): OptionalInternalSecret,
    Path(slug): Path<String>,
    Query(params): Query<GetSeriesQuery>,
) -> Result<Json<SeriesDetailRead>, AppError> {
    let include_private = resolve_include_private(params.include_private, trusted);
    let series = get_series_by_slug(&state.pool, &slug, include_private, params.locale)
        .await?
        .ok_or(AppError::NotFound("series not found"))?;
    Ok(Json(series))
}

#[utoipa::path(
    post,
    path = "/series",
    tag = "series",
    operation_id = "create_series",
    summary = "Create series",
    description = "Create a new series row (locale=ko, source). Requires `x-internal-api-secret`.",
    request_body = SeriesUpsert,
    responses(
        (status = 200, description = "Series created", body = SeriesDetailRead),
        (status = 401, description = "Missing or invalid internal API secret", body = ErrorDetail),
        (status = 409, description = "Series slug conflict", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
    security(("internal_api_secret" = [])),
)]
pub async fn create_series_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
    Json(payload): Json<SeriesUpsert>,
) -> Result<Json<SeriesDetailRead>, AppError> {
    let series = create_series(&state.pool, payload).await?;
    Ok(Json(series))
}

#[utoipa::path(
    put,
    path = "/series/{slug}",
    tag = "series",
    operation_id = "update_series_by_slug",
    summary = "Update series",
    description = "Update series metadata by slug. Slug change records a redirect from the old slug.",
    params(
        ("slug" = String, Path, description = "Current series slug"),
    ),
    request_body = SeriesUpsert,
    responses(
        (status = 200, description = "Series updated", body = SeriesDetailRead),
        (status = 401, description = "Missing or invalid internal API secret", body = ErrorDetail),
        (status = 404, description = "Series not found", body = ErrorDetail),
        (status = 409, description = "Series slug conflict", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
    security(("internal_api_secret" = [])),
)]
pub async fn update_series_by_slug_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Json(payload): Json<SeriesUpsert>,
) -> Result<Json<SeriesDetailRead>, AppError> {
    let series = update_series_by_slug(&state.pool, &slug, payload)
        .await?
        .ok_or(AppError::NotFound("series not found"))?;
    Ok(Json(series))
}

#[utoipa::path(
    delete,
    path = "/series/{slug}",
    tag = "series",
    operation_id = "delete_series_by_slug",
    summary = "Delete series",
    description = "Delete a series row by slug. Cascades to series_posts and series_slug_redirects via FK.",
    params(
        ("slug" = String, Path, description = "Series slug to delete"),
    ),
    responses(
        (status = 204, description = "Series deleted"),
        (status = 401, description = "Missing or invalid internal API secret", body = ErrorDetail),
        (status = 404, description = "Series not found", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
    security(("internal_api_secret" = [])),
)]
pub async fn delete_series_by_slug_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> Result<StatusCode, AppError> {
    let deleted = delete_series_by_slug(&state.pool, &slug).await?;
    if !deleted {
        return Err(AppError::NotFound("series not found"));
    }
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    put,
    path = "/series/{slug}/posts",
    tag = "series",
    operation_id = "replace_series_posts",
    summary = "Replace ordered series posts",
    description = "Replace the entire post list of a series with `post_slugs` (order preserved). Empty list clears all linked posts.",
    params(
        ("slug" = String, Path, description = "Series slug"),
    ),
    request_body = SeriesPostsReplace,
    responses(
        (status = 200, description = "Posts replaced", body = SeriesDetailRead),
        (status = 400, description = "Unknown post slug", body = ErrorDetail),
        (status = 401, description = "Missing or invalid internal API secret", body = ErrorDetail),
        (status = 404, description = "Series not found", body = ErrorDetail),
        (status = 409, description = "One or more posts already belong to another series", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
    security(("internal_api_secret" = [])),
)]
pub async fn replace_series_posts_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Json(payload): Json<SeriesPostsReplace>,
) -> Result<Json<SeriesDetailRead>, AppError> {
    let replaced = replace_series_posts_by_slug(&state.pool, &slug, payload.post_slugs)
        .await?
        .ok_or(AppError::NotFound("series not found"))?;
    Ok(Json(replaced))
}
