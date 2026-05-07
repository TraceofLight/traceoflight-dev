use std::net::SocketAddr;
use std::sync::Arc;

use sqlx::postgres::PgPoolOptions;
use tracing::info;

use traceoflight_api::{
    AdminAuthContext, AppState, AuthContext, CleanupSettings, IndexNowClient, RefreshStore,
    SeriesProjector, Settings, build_router, init_tracing, spawn_draft_cleanup,
    spawn_slug_redirect_cleanup,
};

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
        Some(RefreshStore::new(conn, settings.redis_key_prefix.clone()))
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

    let app = build_router(state, &settings.api_prefix, &settings.cors_allow_origins);

    let addr = SocketAddr::from(([0, 0, 0, 0], settings.api_port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    info!(
        port = settings.api_port,
        api_prefix = %settings.api_prefix,
        "api listening on http://{addr}",
    );

    axum::serve(listener, app)
        .with_graceful_shutdown(traceoflight_api::shutdown_signal())
        .await?;

    Ok(())
}
