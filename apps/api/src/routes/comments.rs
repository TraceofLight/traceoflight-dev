use axum::{
    extract::{Path, State},
    response::Json,
};
use axum_extra::extract::Query;
use serde::Deserialize;
use utoipa::IntoParams;
use uuid::Uuid;

use crate::{
    AppState,
    auth::{OptionalInternalSecret, RequireInternalSecret},
    comments::{
        AdminCommentFeed, PostCommentCreate, PostCommentDelete, PostCommentRead,
        PostCommentThreadList, PostCommentUpdate, create_comment, delete_comment,
        list_admin_comments, list_post_comments, update_comment,
    },
    error::{AppError, ErrorDetail},
    list_params::validate_limit_offset,
};

#[utoipa::path(
    get,
    path = "/posts/{slug}/comments",
    tag = "comments",
    operation_id = "list_post_comments",
    summary = "List post comments",
    description = "Threaded comment list (root + replies) for a post. Anonymous callers see private bodies replaced by a placeholder; trusted callers see them in full.",
    params(("slug" = String, Path, description = "Post slug")),
    responses(
        (status = 200, description = "Comments returned", body = PostCommentThreadList),
        (status = 404, description = "Post not found", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
)]
pub async fn list_post_comments_handler(
    State(state): State<AppState>,
    OptionalInternalSecret(trusted): OptionalInternalSecret,
    Path(slug): Path<String>,
) -> Result<Json<PostCommentThreadList>, AppError> {
    let thread = list_post_comments(&state.pool, &slug, trusted)
        .await?
        .ok_or(AppError::NotFound("post not found"))?;
    Ok(Json(thread))
}

#[utoipa::path(
    post,
    path = "/posts/{slug}/comments",
    tag = "comments",
    operation_id = "create_post_comment",
    summary = "Create post comment",
    description = "Trusted callers (with `x-internal-api-secret`) create admin-authored comments. Anonymous callers must supply `author_name` and `password` and become guest authors. Reply chains are flattened: every reply is parented to its root.",
    params(("slug" = String, Path, description = "Post slug")),
    request_body = PostCommentCreate,
    responses(
        (status = 200, description = "Comment created", body = PostCommentRead),
        (status = 400, description = "Invalid payload", body = ErrorDetail),
        (status = 401, description = "Author/password validation failed", body = ErrorDetail),
        (status = 404, description = "Post not found", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
)]
pub async fn create_post_comment_handler(
    State(state): State<AppState>,
    OptionalInternalSecret(trusted): OptionalInternalSecret,
    Path(slug): Path<String>,
    Json(payload): Json<PostCommentCreate>,
) -> Result<Json<PostCommentRead>, AppError> {
    let comment = create_comment(&state.pool, &slug, payload, trusted)
        .await?
        .ok_or(AppError::NotFound("post not found"))?;
    Ok(Json(comment))
}

#[utoipa::path(
    patch,
    path = "/comments/{comment_id}",
    tag = "comments",
    operation_id = "update_comment",
    summary = "Update comment",
    description = "Edit a comment's body and/or visibility. Trusted callers can edit any comment; guest authors must supply the original `password`.",
    params(("comment_id" = Uuid, Path, description = "Comment id")),
    request_body = PostCommentUpdate,
    responses(
        (status = 200, description = "Comment updated", body = PostCommentRead),
        (status = 400, description = "Invalid payload or deleted comment", body = ErrorDetail),
        (status = 401, description = "Authentication failed", body = ErrorDetail),
        (status = 404, description = "Comment not found", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
)]
pub async fn update_comment_handler(
    State(state): State<AppState>,
    OptionalInternalSecret(trusted): OptionalInternalSecret,
    Path(comment_id): Path<Uuid>,
    Json(payload): Json<PostCommentUpdate>,
) -> Result<Json<PostCommentRead>, AppError> {
    let comment = update_comment(&state.pool, comment_id, payload, trusted)
        .await?
        .ok_or(AppError::NotFound("comment not found"))?;
    Ok(Json(comment))
}

#[utoipa::path(
    delete,
    path = "/comments/{comment_id}",
    tag = "comments",
    operation_id = "delete_comment",
    summary = "Delete comment",
    description = "Soft-delete a comment. The body is replaced by a placeholder; trusted callers bypass the password check.",
    params(("comment_id" = Uuid, Path, description = "Comment id")),
    request_body = PostCommentDelete,
    responses(
        (status = 200, description = "Comment deleted", body = PostCommentRead),
        (status = 401, description = "Authentication failed", body = ErrorDetail),
        (status = 404, description = "Comment not found", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
)]
pub async fn delete_comment_handler(
    State(state): State<AppState>,
    OptionalInternalSecret(trusted): OptionalInternalSecret,
    Path(comment_id): Path<Uuid>,
    Json(payload): Json<PostCommentDelete>,
) -> Result<Json<PostCommentRead>, AppError> {
    let comment = delete_comment(&state.pool, comment_id, payload, trusted)
        .await?
        .ok_or(AppError::NotFound("comment not found"))?;
    Ok(Json(comment))
}

#[derive(Debug, Deserialize, IntoParams, Default)]
#[into_params(parameter_in = Query)]
pub struct AdminCommentsQuery {
    /// Page size (1..=200, default 100).
    limit: Option<i64>,
    /// Items skipped before this page (>= 0, default 0).
    offset: Option<i64>,
    /// Optional filter: only return comments belonging to this post slug.
    post_slug: Option<String>,
}

#[utoipa::path(
    get,
    path = "/admin/comments",
    tag = "comments",
    operation_id = "list_admin_comments",
    summary = "List admin comments",
    description = "Newest-first comment review feed. Requires `x-internal-api-secret`.",
    params(AdminCommentsQuery),
    responses(
        (status = 200, description = "Feed returned", body = AdminCommentFeed),
        (status = 400, description = "Invalid query parameter", body = ErrorDetail),
        (status = 401, description = "Missing or invalid internal API secret", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
    security(("internal_api_secret" = [])),
)]
pub async fn list_admin_comments_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
    Query(params): Query<AdminCommentsQuery>,
) -> Result<Json<AdminCommentFeed>, AppError> {
    let (limit, offset) = validate_limit_offset(params.limit, params.offset, 100, 200)?;
    let feed = list_admin_comments(&state.pool, limit, offset, params.post_slug.as_deref()).await?;
    Ok(Json(feed))
}
