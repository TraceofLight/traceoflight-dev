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
    auth::RequireInternalSecret,
    error::{AppError, ErrorDetail},
    list_params::validate_limit_offset,
    posts::TagRead,
    tags::{TagCreate, TagUpdate, create_tag, delete_tag, list_tags, update_tag},
};

#[derive(Debug, Deserialize, IntoParams, Default)]
#[into_params(parameter_in = Query)]
pub struct ListTagsQuery {
    /// Free-text token matched against slug or label (case-insensitive).
    query: Option<String>,
    /// Page size (1..=200, default 50).
    limit: Option<i64>,
    /// Items skipped before this page (>= 0, default 0).
    offset: Option<i64>,
}

#[utoipa::path(
    get,
    path = "/tags",
    tag = "tags",
    operation_id = "list_tags",
    summary = "List tags",
    description = "List or search tags for writer autosuggest and admin filtering. Requires `x-internal-api-secret`.",
    params(ListTagsQuery),
    responses(
        (status = 200, description = "Tags returned", body = Vec<TagRead>),
        (status = 400, description = "Invalid query parameter", body = ErrorDetail),
        (status = 401, description = "Missing or invalid internal API secret", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
    security(("internal_api_secret" = [])),
)]
pub async fn list_tags_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
    Query(params): Query<ListTagsQuery>,
) -> Result<Json<Vec<TagRead>>, AppError> {
    let (limit, offset) = validate_limit_offset(params.limit, params.offset, 50, 200)?;
    let tags = list_tags(&state.pool, params.query.as_deref(), limit, offset).await?;
    Ok(Json(tags))
}

#[utoipa::path(
    post,
    path = "/tags",
    tag = "tags",
    operation_id = "create_tag",
    summary = "Create tag",
    description = "Create a new tag. The slug is normalized server-side.",
    request_body = TagCreate,
    responses(
        (status = 200, description = "Tag created", body = TagRead),
        (status = 400, description = "Tag payload is invalid", body = ErrorDetail),
        (status = 401, description = "Missing or invalid internal API secret", body = ErrorDetail),
        (status = 409, description = "Tag slug already exists", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
    security(("internal_api_secret" = [])),
)]
pub async fn create_tag_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
    Json(payload): Json<TagCreate>,
) -> Result<Json<TagRead>, AppError> {
    let tag = create_tag(&state.pool, payload).await?;
    Ok(Json(tag))
}

#[utoipa::path(
    patch,
    path = "/tags/{slug}",
    tag = "tags",
    operation_id = "update_tag",
    summary = "Update tag",
    description = "Update a tag's slug and/or label. At least one field is required.",
    params(
        ("slug" = String, Path, description = "Current tag slug"),
    ),
    request_body = TagUpdate,
    responses(
        (status = 200, description = "Tag updated", body = TagRead),
        (status = 400, description = "Tag payload is invalid", body = ErrorDetail),
        (status = 401, description = "Missing or invalid internal API secret", body = ErrorDetail),
        (status = 404, description = "Tag not found", body = ErrorDetail),
        (status = 409, description = "Tag slug already exists", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
    security(("internal_api_secret" = [])),
)]
pub async fn update_tag_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Json(payload): Json<TagUpdate>,
) -> Result<Json<TagRead>, AppError> {
    let tag = update_tag(&state.pool, &slug, payload)
        .await?
        .ok_or(AppError::NotFound("tag not found"))?;
    Ok(Json(tag))
}

#[derive(Debug, Deserialize, IntoParams, Default)]
#[into_params(parameter_in = Query)]
pub struct DeleteTagQuery {
    /// When `true`, removes the tag's post links before deleting; otherwise
    /// the request fails with 409 if any links exist.
    #[serde(default)]
    force: bool,
}

#[utoipa::path(
    delete,
    path = "/tags/{slug}",
    tag = "tags",
    operation_id = "delete_tag",
    summary = "Delete tag",
    description = "Delete a tag by slug. Use `?force=true` to detach existing post links first.",
    params(
        ("slug" = String, Path, description = "Tag slug to delete"),
        DeleteTagQuery,
    ),
    responses(
        (status = 204, description = "Tag deleted"),
        (status = 401, description = "Missing or invalid internal API secret", body = ErrorDetail),
        (status = 404, description = "Tag not found", body = ErrorDetail),
        (status = 409, description = "Tag is linked to one or more posts", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
    security(("internal_api_secret" = [])),
)]
pub async fn delete_tag_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Query(params): Query<DeleteTagQuery>,
) -> Result<StatusCode, AppError> {
    let deleted = delete_tag(&state.pool, &slug, params.force).await?;
    if !deleted {
        return Err(AppError::NotFound("tag not found"));
    }
    Ok(StatusCode::NO_CONTENT)
}
