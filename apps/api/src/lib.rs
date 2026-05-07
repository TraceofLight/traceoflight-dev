//! TraceofLight web-service API. Public read endpoints serve published+public
//! content; trusted callers using the internal-secret header can request
//! drafts and write operations.

pub mod admin_auth;
pub mod auth;
pub mod cleanup;
pub mod comments;
pub mod config;
pub mod error;
pub mod imports;
pub mod indexnow;
pub mod list_params;
pub mod media;
pub mod media_refs;
pub mod observability;
pub mod pdf_assets;
pub mod posts;
pub mod projects;
pub mod routes;
pub mod serializers;
pub mod series;
pub mod series_projection;
pub mod site_profile;
pub mod tags;

pub use crate::admin_auth::{AdminAuthContext, RefreshStore};
pub use crate::auth::AuthContext;
pub use crate::cleanup::{CleanupSettings, spawn_draft_cleanup, spawn_slug_redirect_cleanup};
pub use crate::config::Settings;
pub use crate::indexnow::IndexNowClient;
pub use crate::observability::init_tracing;
pub use crate::series_projection::SeriesProjector;

use std::sync::Arc;

use axum::{
    Router,
    extract::FromRef,
    http::HeaderValue,
};
use sqlx::PgPool;
use tower_http::{
    cors::{AllowHeaders, AllowMethods, CorsLayer},
    request_id::{PropagateRequestIdLayer, SetRequestIdLayer},
};
use tracing::info;
use utoipa::OpenApi;
use utoipa_axum::{router::OpenApiRouter, routes};
use utoipa_swagger_ui::SwaggerUi;

use crate::{
    config::MinioSettings,
    observability::{REQUEST_ID_HEADER, UuidRequestId, http_trace_layer},
};

// Bring all handlers (and their utoipa attribute macros) into the crate root
// so the `routes!()` macro below can resolve handler names as bare
// identifiers.
use crate::routes::{
    admin::*, backup::*, comments::*, infra::*, media::*, pdf::*, posts::*, projects::*,
    series::*, site_profile::*, tags::*,
};

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub auth: AuthContext,
    pub reading_words_per_minute: u32,
    pub minio: Arc<MinioSettings>,
    pub admin: AdminAuthContext,
    pub indexnow: IndexNowClient,
    pub series_projector: SeriesProjector,
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

pub async fn shutdown_signal() {
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

pub fn build_router(state: AppState, api_prefix: &str, cors_origins: &[String]) -> Router {
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
        .nest(api_prefix, api_routes)
        .split_for_parts();

    let cors = build_cors_layer(cors_origins);

    Router::new()
        .merge(axum_router)
        .merge(SwaggerUi::new("/docs").url("/api-docs/openapi.json", openapi))
        .with_state(state)
        .layer(PropagateRequestIdLayer::new(REQUEST_ID_HEADER.clone()))
        .layer(http_trace_layer())
        .layer(SetRequestIdLayer::new(
            REQUEST_ID_HEADER.clone(),
            UuidRequestId,
        ))
        .layer(cors)
}
