mod auth;
mod config;
mod error;
mod observability;
mod posts;

use std::net::SocketAddr;

use axum::{
    extract::{FromRef, Path, State},
    http::{HeaderValue, StatusCode},
    response::Json,
    Router,
};
use axum_extra::extract::Query;
use serde::Deserialize;
use sqlx::{postgres::PgPoolOptions, PgPool};
use tower_http::{
    cors::{AllowHeaders, AllowMethods, CorsLayer},
    request_id::{PropagateRequestIdLayer, SetRequestIdLayer},
};
use tracing::{error, info};
use utoipa::{IntoParams, OpenApi};
use utoipa_axum::{router::OpenApiRouter, routes};
use utoipa_swagger_ui::SwaggerUi;

use crate::{
    auth::{AuthContext, OptionalInternalSecret, RequireInternalSecret},
    config::Settings,
    error::{AppError, ErrorDetail},
    observability::{http_trace_layer, init_tracing, UuidRequestId, REQUEST_ID_HEADER},
    posts::{
        delete_post_by_slug, get_post_by_slug, list_posts, ListPostsParams, PostContentKind,
        PostFilter, PostLocale, PostRead, PostStatus, PostVisibility, TagMatch,
    },
};

#[derive(Clone)]
pub struct AppState {
    pool: PgPool,
    auth: AuthContext,
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
        description = "Parallel Rust/Axum implementation of the traceoflight web-service API. Mirrors the FastAPI contract for migration testing.",
    ),
    tags(
        (name = "posts", description = "Public post detail and list endpoints."),
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
    };

    let api_routes: OpenApiRouter<AppState> = OpenApiRouter::new()
        .routes(routes!(list_posts_handler))
        .routes(routes!(get_post_by_slug_handler, delete_post_by_slug_handler));

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
struct DeletePostQuery {
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

/// Mirror of FastAPI's `_public_visibility_filters`: when the caller is
/// trusted (internal-secret), pass through whatever they asked for (incl.
/// None = no filter). Anonymous callers are forced to published+public.
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

/// Mirror FastAPI's CORSMiddleware shape: explicit origin list + credentials +
/// mirror the requested method/headers (Pydantic uses `["*"]` which combined
/// with `allow_credentials=True` is non-spec; tower-http rejects `Any` in that
/// combination, so `mirror_request` is the closest exact equivalent).
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
