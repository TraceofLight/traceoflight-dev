use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
};
use axum_extra::extract::Query;
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};

use crate::{
    AppState,
    auth::{OptionalInternalSecret, RequireInternalSecret},
    error::{AppError, ErrorDetail},
    list_params::{effective_visibility, validate_limit_offset},
    posts::{
        ListPostsParams, ListSummariesParams, PostContentKind, PostCreate, PostFilter, PostLocale,
        PostRead, PostSortMode, PostStatus, PostSummaryListRead, PostVisibility, TagMatch,
        create_post, delete_post_by_slug, get_post_by_slug, list_post_summaries, list_posts,
        resolve_post_redirect, update_post_by_slug,
    },
    translation::{self, EntityKind},
};

#[derive(Debug, Deserialize, IntoParams, Default)]
#[into_params(parameter_in = Query)]
pub struct PostQuery {
    status: Option<PostStatus>,
    visibility: Option<PostVisibility>,
    content_kind: Option<PostContentKind>,
    locale: Option<PostLocale>,
}

#[derive(Debug, Deserialize, IntoParams, Default)]
#[into_params(parameter_in = Query)]
pub struct ListPostsQuery {
    /// Page size (1..=100, default 20).
    limit: Option<i64>,
    /// Items skipped before this page (>= 0, default 0).
    offset: Option<i64>,
    status: Option<PostStatus>,
    visibility: Option<PostVisibility>,
    content_kind: Option<PostContentKind>,
    locale: Option<PostLocale>,
    /// Repeatable tag query parameter. Example: `?tag=rust&tag=axum`.
    #[serde(default, rename = "tag")]
    tag: Vec<String>,
    /// "any" matches at least one of `tag`; "all" requires every requested tag.
    tag_match: Option<TagMatch>,
}

#[utoipa::path(
    get,
    path = "/posts",
    tag = "posts",
    operation_id = "list_posts",
    summary = "List posts",
    description = "Return posts list. Public callers see only published+public posts.",
    params(ListPostsQuery),
    responses(
        (status = 200, description = "Posts returned", body = Vec<PostRead>),
        (status = 400, description = "Invalid query parameter", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
)]
pub async fn list_posts_handler(
    State(state): State<AppState>,
    OptionalInternalSecret(trusted): OptionalInternalSecret,
    Query(params): Query<ListPostsQuery>,
) -> Result<Json<Vec<PostRead>>, AppError> {
    let (limit, offset) = validate_limit_offset(params.limit, params.offset, 20, 100)?;

    let (status, visibility) = effective_visibility(trusted, params.status, params.visibility);

    let req = ListPostsParams {
        limit,
        offset,
        status,
        visibility,
        content_kind: params.content_kind,
        locale: params.locale,
        tags: params.tag,
        tag_match: params.tag_match.unwrap_or_default(),
    };

    let posts = list_posts(&state.pool, &req).await?;
    Ok(Json(posts))
}

#[utoipa::path(
    get,
    path = "/posts/{slug}",
    tag = "posts",
    operation_id = "get_post_by_slug",
    summary = "Get post by slug",
    description = "Return a single post by slug. Public callers can access published/public posts only. Internal-secret bypass not yet ported.",
    params(
        ("slug" = String, Path, description = "URL-friendly post identifier", example = "unity-roadshow-2026"),
        PostQuery,
    ),
    responses(
        (status = 200, description = "Post returned", body = PostRead),
        (status = 400, description = "Invalid query parameter (e.g., unknown locale)", body = ErrorDetail),
        (status = 404, description = "Post not found", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
)]
pub async fn get_post_by_slug_handler(
    State(state): State<AppState>,
    OptionalInternalSecret(trusted): OptionalInternalSecret,
    Path(slug): Path<String>,
    Query(params): Query<PostQuery>,
) -> Result<Json<PostRead>, AppError> {
    let (status, visibility) = effective_visibility(trusted, params.status, params.visibility);
    let filter = PostFilter {
        status,
        visibility,
        content_kind: params.content_kind,
        locale: params.locale,
    };

    let post = get_post_by_slug(&state.pool, &slug, filter)
        .await?
        .ok_or(AppError::NotFound("post not found"))?;
    Ok(Json(post))
}

#[derive(Debug, Deserialize, IntoParams, Default)]
#[into_params(parameter_in = Query)]
pub struct ListSummariesQuery {
    /// Page size (1..=100, default 20).
    limit: Option<i64>,
    /// Items skipped before this page (>= 0, default 0).
    offset: Option<i64>,
    status: Option<PostStatus>,
    visibility: Option<PostVisibility>,
    content_kind: Option<PostContentKind>,
    locale: Option<PostLocale>,
    /// Repeatable tag query parameter.
    #[serde(default, rename = "tag")]
    tag: Vec<String>,
    /// "any" matches at least one of `tag`; "all" requires every requested tag.
    tag_match: Option<TagMatch>,
    /// Free-text fragment matched against title and excerpt.
    query: Option<String>,
    /// "latest" (default), "oldest", or "title".
    sort: Option<PostSortMode>,
}

#[utoipa::path(
    get,
    path = "/posts/summary",
    tag = "posts",
    operation_id = "list_post_summaries",
    summary = "List post summaries",
    description = "Card-shaped summaries (no markdown body) plus tag-bar facets and a public/private visibility tally. Public callers see only published+public counts; trusted callers see private counts as well.",
    params(ListSummariesQuery),
    responses(
        (status = 200, description = "Summaries returned", body = PostSummaryListRead),
        (status = 400, description = "Invalid query parameter", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
)]
pub async fn list_post_summaries_handler(
    State(state): State<AppState>,
    OptionalInternalSecret(trusted): OptionalInternalSecret,
    Query(params): Query<ListSummariesQuery>,
) -> Result<Json<PostSummaryListRead>, AppError> {
    let (limit, offset) = validate_limit_offset(params.limit, params.offset, 20, 100)?;

    let (status, visibility) = effective_visibility(trusted, params.status, params.visibility);

    let req = ListSummariesParams {
        limit,
        offset,
        status,
        visibility,
        content_kind: params.content_kind,
        locale: params.locale,
        tags: params.tag,
        tag_match: params.tag_match.unwrap_or_default(),
        query: params.query,
        sort: params.sort.unwrap_or_default(),
        include_private_visibility_counts: trusted,
    };

    let summaries = list_post_summaries(&state.pool, &req, state.reading_words_per_minute).await?;
    Ok(Json(summaries))
}

#[derive(Debug, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct RedirectQuery {
    /// Locale of the old slug; required because slugs are unique per locale.
    pub(crate) locale: PostLocale,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct RedirectResolution {
    pub(crate) target_slug: String,
}

#[utoipa::path(
    get,
    path = "/posts/redirects/{old_slug}",
    tag = "posts",
    operation_id = "resolve_post_redirect",
    summary = "Resolve old blog slug to current slug",
    description = "Look up the canonical current slug for a renamed blog post. Restricted to published+public blog posts; drafts/projects do not surface here.",
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
pub async fn resolve_post_redirect_handler(
    State(state): State<AppState>,
    Path(old_slug): Path<String>,
    Query(params): Query<RedirectQuery>,
) -> Result<Json<RedirectResolution>, AppError> {
    let target = resolve_post_redirect(&state.pool, &old_slug, params.locale)
        .await?
        .ok_or(AppError::NotFound("no redirect for this slug"))?;
    Ok(Json(RedirectResolution {
        target_slug: target,
    }))
}

#[utoipa::path(
    post,
    path = "/posts",
    tag = "posts",
    operation_id = "create_post",
    summary = "Create post",
    description = "Create a new post. Requires `x-internal-api-secret`. Tag slugs are normalized and any pre-existing slug-redirect that pointed at this slug is dropped.",
    request_body = PostCreate,
    responses(
        (status = 200, description = "Post created", body = PostRead),
        (status = 401, description = "Missing or invalid internal API secret", body = ErrorDetail),
        (status = 409, description = "Slug already exists", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
    security(("internal_api_secret" = [])),
)]
pub async fn create_post_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
    Json(payload): Json<PostCreate>,
) -> Result<Json<PostRead>, AppError> {
    let post = create_post(&state.pool, payload).await?;
    fire_post_write_effects(&state, &post);
    Ok(Json(post))
}

/// Side effects to run after every post write that succeeded:
/// - IndexNow: notify search engines for published posts only
/// - Series projection: notify the rebuild loop; the debounce coalesces
///   bursts so back-to-back writes produce one rebuild.
/// - Translation enqueue: only for ko sources (`source_post_id IS NULL`).
///   Spawned so a Redis hiccup doesn't slow the user-facing response.
fn fire_post_write_effects(state: &AppState, post: &PostRead) {
    if matches!(post.status, PostStatus::Published) {
        let content_kind = match post.content_kind {
            PostContentKind::Project => "project",
            PostContentKind::Blog => "blog",
        };
        if let Some(url) = state.indexnow.post_url(post.locale.as_str(), content_kind, &post.slug) {
            state.indexnow.submit_urls(vec![url]);
        }
    }
    state.series_projector.request_refresh("post-write");

    if matches!(post.locale, PostLocale::Ko) && post.source_post_id.is_none() {
        let queue = state.translation_queue.clone();
        let post_id = post.id;
        tokio::spawn(async move {
            translation::enqueue_for_locales(queue.as_ref(), EntityKind::Post, post_id).await;
        });
    }
}

#[utoipa::path(
    put,
    path = "/posts/{slug}",
    tag = "posts",
    operation_id = "update_post_by_slug",
    summary = "Update post",
    description = "Replace post fields by slug. Requires `x-internal-api-secret`. A slug change records a redirect from the old slug. Tags are re-resolved against the payload list and the M2M is rebuilt.",
    params(
        ("slug" = String, Path, description = "Current URL-friendly post identifier", example = "unity-roadshow-2026"),
    ),
    request_body = PostCreate,
    responses(
        (status = 200, description = "Post updated", body = PostRead),
        (status = 401, description = "Missing or invalid internal API secret", body = ErrorDetail),
        (status = 404, description = "Post not found", body = ErrorDetail),
        (status = 409, description = "Slug already exists", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
    security(("internal_api_secret" = [])),
)]
pub async fn update_post_by_slug_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Json(payload): Json<PostCreate>,
) -> Result<Json<PostRead>, AppError> {
    let post = update_post_by_slug(&state.pool, &slug, payload)
        .await?
        .ok_or(AppError::NotFound("post not found"))?;
    fire_post_write_effects(&state, &post);
    Ok(Json(post))
}

#[derive(Debug, Deserialize, IntoParams, Default)]
#[into_params(parameter_in = Query)]
pub struct DeletePostQuery {
    status: Option<PostStatus>,
    visibility: Option<PostVisibility>,
}

#[utoipa::path(
    delete,
    path = "/posts/{slug}",
    tag = "posts",
    operation_id = "delete_post_by_slug",
    summary = "Delete post",
    description = "Delete a post by slug. Requires `x-internal-api-secret`. Optional status/visibility narrow the deletion target.",
    params(
        ("slug" = String, Path, description = "URL-friendly post identifier"),
        DeletePostQuery,
    ),
    responses(
        (status = 204, description = "Post deleted"),
        (status = 401, description = "Missing or invalid internal API secret", body = ErrorDetail),
        (status = 404, description = "Post not found", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
    security(("internal_api_secret" = [])),
)]
pub async fn delete_post_by_slug_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Query(params): Query<DeletePostQuery>,
) -> Result<StatusCode, AppError> {
    let deleted = delete_post_by_slug(&state.pool, &slug, params.status, params.visibility).await?;
    if !deleted {
        return Err(AppError::NotFound("post not found"));
    }
    state.series_projector.request_refresh("post-deleted");
    Ok(StatusCode::NO_CONTENT)
}
