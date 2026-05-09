use std::net::SocketAddr;
use std::sync::Arc;

use sqlx::postgres::PgPoolOptions;
use tracing::{info, warn};

use traceoflight_api::{
    AdminAuthContext, AppState, AuthContext, CleanupSettings, IndexNowClient, RefreshStore,
    SeriesProjector, Settings, build_router, init_tracing, spawn_draft_cleanup,
    spawn_slug_redirect_cleanup,
    translation::{GoogleTranslateProvider, TranslationQueue, worker as translation_worker},
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

    // Two ConnectionManagers from the same client: a shared one for
    // non-blocking commands and a dedicated one for blocking commands
    // (BLPOP). A multiplexed ConnectionManager serializes commands behind
    // any in-flight blocking call, so sharing would stall every co-tenant
    // op for the duration of the block.
    let (redis_conn, worker_blocking_conn) = if let Some(url) = settings.redis_url.as_deref() {
        let client = redis::Client::open(url)
            .map_err(|err| anyhow::anyhow!("redis client init failed: {err}"))?;
        let shared = client
            .get_connection_manager()
            .await
            .map_err(|err| anyhow::anyhow!("redis connect failed: {err}"))?;
        let blocking = client
            .get_connection_manager()
            .await
            .map_err(|err| anyhow::anyhow!("redis connect (worker) failed: {err}"))?;
        (Some(shared), Some(blocking))
    } else {
        (None, None)
    };

    let refresh_store = redis_conn
        .clone()
        .map(|conn| RefreshStore::new(conn, settings.redis_key_prefix.clone()));
    let admin_ctx = AdminAuthContext::new(settings.admin.clone(), refresh_store);

    let translation_queue = match (redis_conn.clone(), worker_blocking_conn) {
        (Some(shared), Some(blocking)) => Some(TranslationQueue::new(
            shared,
            blocking,
            &settings.redis_key_prefix,
        )),
        _ => None,
    };

    let indexnow = IndexNowClient::new(settings.indexnow.clone());

    // Spawn the translation worker only when both Redis (for the queue)
    // AND a Google API key are configured. Either missing → skip and
    // log; auto-translation simply doesn't run, ko content still serves.
    // Worker pings IndexNow after each sibling upsert so translated pages
    // get crawled too, not just the ko source.
    if let (Some(queue), true) = (
        translation_queue.clone(),
        settings.translation.is_configured(),
    ) {
        let provider = Arc::new(GoogleTranslateProvider::new(
            settings.translation.google_api_key.clone(),
        ));
        translation_worker::spawn(pool.clone(), queue, provider, indexnow.clone());
    } else if translation_queue.is_some() {
        warn!("translation worker not started: GOOGLE_TRANSLATE_API_KEY missing");
    } else {
        warn!("translation worker not started: REDIS_URL missing");
    }

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
        translation_queue,
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
