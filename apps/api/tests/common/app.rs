use std::sync::Arc;

use axum::Router;
use sqlx::PgPool;
use uuid::Uuid;

use traceoflight_api::{
    AdminAuthContext, AppState, AuthContext, IndexNowClient, RefreshStore, SeriesProjector,
    Settings, build_router,
};

/// A test-scoped axum app. Holds references to the per-test isolation knobs
/// (redis prefix, MinIO bucket name) so tests can assert on them or inject
/// into MinIO bucket-creation helpers later.
pub struct TestApp {
    pub router: Router,
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

    // Apply migrations via raw SQL by iterating sqlx::migrate!()'s baked-in
    // Migrator. We don't call Migrator::run / Migrator::run_direct because that
    // path is broken in sqlx-core 0.8.6's testing setup (`dirty_version`'s
    // SELECT on `_sqlx_migrations` fails 42P01 even though
    // `ensure_migrations_table` returned Ok — repro both via #[sqlx::test
    // (migrations = ...)] and direct sqlx::migrate!().run(&pool)). Tests don't
    // need migration tracking — each `#[sqlx::test(migrations = false)]` gets a
    // fresh DB anyway — so we just pour each migration's raw SQL through.
    //
    // The migrations are pg_dump output containing
    //     SELECT pg_catalog.set_config('search_path', '', false);
    // which sets search_path to empty for the connection session. After the
    // dump finishes, subsequent unqualified queries (`FROM posts`) and enum
    // binds (`post_status`) fail with "does not exist". Strip that line.
    let migrator = sqlx::migrate!("./migrations");
    for migration in migrator.iter() {
        if migration.migration_type.is_down_migration() {
            continue;
        }
        let sql = migration.sql.replace(
            "SELECT pg_catalog.set_config('search_path', '', false);",
            "-- (test-infra) skipped pg_dump search_path reset",
        );
        sqlx::raw_sql(&sql)
            .execute(&pool)
            .await
            .unwrap_or_else(|err| panic!("apply migration {}: {err}", migration.version));
    }

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
        pool: pool.clone(),
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
        pool,
        redis_prefix,
        s3_bucket,
        api_prefix: settings.api_prefix,
        internal_api_secret: settings.internal_api_secret,
    }
}
