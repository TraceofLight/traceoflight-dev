//! Internal-secret header check for trusted callers.
//!
//! `OptionalInternalSecret` is non-rejecting and is used on read endpoints
//! that change behaviour for trusted callers. `RequireInternalSecret` rejects
//! with 401 and is used on write/admin endpoints.

use std::sync::Arc;

use axum::{
    extract::{FromRef, FromRequestParts},
    http::request::Parts,
};

use crate::error::AppError;

pub const INTERNAL_SECRET_HEADER: &str = "x-internal-api-secret";

/// Application-wide auth context. Cloned cheaply (Arc) into AppState.
#[derive(Clone)]
pub struct AuthContext {
    pub internal_api_secret: Arc<String>,
}

impl AuthContext {
    pub fn new(secret: String) -> Self {
        Self {
            internal_api_secret: Arc::new(secret),
        }
    }

    /// Constant-time check of the supplied header value against the configured
    /// secret. Empty configured secret means "no internal callers allowed";
    /// empty header is always rejected.
    pub fn is_trusted(&self, header_value: Option<&str>) -> bool {
        let configured = self.internal_api_secret.trim();
        if configured.is_empty() {
            return false;
        }
        let provided = header_value.unwrap_or("").trim();
        if provided.is_empty() {
            return false;
        }
        constant_time_eq(provided.as_bytes(), configured.as_bytes())
    }
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Non-rejecting extractor that exposes whether the caller carries a valid
/// internal-secret header. Use this on read endpoints that change behaviour
/// for trusted callers without rejecting anonymous ones.
#[derive(Debug, Clone, Copy)]
pub struct OptionalInternalSecret(pub bool);

impl<S> FromRequestParts<S> for OptionalInternalSecret
where
    AuthContext: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let auth = AuthContext::from_ref(state);
        let header = parts
            .headers
            .get(INTERNAL_SECRET_HEADER)
            .and_then(|v| v.to_str().ok());
        Ok(Self(auth.is_trusted(header)))
    }
}

/// Rejecting extractor: produces 401 Unauthorized when the internal-secret
/// header is missing or invalid. Apply on write/admin endpoints that must
/// only accept trusted callers.
#[derive(Debug, Clone, Copy)]
pub struct RequireInternalSecret;

impl<S> FromRequestParts<S> for RequireInternalSecret
where
    AuthContext: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let OptionalInternalSecret(trusted) =
            OptionalInternalSecret::from_request_parts(parts, state)
                .await
                .map_err(|_| AppError::Unauthorized)?;
        if !trusted {
            return Err(AppError::Unauthorized);
        }
        Ok(Self)
    }
}
