use axum::{extract::State, http::StatusCode};
use tracing::error;

use crate::AppState;

#[utoipa::path(
    get,
    path = "/health",
    tag = "infra",
    operation_id = "health",
    summary = "Liveness probe",
    description = "Always returns 200 when the process can serve HTTP. Does not check downstream dependencies.",
    responses((status = 200, description = "Process is up", body = String)),
)]
pub async fn health() -> &'static str {
    "ok"
}

#[utoipa::path(
    get,
    path = "/ready",
    tag = "infra",
    operation_id = "ready",
    summary = "Readiness probe",
    description = "Returns 200 only after a successful Postgres `SELECT 1`. 503 while the pool cannot reach the database.",
    responses(
        (status = 200, description = "Database reachable", body = String),
        (status = 503, description = "Database unreachable"),
    ),
)]
pub async fn ready(State(state): State<AppState>) -> Result<&'static str, StatusCode> {
    sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&state.pool)
        .await
        .map(|_| "ok")
        .map_err(|err| {
            error!(error = %err, "ready db ping failed");
            StatusCode::SERVICE_UNAVAILABLE
        })
}
