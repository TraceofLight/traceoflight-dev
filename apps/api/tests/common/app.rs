use std::sync::Arc;

use axum::Router;
use sea_orm_migration::MigratorTrait;
use sqlx::PgPool;
use uuid::Uuid;

use traceoflight_api::{
    AdminAuthContext, AppState, AuthContext, IndexNowClient, RefreshStore, SeriesProjector,
    Settings, build_router, db::Db,
};

/// A test-scoped axum app. Holds references to the per-test isolation knobs
/// (redis prefix, MinIO bucket name) so tests can assert on them or inject
/// into MinIO bucket-creation helpers later.
pub struct TestApp {
    pub router: Router,
    pub db: Db,
    pub pool: PgPool,
    pub redis_prefix: String,
    pub s3_bucket: String,
    pub api_prefix: String,
    pub internal_api_secret: String,
}

/// Build a TestApp from a fresh `PgPool` (provided by `#[sqlx::test]`).
///
/// Reads other settings from `.env.test` if present, otherwise from process
/// env. Each call generates fresh UUIDs for redis prefix and bucket so that
/// parallel tests cannot interfere with each other.
pub async fn spawn_test_app(pool: PgPool) -> TestApp {
    // Load .env.test (no-op if file is missing — env may be set by CI directly)
    let _ = dotenvy::from_filename(".env.test");
    let db = traceoflight_api::db::from_sqlx_pool(&pool);

    traceoflight_api::migration::Migrator::up(&db, None)
        .await
        .expect("apply SeaORM migrations");

    let mut settings = Settings::from_env().expect("Settings::from_env (test)");
    let redis_prefix = format!("test:{}:", Uuid::new_v4());
    let s3_bucket = format!("test-{}", Uuid::new_v4());
    settings.redis_key_prefix = redis_prefix.clone();
    settings.minio.bucket = s3_bucket.clone();

    let refresh_store = if let Some(url) = settings.redis_url.as_deref() {
        let client = redis::Client::open(url).expect("redis client open (test)");
        let conn = client
            .get_connection_manager()
            .await
            .expect("redis connect (test)");
        Some(RefreshStore::new(conn, settings.redis_key_prefix.clone()))
    } else {
        None
    };

    let admin_ctx = AdminAuthContext::new(settings.admin.clone(), refresh_store);
    let indexnow = IndexNowClient::new(settings.indexnow.clone());
    let series_projector = SeriesProjector::new();
    // Test-vs-prod divergence (intentional):
    // - tracing is NOT initialized; production calls init_tracing(...) at boot
    // - SeriesProjector::spawn_loop is NOT called; tests that exercise series
    //   ordering invoke projection explicitly instead
    // - spawn_draft_cleanup and spawn_slug_redirect_cleanup are NOT spawned;
    //   tests that need cleanup behavior should drive it directly.
    // - translation_queue is None and the worker is NOT spawned; tests that
    //   need to verify translation enqueue should construct their own queue
    //   against a unique redis_key_prefix (like the auth tests do).
    // If a future test passes for the wrong reason, check this list first.

    let state = AppState {
        db: db.clone(),
        auth: AuthContext::new(settings.internal_api_secret.clone()),
        reading_words_per_minute: settings.reading_words_per_minute,
        minio: Arc::new(settings.minio.clone()),
        admin: admin_ctx,
        indexnow,
        series_projector,
        translation_queue: None,
    };

    let router = build_router(state, &settings.api_prefix, &settings.cors_allow_origins);

    TestApp {
        router,
        db,
        pool,
        redis_prefix,
        s3_bucket,
        api_prefix: settings.api_prefix,
        internal_api_secret: settings.internal_api_secret,
    }
}
