//! Application error type. Variants map to HTTP status codes; the response
//! body is rendered as `{"detail": "..."}` for every non-2xx response.

use axum::{
    http::{HeaderValue, StatusCode, header},
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

    #[error("bad request: {0}")]
    BadRequest(String),

    #[error("unauthorized")]
    Unauthorized,

    #[error("unauthorized: {0}")]
    UnauthorizedDetail(String),

    #[error("forbidden: {0}")]
    Forbidden(String),

    #[error("conflict: {0}")]
    Conflict(String),

    #[error("too many requests, retry after {retry_after}s")]
    Throttled { retry_after: u64, detail: String },

    #[error("upstream failure: {0}")]
    BadGateway(String),

    #[error(transparent)]
    Database(#[from] sqlx::Error),

    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        if let AppError::Throttled {
            retry_after,
            detail,
        } = &self
        {
            let mut response = (
                StatusCode::TOO_MANY_REQUESTS,
                Json(json!({ "detail": detail })),
            )
                .into_response();
            if let Ok(value) = HeaderValue::from_str(&retry_after.to_string()) {
                response.headers_mut().insert(header::RETRY_AFTER, value);
            }
            return response;
        }

        let (status, detail) = match &self {
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, (*msg).to_string()),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized".into()),
            AppError::UnauthorizedDetail(msg) => (StatusCode::UNAUTHORIZED, msg.clone()),
            AppError::Forbidden(msg) => (StatusCode::FORBIDDEN, msg.clone()),
            AppError::Conflict(msg) => (StatusCode::CONFLICT, msg.clone()),
            AppError::Throttled { .. } => unreachable!("handled above"),
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
