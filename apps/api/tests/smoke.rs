mod common;

use sqlx::PgPool;

use common::{
    app::spawn_test_app,
    http::body_bytes,
};

// `migrations = false` disables sqlx::test's auto-detection of ./migrations
// (otherwise it would call its broken Migrator::run_direct path). spawn_test_app
// applies migrations explicitly via sqlx::migrate!() — see app.rs for rationale.
#[sqlx::test(migrations = false)]
async fn health_endpoint_returns_ok(pool: PgPool) {
    let app = spawn_test_app(pool).await;
    let res = app.get("/health").await;
    let (status, body) = body_bytes(res).await;
    assert_eq!(status, 200);
    assert_eq!(&body[..], b"ok");
}
