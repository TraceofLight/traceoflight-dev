mod config;
mod error;
mod observability;
mod posts;

use std::net::SocketAddr;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    Router,
};
use serde::Deserialize;
use sqlx::{postgres::PgPoolOptions, PgPool};
use tower_http::request_id::{PropagateRequestIdLayer, SetRequestIdLayer};
use tracing::{error, info};
use utoipa::{IntoParams, OpenApi};
use utoipa_axum::{router::OpenApiRouter, routes};
use utoipa_swagger_ui::SwaggerUi;

use crate::{
    config::Settings,
    error::{AppError, ErrorDetail},
    observability::{http_trace_layer, init_tracing, UuidRequestId, REQUEST_ID_HEADER},
    posts::{
        get_post_by_slug, PostContentKind, PostFilter, PostLocale, PostRead, PostStatus,
        PostVisibility,
    },
};

#[derive(Clone)]
pub struct AppState {
    pool: PgPool,
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

    let state = AppState { pool };

    let api_routes: OpenApiRouter<AppState> =
        OpenApiRouter::new().routes(routes!(get_post_by_slug_handler));

    let infra_routes: OpenApiRouter<AppState> = OpenApiRouter::new()
        .routes(routes!(healthz))
        .routes(routes!(readyz));

    let (axum_router, openapi) = OpenApiRouter::with_openapi(ApiDoc::openapi())
        .merge(infra_routes)
        .nest(&settings.api_prefix, api_routes)
        .split_for_parts();

    let app = Router::new()
        .merge(axum_router)
        .merge(SwaggerUi::new("/docs").url("/api-docs/openapi.json", openapi))
        .with_state(state)
        .layer(PropagateRequestIdLayer::new(REQUEST_ID_HEADER.clone()))
        .layer(http_trace_layer())
        .layer(SetRequestIdLayer::new(
            REQUEST_ID_HEADER.clone(),
            UuidRequestId,
        ));

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
    Path(slug): Path<String>,
    Query(params): Query<PostQuery>,
) -> Result<Json<PostRead>, AppError> {
    let filter = PostFilter {
        status: Some(params.status.unwrap_or(PostStatus::Published)),
        visibility: Some(params.visibility.unwrap_or(PostVisibility::Public)),
        content_kind: params.content_kind,
        locale: params.locale,
    };

    let post = get_post_by_slug(&state.pool, &slug, filter)
        .await?
        .ok_or(AppError::NotFound("post not found"))?;
    Ok(Json(post))
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
