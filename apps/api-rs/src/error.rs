use axum::{
    http::StatusCode,
    response::{IntoResponse, Json, Response},
};
use serde::Serialize;
use serde_json::json;
use thiserror::Error;
use tracing::error;
use utoipa::ToSchema;

/// Single error body component reused by every non-2xx response in the
/// OpenAPI spec. Wire shape: `{"detail": "..."}`.
#[derive(Debug, Serialize, ToSchema)]
pub struct ErrorDetail {
    pub detail: String,
}

/// Application error type. Variants map to HTTP status codes; the response
/// body is rendered as [`ErrorDetail`] (`{"detail": "..."}`).
#[derive(Debug, Error)]
pub enum AppError {
    #[error("not found")]
    NotFound(&'static str),

    #[allow(dead_code)] // wired up by upcoming endpoints
    #[error("bad request: {0}")]
    BadRequest(String),

    #[error("unauthorized")]
    Unauthorized,

    #[error("conflict: {0}")]
    Conflict(String),

    #[error("upstream failure: {0}")]
    BadGateway(String),

    #[error(transparent)]
    Database(#[from] sqlx::Error),

    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, detail) = match &self {
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, (*msg).to_string()),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized".into()),
            AppError::Conflict(msg) => (StatusCode::CONFLICT, msg.clone()),
            AppError::BadGateway(msg) => (StatusCode::BAD_GATEWAY, msg.clone()),
            AppError::Database(err) => {
                error!(error = %err, "database error");
                (StatusCode::INTERNAL_SERVER_ERROR, "internal error".into())
            }
            AppError::Internal(err) => {
                error!(error = %err, "internal error");
                (StatusCode::INTERNAL_SERVER_ERROR, "internal error".into())
            }
        };
        (status, Json(json!({ "detail": detail }))).into_response()
    }
}
