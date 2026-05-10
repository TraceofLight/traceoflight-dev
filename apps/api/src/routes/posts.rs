use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
};
use axum_extra::extract::Query;
use serde::{Deserialize, Serialize};
use tracing::{debug, info};
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
        prepare_post_retranslation, resolve_post_redirect, update_post_by_slug,
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
    let tag_count = params.tag.len();
    let tag_match = params.tag_match.unwrap_or_default();
    debug!(
        event = "post.list_requested",
        trusted,
        limit,
        offset,
        status = status.map(|value| value.as_str()).unwrap_or("any"),
        visibility = visibility.map(|value| value.as_str()).unwrap_or("any"),
        content_kind = params
            .content_kind
            .map(|value| value.as_str())
            .unwrap_or("any"),
        locale = params.locale.map(|value| value.as_str()).unwrap_or("any"),
        tag_count,
        tag_match = ?tag_match,
        "post list requested"
    );

    let req = ListPostsParams {
        limit,
        offset,
        status,
        visibility,
        content_kind: params.content_kind,
        locale: params.locale,
        tags: params.tag,
        tag_match,
    };

    let posts = list_posts(&state.db, &req).await?;
    debug!(
        event = "post.list_returned",
        trusted,
        limit,
        offset,
        returned_count = posts.len(),
        "post list returned"
    );
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
    debug!(
        event = "post.detail_requested",
        trusted,
        slug = %slug,
        status = status.map(|value| value.as_str()).unwrap_or("any"),
        visibility = visibility.map(|value| value.as_str()).unwrap_or("any"),
        content_kind = params
            .content_kind
            .map(|value| value.as_str())
            .unwrap_or("any"),
        locale = params.locale.map(|value| value.as_str()).unwrap_or("any"),
        "post detail requested"
    );
    let filter = PostFilter {
        status,
        visibility,
        content_kind: params.content_kind,
        locale: params.locale,
    };

    let post = get_post_by_slug(&state.db, &slug, filter)
        .await?
        .ok_or(AppError::NotFound("post not found"))?;
    debug!(
        event = "post.detail_returned",
        trusted,
        post_id = %post.id,
        slug = %post.slug,
        locale = post.locale.as_str(),
        status = post.status.as_str(),
        visibility = post.visibility.as_str(),
        content_kind = post.content_kind.as_str(),
        "post detail returned"
    );
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
    let tag_count = params.tag.len();
    let tag_match = params.tag_match.unwrap_or_default();
    let sort = params.sort.unwrap_or_default();
    let query_present = params
        .query
        .as_ref()
        .is_some_and(|value| !value.trim().is_empty());
    debug!(
        event = "post.summary_requested",
        trusted,
        limit,
        offset,
        status = status.map(|value| value.as_str()).unwrap_or("any"),
        visibility = visibility.map(|value| value.as_str()).unwrap_or("any"),
        content_kind = params
            .content_kind
            .map(|value| value.as_str())
            .unwrap_or("any"),
        locale = params.locale.map(|value| value.as_str()).unwrap_or("any"),
        tag_count,
        tag_match = ?tag_match,
        query_present,
        sort = ?sort,
        "post summary requested"
    );

    let req = ListSummariesParams {
        limit,
        offset,
        status,
        visibility,
        content_kind: params.content_kind,
        locale: params.locale,
        tags: params.tag,
        tag_match,
        query: params.query,
        sort,
        include_private_visibility_counts: trusted,
    };

    let summaries = list_post_summaries(&state.db, &req, state.reading_words_per_minute).await?;
    debug!(
        event = "post.summary_returned",
        trusted,
        limit,
        offset,
        returned_count = summaries.items.len(),
        total_count = summaries.total_count,
        has_more = summaries.has_more,
        tag_filter_count = summaries.tag_filters.len(),
        visibility_all = summaries.visibility_counts.all,
        visibility_public = summaries.visibility_counts.public,
        visibility_private = summaries.visibility_counts.private,
        "post summary returned"
    );
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
    let target = resolve_post_redirect(&state.db, &old_slug, params.locale)
        .await?
        .ok_or(AppError::NotFound("no redirect for this slug"))?;
    debug!(
        event = "post.redirect_resolved",
        old_slug = %old_slug,
        locale = params.locale.as_str(),
        target_slug = %target,
        "post redirect resolved"
    );
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
    let post = create_post(&state.db, payload).await?;
    info!(
        event = "post.created",
        post_id = %post.id,
        slug = %post.slug,
        locale = post.locale.as_str(),
        status = post.status.as_str(),
        visibility = post.visibility.as_str(),
        content_kind = post.content_kind.as_str(),
        "post created"
    );
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
        if let Some(url) = state
            .indexnow
            .post_url(post.locale.as_str(), content_kind, &post.slug)
        {
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
    let post = update_post_by_slug(&state.db, &slug, payload)
        .await?
        .ok_or(AppError::NotFound("post not found"))?;
    info!(
        event = "post.updated",
        post_id = %post.id,
        previous_slug = %slug,
        slug = %post.slug,
        locale = post.locale.as_str(),
        status = post.status.as_str(),
        visibility = post.visibility.as_str(),
        content_kind = post.content_kind.as_str(),
        "post updated"
    );
    fire_post_write_effects(&state, &post);
    Ok(Json(post))
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct RetranslatePostRequest {
    locale: PostLocale,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct RetranslatePostResponse {
    detail: &'static str,
}

#[utoipa::path(
    post,
    path = "/posts/{slug}/retranslate",
    tag = "posts",
    operation_id = "retranslate_post_by_slug",
    summary = "Queue post retranslation",
    description = "Queue a single non-ko translated post for retranslation from its ko source. Requires `x-internal-api-secret`.",
    params(
        ("slug" = String, Path, description = "Translated post slug"),
    ),
    request_body = RetranslatePostRequest,
    responses(
        (status = 202, description = "Retranslation queued", body = RetranslatePostResponse),
        (status = 401, description = "Missing or invalid internal API secret", body = ErrorDetail),
        (status = 403, description = "Post is not eligible for retranslation", body = ErrorDetail),
        (status = 404, description = "Post not found", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
    security(("internal_api_secret" = [])),
)]
pub async fn retranslate_post_by_slug_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Json(payload): Json<RetranslatePostRequest>,
) -> Result<(StatusCode, Json<RetranslatePostResponse>), AppError> {
    let source_id = prepare_post_retranslation(&state.db, &slug, payload.locale).await?;
    let queue = state.translation_queue.clone();
    let target_locale = payload.locale.as_str().to_string();
    info!(
        event = "post.retranslation_requested",
        source_post_id = %source_id,
        slug = %slug,
        target_locale = %target_locale,
        "post retranslation requested"
    );
    tokio::spawn(async move {
        translation::enqueue_for_locale(
            queue.as_ref(),
            EntityKind::Post,
            source_id,
            target_locale.as_str(),
        )
        .await;
    });
    Ok((
        StatusCode::ACCEPTED,
        Json(RetranslatePostResponse {
            detail: "retranslation queued",
        }),
    ))
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
    let deleted = delete_post_by_slug(&state.db, &slug, params.status, params.visibility).await?;
    if !deleted {
        return Err(AppError::NotFound("post not found"));
    }
    info!(
        event = "post.deleted",
        slug = %slug,
        status = params.status.map(|status| status.as_str()).unwrap_or("any"),
        visibility = params
            .visibility
            .map(|visibility| visibility.as_str())
            .unwrap_or("any"),
        "post deleted"
    );
    state.series_projector.request_refresh("post-deleted");
    Ok(StatusCode::NO_CONTENT)
}
