mod auth;
mod config;
mod error;
mod observability;
mod posts;
mod projects;
mod series;
mod tags;

use std::net::SocketAddr;

use axum::{
    extract::{FromRef, Path, State},
    http::{HeaderValue, StatusCode},
    response::Json,
    Router,
};
use axum_extra::extract::Query;
use serde::{Deserialize, Serialize};
use sqlx::{postgres::PgPoolOptions, PgPool};
use tower_http::{
    cors::{AllowHeaders, AllowMethods, CorsLayer},
    request_id::{PropagateRequestIdLayer, SetRequestIdLayer},
};
use tracing::{error, info};
use utoipa::{IntoParams, OpenApi, ToSchema};
use utoipa_axum::{router::OpenApiRouter, routes};
use utoipa_swagger_ui::SwaggerUi;

use crate::{
    auth::{AuthContext, OptionalInternalSecret, RequireInternalSecret},
    config::Settings,
    error::{AppError, ErrorDetail},
    observability::{http_trace_layer, init_tracing, UuidRequestId, REQUEST_ID_HEADER},
    posts::{
        create_post, delete_post_by_slug, get_post_by_slug, list_post_summaries, list_posts,
        resolve_post_redirect, update_post_by_slug, ListPostsParams, ListSummariesParams,
        PostContentKind, PostCreate, PostFilter, PostLocale, PostRead, PostSortMode, PostStatus,
        PostSummaryListRead, PostVisibility, TagMatch, TagRead,
    },
    projects::{
        get_project_by_slug, list_projects, replace_project_order, resolve_project_redirect,
        ListProjectsParams, ProjectRead, ProjectsOrderReplace,
    },
    series::{
        create_series, delete_series_by_slug, get_series_by_slug, list_series,
        replace_series_order, replace_series_posts_by_slug, resolve_series_redirect,
        update_series_by_slug, ListSeriesParams, SeriesDetailRead, SeriesOrderReplace,
        SeriesPostsReplace, SeriesRead, SeriesUpsert,
    },
    tags::{create_tag, delete_tag, list_tags, update_tag, TagCreate, TagUpdate},
};

#[derive(Clone)]
pub struct AppState {
    pool: PgPool,
    auth: AuthContext,
    reading_words_per_minute: u32,
}

impl FromRef<AppState> for AuthContext {
    fn from_ref(state: &AppState) -> Self {
        state.auth.clone()
    }
}

#[derive(OpenApi)]
#[openapi(
    info(
        title = "traceoflight-api-rs",
        version = "0.0.1",
        description = "TraceofLight web-service API. Public read endpoints serve published+public content; trusted callers using the internal-secret header can request drafts and write operations.",
    ),
    tags(
        (name = "posts", description = "Public post detail and list endpoints."),
        (name = "projects", description = "Project content surface (subset of posts with `content_kind=project`)."),
        (name = "series", description = "Series collection and member-post linkage management."),
        (name = "tags", description = "Tag taxonomy management (admin-only)."),
        (name = "infra", description = "Liveness and readiness probes consumed by orchestrators and health monitors."),
    ),
)]
struct ApiDoc;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::from_filename(".env.api-rs");

    let settings = Settings::from_env()?;
    init_tracing(settings.log_format);

    let pool = PgPoolOptions::new()
        .max_connections(settings.database_max_connections)
        .connect_lazy(&settings.database_url)?;

    let state = AppState {
        pool,
        auth: AuthContext::new(settings.internal_api_secret.clone()),
        reading_words_per_minute: settings.reading_words_per_minute,
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
        .routes(routes!(replace_series_posts_handler));

    let infra_routes: OpenApiRouter<AppState> = OpenApiRouter::new()
        .routes(routes!(healthz))
        .routes(routes!(readyz));

    let (axum_router, openapi) = OpenApiRouter::with_openapi(ApiDoc::openapi())
        .merge(infra_routes)
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

    let addr = SocketAddr::from(([0, 0, 0, 0], settings.api_rs_port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    info!(
        port = settings.api_rs_port,
        api_prefix = %settings.api_prefix,
        "api-rs listening on http://{addr}",
    );

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

#[utoipa::path(
    get,
    path = "/healthz",
    tag = "infra",
    operation_id = "healthz",
    summary = "Liveness probe",
    description = "Always returns 200 when the process can serve HTTP. Does not check downstream dependencies.",
    responses((status = 200, description = "Process is up", body = String)),
)]
async fn healthz() -> &'static str {
    "ok"
}

#[utoipa::path(
    get,
    path = "/readyz",
    tag = "infra",
    operation_id = "readyz",
    summary = "Readiness probe",
    description = "Returns 200 only after a successful Postgres `SELECT 1`. 503 while the pool cannot reach the database.",
    responses(
        (status = 200, description = "Database reachable", body = String),
        (status = 503, description = "Database unreachable"),
    ),
)]
async fn readyz(State(state): State<AppState>) -> Result<&'static str, StatusCode> {
    sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&state.pool)
        .await
        .map(|_| "ok")
        .map_err(|err| {
            error!(error = %err, "readyz db ping failed");
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
    Ok(Json(post))
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
