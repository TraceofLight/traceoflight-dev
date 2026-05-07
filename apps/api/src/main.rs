mod admin_auth;
mod auth;
mod cleanup;
mod comments;
mod config;
mod error;
mod imports;
mod indexnow;
mod media;
mod media_refs;
mod observability;
mod pdf_assets;
mod posts;
mod projects;
mod series;
mod series_projection;
mod site_profile;
mod tags;

use std::net::SocketAddr;

use std::sync::Arc;

use axum::{
    Router,
    body::{Body, Bytes},
    extract::{FromRef, Multipart, Path, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{Json, Response},
};
use axum_extra::extract::Query;
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, postgres::PgPoolOptions};
use tower_http::{
    cors::{AllowHeaders, AllowMethods, CorsLayer},
    request_id::{PropagateRequestIdLayer, SetRequestIdLayer},
};
use tracing::{error, info};
use utoipa::{IntoParams, OpenApi, ToSchema};
use utoipa_axum::{router::OpenApiRouter, routes};
use utoipa_swagger_ui::SwaggerUi;
use uuid::Uuid;

use crate::{
    admin_auth::{
        AdminAuthContext, AdminAuthLoginRequest, AdminAuthLoginResponse,
        AdminCredentialRevisionResponse, AdminCredentialUpdateRequest,
        AdminCredentialUpdateResponse, AdminLogoutRequest, AdminLogoutResponse,
        AdminRefreshRequest, AdminRefreshResponse, RefreshOutcome, RefreshStore,
        get_active_credential_revision, login as admin_login, revoke_refresh_token_family,
        rotate_refresh_token, update_operational_credentials,
    },
    auth::{AuthContext, OptionalInternalSecret, RequireInternalSecret},
    cleanup::{CleanupSettings, spawn_draft_cleanup, spawn_slug_redirect_cleanup},
    comments::{
        AdminCommentFeed, PostCommentCreate, PostCommentDelete, PostCommentRead,
        PostCommentThreadList, PostCommentUpdate, create_comment, delete_comment,
        list_admin_comments, list_post_comments, update_comment,
    },
    config::{MinioSettings, Settings},
    error::{AppError, ErrorDetail},
    imports::{BackupLoadRead, download_posts_backup, load_posts_backup},
    indexnow::IndexNowClient,
    media::{
        MediaCreate, MediaRead, MediaUploadRequest, MediaUploadResponse, build_object_key,
        presigned_put_url, proxy_upload, register_media,
    },
    observability::{REQUEST_ID_HEADER, UuidRequestId, http_trace_layer, init_tracing},
    pdf_assets::{
        PORTFOLIO_PDF, PdfAssetConfig, PdfStatus, RESUME_PDF, delete_pdf, download_pdf,
        get_status as pdf_status, upload_pdf,
    },
    posts::{
        ListPostsParams, ListSummariesParams, PostContentKind, PostCreate, PostFilter, PostLocale,
        PostRead, PostSortMode, PostStatus, PostSummaryListRead, PostVisibility, TagMatch, TagRead,
        create_post, delete_post_by_slug, get_post_by_slug, list_post_summaries, list_posts,
        resolve_post_redirect, update_post_by_slug,
    },
    projects::{
        ListProjectsParams, ProjectRead, ProjectsOrderReplace, get_project_by_slug, list_projects,
        replace_project_order, resolve_project_redirect,
    },
    series::{
        ListSeriesParams, SeriesDetailRead, SeriesOrderReplace, SeriesPostsReplace, SeriesRead,
        SeriesUpsert, create_series, delete_series_by_slug, get_series_by_slug, list_series,
        replace_series_order, replace_series_posts_by_slug, resolve_series_redirect,
        update_series_by_slug,
    },
    series_projection::SeriesProjector,
    site_profile::{SiteProfileRead, get_site_profile, update_site_profile},
    tags::{TagCreate, TagUpdate, create_tag, delete_tag, list_tags, update_tag},
};

#[derive(Clone)]
pub struct AppState {
    pool: PgPool,
    auth: AuthContext,
    reading_words_per_minute: u32,
    minio: Arc<MinioSettings>,
    admin: AdminAuthContext,
    indexnow: IndexNowClient,
    series_projector: SeriesProjector,
}

impl FromRef<AppState> for AuthContext {
    fn from_ref(state: &AppState) -> Self {
        state.auth.clone()
    }
}

#[derive(OpenApi)]
#[openapi(
    info(
        title = "traceoflight-api",
        version = "0.0.1",
        description = "TraceofLight web-service API. Public read endpoints serve published+public content; trusted callers using the internal-secret header can request drafts and write operations.",
    ),
    tags(
        (name = "posts", description = "Public post detail and list endpoints."),
        (name = "projects", description = "Project content surface (subset of posts with `content_kind=project`)."),
        (name = "series", description = "Series collection and member-post linkage management."),
        (name = "tags", description = "Tag taxonomy management (admin-only)."),
        (name = "site-profile", description = "Footer profile (email + GitHub URL) shown across the site."),
        (name = "comments", description = "Threaded post comments, guest+admin authoring, soft-delete and admin feed."),
        (name = "media", description = "Object-storage upload URL issue, metadata register, and server-side body proxy."),
        (name = "admin-auth", description = "Admin login, refresh-token rotation (RTR), logout and credential management."),
        (name = "imports", description = "Backup ZIP download and restore (admin-only)."),
        (name = "portfolio", description = "Public portfolio PDF retrieval and admin upload."),
        (name = "resume", description = "Public resume PDF retrieval and admin upload."),
        (name = "infra", description = "Liveness and readiness probes consumed by orchestrators and health monitors."),
    ),
)]
struct ApiDoc;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::from_filename(".env.api");

    let settings = Settings::from_env()?;
    init_tracing(settings.log_format);

    let pool = PgPoolOptions::new()
        .max_connections(settings.database_max_connections)
        .connect_lazy(&settings.database_url)?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    let refresh_store = if let Some(url) = settings.redis_url.as_deref() {
        let client = redis::Client::open(url)
            .map_err(|err| anyhow::anyhow!("redis client init failed: {err}"))?;
        let conn = client
            .get_connection_manager()
            .await
            .map_err(|err| anyhow::anyhow!("redis connect failed: {err}"))?;
        Some(RefreshStore::new(conn))
    } else {
        None
    };
    let admin_ctx = AdminAuthContext::new(settings.admin.clone(), refresh_store);

    let indexnow = IndexNowClient::new(settings.indexnow.clone());
    let series_projector = SeriesProjector::new();
    series_projector.spawn_loop(pool.clone(), settings.series_projection_debounce_seconds);

    let cleanup_settings = Arc::new(CleanupSettings::from_env());
    let minio_arc = Arc::new(settings.minio.clone());
    spawn_draft_cleanup(pool.clone(), minio_arc.clone(), cleanup_settings.clone());
    spawn_slug_redirect_cleanup(pool.clone(), cleanup_settings.clone());

    let state = AppState {
        pool,
        auth: AuthContext::new(settings.internal_api_secret.clone()),
        reading_words_per_minute: settings.reading_words_per_minute,
        minio: minio_arc.clone(),
        admin: admin_ctx,
        indexnow,
        series_projector,
    };

    let api_routes: OpenApiRouter<AppState> = OpenApiRouter::new()
        .routes(routes!(list_posts_handler, create_post_handler))
        .routes(routes!(list_post_summaries_handler))
        .routes(routes!(resolve_post_redirect_handler))
        .routes(routes!(
            get_post_by_slug_handler,
            update_post_by_slug_handler,
            delete_post_by_slug_handler
        ))
        .routes(routes!(list_tags_handler, create_tag_handler))
        .routes(routes!(update_tag_handler, delete_tag_handler))
        .routes(routes!(list_projects_handler))
        .routes(routes!(replace_project_order_handler))
        .routes(routes!(resolve_project_redirect_handler))
        .routes(routes!(get_project_by_slug_handler))
        .routes(routes!(list_series_handler, create_series_handler))
        .routes(routes!(replace_series_order_handler))
        .routes(routes!(resolve_series_redirect_handler))
        .routes(routes!(
            get_series_by_slug_handler,
            update_series_by_slug_handler,
            delete_series_by_slug_handler
        ))
        .routes(routes!(replace_series_posts_handler))
        .routes(routes!(
            get_site_profile_handler,
            update_site_profile_handler
        ))
        .routes(routes!(
            list_post_comments_handler,
            create_post_comment_handler
        ))
        .routes(routes!(update_comment_handler, delete_comment_handler))
        .routes(routes!(list_admin_comments_handler))
        .routes(routes!(create_upload_url_handler))
        .routes(routes!(register_media_handler))
        .routes(routes!(upload_media_proxy_handler))
        .routes(routes!(admin_login_handler))
        .routes(routes!(admin_refresh_handler))
        .routes(routes!(admin_logout_handler))
        .routes(routes!(admin_get_revision_handler))
        .routes(routes!(admin_update_credentials_handler))
        .routes(routes!(download_posts_backup_handler))
        .routes(routes!(load_posts_backup_handler))
        .routes(routes!(get_portfolio_status_handler))
        .routes(routes!(
            get_portfolio_pdf_handler,
            upload_portfolio_pdf_handler,
            delete_portfolio_pdf_handler
        ))
        .routes(routes!(get_resume_status_handler))
        .routes(routes!(
            get_resume_pdf_handler,
            upload_resume_pdf_handler,
            delete_resume_pdf_handler
        ));

    let api_routes = api_routes.routes(routes!(health)).routes(routes!(ready));

    let (axum_router, openapi) = OpenApiRouter::with_openapi(ApiDoc::openapi())
        .nest(&settings.api_prefix, api_routes)
        .split_for_parts();

    let cors = build_cors_layer(&settings.cors_allow_origins);

    let app = Router::new()
        .merge(axum_router)
        .merge(SwaggerUi::new("/docs").url("/api-docs/openapi.json", openapi))
        .with_state(state)
        .layer(PropagateRequestIdLayer::new(REQUEST_ID_HEADER.clone()))
        .layer(http_trace_layer())
        .layer(SetRequestIdLayer::new(
            REQUEST_ID_HEADER.clone(),
            UuidRequestId,
        ))
        .layer(cors);

    let addr = SocketAddr::from(([0, 0, 0, 0], settings.api_port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    info!(
        port = settings.api_port,
        api_prefix = %settings.api_prefix,
        "api listening on http://{addr}",
    );

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

#[utoipa::path(
    get,
    path = "/health",
    tag = "infra",
    operation_id = "health",
    summary = "Liveness probe",
    description = "Always returns 200 when the process can serve HTTP. Does not check downstream dependencies.",
    responses((status = 200, description = "Process is up", body = String)),
)]
async fn health() -> &'static str {
    "ok"
}

#[utoipa::path(
    get,
    path = "/ready",
    tag = "infra",
    operation_id = "ready",
    summary = "Readiness probe",
    description = "Returns 200 only after a successful Postgres `SELECT 1`. 503 while the pool cannot reach the database.",
    responses(
        (status = 200, description = "Database reachable", body = String),
        (status = 503, description = "Database unreachable"),
    ),
)]
async fn ready(State(state): State<AppState>) -> Result<&'static str, StatusCode> {
    sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&state.pool)
        .await
        .map(|_| "ok")
        .map_err(|err| {
            error!(error = %err, "ready db ping failed");
            StatusCode::SERVICE_UNAVAILABLE
        })
}

#[derive(Debug, Deserialize, IntoParams, Default)]
#[into_params(parameter_in = Query)]
struct PostQuery {
    status: Option<PostStatus>,
    visibility: Option<PostVisibility>,
    content_kind: Option<PostContentKind>,
    locale: Option<PostLocale>,
}

#[derive(Debug, Deserialize, IntoParams, Default)]
#[into_params(parameter_in = Query)]
struct ListPostsQuery {
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
async fn list_posts_handler(
    State(state): State<AppState>,
    OptionalInternalSecret(trusted): OptionalInternalSecret,
    Query(params): Query<ListPostsQuery>,
) -> Result<Json<Vec<PostRead>>, AppError> {
    let limit = params.limit.unwrap_or(20);
    let offset = params.offset.unwrap_or(0);
    if !(1..=100).contains(&limit) {
        return Err(AppError::BadRequest(
            "limit must be between 1 and 100".into(),
        ));
    }
    if offset < 0 {
        return Err(AppError::BadRequest("offset must be >= 0".into()));
    }

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
async fn get_post_by_slug_handler(
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
struct ListSummariesQuery {
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
async fn list_post_summaries_handler(
    State(state): State<AppState>,
    OptionalInternalSecret(trusted): OptionalInternalSecret,
    Query(params): Query<ListSummariesQuery>,
) -> Result<Json<PostSummaryListRead>, AppError> {
    let limit = params.limit.unwrap_or(20);
    let offset = params.offset.unwrap_or(0);
    if !(1..=100).contains(&limit) {
        return Err(AppError::BadRequest(
            "limit must be between 1 and 100".into(),
        ));
    }
    if offset < 0 {
        return Err(AppError::BadRequest("offset must be >= 0".into()));
    }

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
struct RedirectQuery {
    /// Locale of the old slug; required because slugs are unique per locale.
    locale: PostLocale,
}

#[derive(Debug, Serialize, ToSchema)]
struct RedirectResolution {
    target_slug: String,
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
async fn resolve_post_redirect_handler(
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
async fn create_post_handler(
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
fn fire_post_write_effects(state: &AppState, post: &PostRead) {
    if matches!(post.status, PostStatus::Published) {
        if let Some(url) = state.indexnow.post_url(post.locale.as_str(), &post.slug) {
            state.indexnow.submit_urls(vec![url]);
        }
    }
    state.series_projector.request_refresh("post-write");
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
async fn update_post_by_slug_handler(
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
struct DeletePostQuery {
    status: Option<PostStatus>,
    visibility: Option<PostVisibility>,
}

// ── Projects ────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, IntoParams, Default)]
#[into_params(parameter_in = Query)]
struct ListProjectsQuery {
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
async fn list_projects_handler(
    State(state): State<AppState>,
    OptionalInternalSecret(trusted): OptionalInternalSecret,
    Query(params): Query<ListProjectsQuery>,
) -> Result<Json<Vec<ProjectRead>>, AppError> {
    let limit = params.limit.unwrap_or(20);
    let offset = params.offset.unwrap_or(0);
    if !(1..=100).contains(&limit) {
        return Err(AppError::BadRequest(
            "limit must be between 1 and 100".into(),
        ));
    }
    if offset < 0 {
        return Err(AppError::BadRequest("offset must be >= 0".into()));
    }

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
struct GetProjectQuery {
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
async fn get_project_by_slug_handler(
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
async fn resolve_project_redirect_handler(
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
async fn replace_project_order_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
    Json(payload): Json<ProjectsOrderReplace>,
) -> Result<Json<Vec<ProjectRead>>, AppError> {
    let projects = replace_project_order(&state.pool, payload.project_slugs).await?;
    Ok(Json(projects))
}

fn resolve_include_private(supplied: Option<bool>, trusted: bool) -> bool {
    if !trusted {
        return false;
    }
    supplied.unwrap_or(true)
}

// ── Series ──────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, IntoParams, Default)]
#[into_params(parameter_in = Query)]
struct ListSeriesQuery {
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
async fn list_series_handler(
    State(state): State<AppState>,
    OptionalInternalSecret(trusted): OptionalInternalSecret,
    Query(params): Query<ListSeriesQuery>,
) -> Result<Json<Vec<SeriesRead>>, AppError> {
    let limit = params.limit.unwrap_or(50);
    let offset = params.offset.unwrap_or(0);
    if !(1..=200).contains(&limit) {
        return Err(AppError::BadRequest(
            "limit must be between 1 and 200".into(),
        ));
    }
    if offset < 0 {
        return Err(AppError::BadRequest("offset must be >= 0".into()));
    }
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
async fn replace_series_order_handler(
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
async fn resolve_series_redirect_handler(
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
struct GetSeriesQuery {
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
async fn get_series_by_slug_handler(
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
async fn create_series_handler(
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
async fn update_series_by_slug_handler(
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
async fn delete_series_by_slug_handler(
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
async fn replace_series_posts_handler(
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

// ── Imports (backup) ────────────────────────────────────────────────────────

#[utoipa::path(
    get,
    path = "/imports/backups/posts.zip",
    tag = "imports",
    operation_id = "download_posts_backup",
    summary = "Download posts backup ZIP",
    description = "Bundle posts, series, tags, comments, site profile, and referenced media into a ZIP archive. Requires `x-internal-api-secret`.",
    responses(
        (status = 200, description = "Backup ZIP stream", content_type = "application/zip"),
        (status = 401, description = "Missing or invalid internal API secret", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
    security(("internal_api_secret" = [])),
)]
async fn download_posts_backup_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
) -> Result<Response, AppError> {
    let (filename, bytes) = download_posts_backup(&state.pool, &state.minio).await?;
    let disposition = format!("attachment; filename=\"{filename}\"");
    let response = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/zip")
        .header(header::CONTENT_DISPOSITION, disposition)
        .body(Body::from(bytes))
        .map_err(|e| AppError::Internal(anyhow::anyhow!("response build failed: {e}")))?;
    Ok(response)
}

#[utoipa::path(
    post,
    path = "/imports/backups/load",
    tag = "imports",
    operation_id = "load_posts_backup",
    summary = "Load posts backup ZIP",
    description = "Restore the contents of a backup ZIP. Wipes existing rows in dependency order and rebuilds. Stages media to staging keys first, promotes on DB success, rolls back on DB failure. Requires `x-internal-api-secret`.",
    request_body(content = String, content_type = "multipart/form-data"),
    responses(
        (status = 200, description = "Backup restore finished", body = BackupLoadRead),
        (status = 400, description = "Invalid backup payload", body = ErrorDetail),
        (status = 401, description = "Missing or invalid internal API secret", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
    security(("internal_api_secret" = [])),
)]
async fn load_posts_backup_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<BackupLoadRead>, AppError> {
    let mut file_name: Option<String> = None;
    let mut file_bytes: Option<Vec<u8>> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("multipart parse failed: {e}")))?
    {
        if field.name() == Some("file") {
            file_name = field
                .file_name()
                .map(str::to_string)
                .or(Some(String::new()));
            let bytes = field
                .bytes()
                .await
                .map_err(|e| AppError::BadRequest(format!("multipart body read: {e}")))?;
            file_bytes = Some(bytes.to_vec());
            break;
        }
    }

    let file_name = file_name
        .ok_or_else(|| AppError::BadRequest("`file` multipart field is required".into()))?;
    let file_bytes =
        file_bytes.ok_or_else(|| AppError::BadRequest("`file` multipart field is empty".into()))?;
    let result = load_posts_backup(&state.pool, &state.minio, &file_name, &file_bytes).await?;
    Ok(Json(result))
}

// ── PDF assets (portfolio + resume) ─────────────────────────────────────────

async fn handle_pdf_status(
    state: &AppState,
    config: &PdfAssetConfig,
) -> Result<Json<PdfStatus>, AppError> {
    Ok(Json(pdf_status(&state.minio, config).await?))
}

async fn handle_pdf_download(
    state: &AppState,
    config: &PdfAssetConfig,
) -> Result<Response, AppError> {
    let download = download_pdf(&state.minio, config)
        .await?
        .ok_or_else(|| AppError::NotFound(missing_detail(config)))?;
    let disposition = format!("inline; filename=\"{}\"", download.filename);
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, download.content_type)
        .header(header::CONTENT_DISPOSITION, disposition)
        .body(Body::from(download.body))
        .map_err(|e| AppError::Internal(anyhow::anyhow!("response build failed: {e}")))
}

fn missing_detail(config: &PdfAssetConfig) -> &'static str {
    if config.object_key == PORTFOLIO_PDF.object_key {
        "portfolio pdf is not registered"
    } else {
        "resume pdf is not registered"
    }
}

async fn handle_pdf_upload(
    state: &AppState,
    config: &PdfAssetConfig,
    mut multipart: Multipart,
) -> Result<Json<PdfStatus>, AppError> {
    let mut filename: Option<String> = None;
    let mut content_type: Option<String> = None;
    let mut data: Option<Vec<u8>> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("multipart parse failed: {e}")))?
    {
        if field.name() == Some("file") {
            filename = field
                .file_name()
                .map(str::to_string)
                .or(Some(String::new()));
            content_type = field.content_type().map(str::to_string);
            let bytes = field
                .bytes()
                .await
                .map_err(|e| AppError::BadRequest(format!("multipart body read: {e}")))?;
            data = Some(bytes.to_vec());
            break;
        }
    }
    let filename = filename
        .ok_or_else(|| AppError::BadRequest("`file` multipart field is required".into()))?;
    let data =
        data.ok_or_else(|| AppError::BadRequest("`file` multipart field is empty".into()))?;
    let status = upload_pdf(
        &state.minio,
        config,
        &filename,
        data,
        content_type.as_deref(),
    )
    .await?;
    Ok(Json(status))
}

#[utoipa::path(
    get,
    path = "/portfolio/status",
    tag = "portfolio",
    operation_id = "get_portfolio_status",
    summary = "Read portfolio PDF status",
    responses(
        (status = 200, description = "Status returned", body = PdfStatus),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
)]
async fn get_portfolio_status_handler(
    State(state): State<AppState>,
) -> Result<Json<PdfStatus>, AppError> {
    handle_pdf_status(&state, &PORTFOLIO_PDF).await
}

#[utoipa::path(
    get,
    path = "/portfolio",
    tag = "portfolio",
    operation_id = "get_portfolio_pdf",
    summary = "Download public portfolio PDF",
    responses(
        (status = 200, description = "PDF binary", content_type = "application/pdf"),
        (status = 404, description = "Portfolio PDF not registered", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
)]
async fn get_portfolio_pdf_handler(State(state): State<AppState>) -> Result<Response, AppError> {
    handle_pdf_download(&state, &PORTFOLIO_PDF).await
}

#[utoipa::path(
    post,
    path = "/portfolio",
    tag = "portfolio",
    operation_id = "upload_portfolio_pdf",
    summary = "Upload or replace portfolio PDF",
    request_body(content = String, content_type = "multipart/form-data"),
    responses(
        (status = 200, description = "Upload accepted", body = PdfStatus),
        (status = 400, description = "Invalid filename / content-type / signature", body = ErrorDetail),
        (status = 401, description = "Missing or invalid internal API secret", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
    security(("internal_api_secret" = [])),
)]
async fn upload_portfolio_pdf_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
    multipart: Multipart,
) -> Result<Json<PdfStatus>, AppError> {
    handle_pdf_upload(&state, &PORTFOLIO_PDF, multipart).await
}

#[utoipa::path(
    delete,
    path = "/portfolio",
    tag = "portfolio",
    operation_id = "delete_portfolio_pdf",
    summary = "Delete portfolio PDF",
    responses(
        (status = 200, description = "Deletion acknowledged", body = PdfStatus),
        (status = 401, description = "Missing or invalid internal API secret", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
    security(("internal_api_secret" = [])),
)]
async fn delete_portfolio_pdf_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
) -> Result<Json<PdfStatus>, AppError> {
    Ok(Json(delete_pdf(&state.minio, &PORTFOLIO_PDF).await?))
}

#[utoipa::path(
    get,
    path = "/resume/status",
    tag = "resume",
    operation_id = "get_resume_status",
    summary = "Read resume PDF status",
    responses(
        (status = 200, description = "Status returned", body = PdfStatus),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
)]
async fn get_resume_status_handler(
    State(state): State<AppState>,
) -> Result<Json<PdfStatus>, AppError> {
    handle_pdf_status(&state, &RESUME_PDF).await
}

#[utoipa::path(
    get,
    path = "/resume",
    tag = "resume",
    operation_id = "get_resume_pdf",
    summary = "Download public resume PDF",
    responses(
        (status = 200, description = "PDF binary", content_type = "application/pdf"),
        (status = 404, description = "Resume PDF not registered", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
)]
async fn get_resume_pdf_handler(State(state): State<AppState>) -> Result<Response, AppError> {
    handle_pdf_download(&state, &RESUME_PDF).await
}

#[utoipa::path(
    post,
    path = "/resume",
    tag = "resume",
    operation_id = "upload_resume_pdf",
    summary = "Upload or replace resume PDF",
    request_body(content = String, content_type = "multipart/form-data"),
    responses(
        (status = 200, description = "Upload accepted", body = PdfStatus),
        (status = 400, description = "Invalid filename / content-type / signature", body = ErrorDetail),
        (status = 401, description = "Missing or invalid internal API secret", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
    security(("internal_api_secret" = [])),
)]
async fn upload_resume_pdf_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
    multipart: Multipart,
) -> Result<Json<PdfStatus>, AppError> {
    handle_pdf_upload(&state, &RESUME_PDF, multipart).await
}

#[utoipa::path(
    delete,
    path = "/resume",
    tag = "resume",
    operation_id = "delete_resume_pdf",
    summary = "Delete resume PDF",
    responses(
        (status = 200, description = "Deletion acknowledged", body = PdfStatus),
        (status = 401, description = "Missing or invalid internal API secret", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
    security(("internal_api_secret" = [])),
)]
async fn delete_resume_pdf_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
) -> Result<Json<PdfStatus>, AppError> {
    Ok(Json(delete_pdf(&state.minio, &RESUME_PDF).await?))
}

// ── Admin auth ──────────────────────────────────────────────────────────────

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
async fn admin_login_handler(
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
async fn admin_refresh_handler(
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
async fn admin_logout_handler(
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
async fn admin_get_revision_handler(
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
async fn admin_update_credentials_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
    Json(payload): Json<AdminCredentialUpdateRequest>,
) -> Result<Json<AdminCredentialUpdateResponse>, AppError> {
    let response = update_operational_credentials(&state.pool, payload).await?;
    Ok(Json(response))
}

// ── Media ───────────────────────────────────────────────────────────────────

#[utoipa::path(
    post,
    path = "/media/upload-url",
    tag = "media",
    operation_id = "create_upload_url",
    summary = "Create upload URL",
    description = "Issue a presigned PUT URL for object storage. The browser uploads bytes directly to that URL, then calls `POST /media` to persist metadata.",
    request_body = MediaUploadRequest,
    responses(
        (status = 200, description = "Upload URL issued", body = MediaUploadResponse),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
)]
async fn create_upload_url_handler(
    State(state): State<AppState>,
    Json(payload): Json<MediaUploadRequest>,
) -> Result<Json<MediaUploadResponse>, AppError> {
    let object_key = build_object_key(payload.kind, &payload.filename);
    let upload_url = presigned_put_url(&state.minio, &object_key, &payload.mime_type)?;
    Ok(Json(MediaUploadResponse {
        object_key,
        bucket: state.minio.bucket.clone(),
        upload_url,
        expires_in_seconds: state.minio.presigned_expire_seconds,
    }))
}

#[utoipa::path(
    post,
    path = "/media",
    tag = "media",
    operation_id = "register_media",
    summary = "Register uploaded media",
    description = "Persist metadata for a media object that has already been uploaded to storage.",
    request_body = MediaCreate,
    responses(
        (status = 200, description = "Media metadata registered", body = MediaRead),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
)]
async fn register_media_handler(
    State(state): State<AppState>,
    Json(payload): Json<MediaCreate>,
) -> Result<Json<MediaRead>, AppError> {
    let media = register_media(&state.pool, payload, &state.minio.bucket).await?;
    Ok(Json(media))
}

#[derive(Debug, Serialize, ToSchema)]
struct UploadProxyAck {
    ok: bool,
}

#[utoipa::path(
    post,
    path = "/media/upload-proxy",
    tag = "media",
    operation_id = "upload_media_proxy",
    summary = "Proxy upload to object storage",
    description = "Forward the raw request body to the URL given in `x-upload-url`. The optional `x-upload-content-type` header overrides Content-Type forwarded to storage. Used as a CORS-blocked browser fallback.",
    request_body(content = String, content_type = "application/octet-stream"),
    responses(
        (status = 200, description = "Body uploaded", body = UploadProxyAck),
        (status = 400, description = "Missing header/body or unsupported protocol", body = ErrorDetail),
        (status = 502, description = "Object storage rejected the upload", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
)]
async fn upload_media_proxy_handler(
    headers: HeaderMap,
    body: Bytes,
) -> Result<Json<UploadProxyAck>, AppError> {
    let upload_url = headers
        .get("x-upload-url")
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| AppError::BadRequest("x-upload-url header is required".into()))?;
    if body.is_empty() {
        return Err(AppError::BadRequest("request body is empty".into()));
    }
    let content_type = headers
        .get("x-upload-content-type")
        .or_else(|| headers.get("content-type"))
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("application/octet-stream");

    proxy_upload(upload_url, content_type, body).await?;
    Ok(Json(UploadProxyAck { ok: true }))
}

// ── Comments ────────────────────────────────────────────────────────────────

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
async fn list_post_comments_handler(
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
async fn create_post_comment_handler(
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
async fn update_comment_handler(
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
async fn delete_comment_handler(
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
struct AdminCommentsQuery {
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
async fn list_admin_comments_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
    Query(params): Query<AdminCommentsQuery>,
) -> Result<Json<AdminCommentFeed>, AppError> {
    let limit = params.limit.unwrap_or(100);
    let offset = params.offset.unwrap_or(0);
    if !(1..=200).contains(&limit) {
        return Err(AppError::BadRequest(
            "limit must be between 1 and 200".into(),
        ));
    }
    if offset < 0 {
        return Err(AppError::BadRequest("offset must be >= 0".into()));
    }
    let feed = list_admin_comments(&state.pool, limit, offset, params.post_slug.as_deref()).await?;
    Ok(Json(feed))
}

// ── Site profile ────────────────────────────────────────────────────────────

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
async fn get_site_profile_handler(
    State(state): State<AppState>,
) -> Result<Json<SiteProfileRead>, AppError> {
    let profile = get_site_profile(&state.pool).await?;
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
async fn update_site_profile_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
    Json(payload): Json<SiteProfileRead>,
) -> Result<Json<SiteProfileRead>, AppError> {
    let profile = update_site_profile(&state.pool, payload).await?;
    Ok(Json(profile))
}

// ── Tags ────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, IntoParams, Default)]
#[into_params(parameter_in = Query)]
struct ListTagsQuery {
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
async fn list_tags_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
    Query(params): Query<ListTagsQuery>,
) -> Result<Json<Vec<TagRead>>, AppError> {
    let limit = params.limit.unwrap_or(50);
    let offset = params.offset.unwrap_or(0);
    if !(1..=200).contains(&limit) {
        return Err(AppError::BadRequest(
            "limit must be between 1 and 200".into(),
        ));
    }
    if offset < 0 {
        return Err(AppError::BadRequest("offset must be >= 0".into()));
    }
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
async fn create_tag_handler(
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
async fn update_tag_handler(
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
struct DeleteTagQuery {
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
async fn delete_tag_handler(
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
async fn delete_post_by_slug_handler(
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

/// Resolve status/visibility filters per caller trust:
/// - trusted (valid internal-secret): pass through caller's choice, including
///   `None` which means "no filter" (drafts, archived, private all visible).
/// - anonymous: force published+public regardless of what was requested.
fn effective_visibility(
    trusted: bool,
    status: Option<PostStatus>,
    visibility: Option<PostVisibility>,
) -> (Option<PostStatus>, Option<PostVisibility>) {
    if trusted {
        (status, visibility)
    } else {
        (Some(PostStatus::Published), Some(PostVisibility::Public))
    }
}

/// Build a CORS layer from the configured origin list. `allow_credentials =
/// true` forces method/header checks to be specific (not `Any`); the
/// `mirror_request` strategy reflects whatever the preflight asked for, which
/// is the practical equivalent of "allow anything the browser tries" while
/// still satisfying the credentials-mode CORS rules.
fn build_cors_layer(origins: &[String]) -> CorsLayer {
    let parsed: Vec<HeaderValue> = origins
        .iter()
        .filter_map(|o| HeaderValue::from_str(o).ok())
        .collect();
    if parsed.is_empty() {
        return CorsLayer::new();
    }
    CorsLayer::new()
        .allow_origin(parsed)
        .allow_credentials(true)
        .allow_methods(AllowMethods::mirror_request())
        .allow_headers(AllowHeaders::mirror_request())
        .max_age(std::time::Duration::from_secs(600))
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("install ctrl_c handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    info!("shutdown signal received");
}
