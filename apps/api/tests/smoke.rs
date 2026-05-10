mod common;

use sqlx::PgPool;

use common::{app::spawn_test_app, http::body_bytes};

// `migrations = false` leaves schema setup to spawn_test_app's SeaORM migrator.
#[sqlx::test(migrations = false)]
async fn health_endpoint_returns_ok(pool: PgPool) {
    let app = spawn_test_app(pool).await;
    let res = app.get("/health").await;
    let (status, body) = body_bytes(res).await;
    assert_eq!(status, 200);
    assert_eq!(&body[..], b"ok");
}
