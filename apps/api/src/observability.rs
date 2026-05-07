//! Tracing initialization and request-id propagation.

use axum::http::{HeaderName, HeaderValue, Request};
use tower_http::{
    request_id::{MakeRequestId, RequestId},
    trace::TraceLayer,
};
use tracing::Level;
use uuid::Uuid;

use crate::config::LogFormat;

pub fn init_tracing(format: LogFormat) {
    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "info,sqlx=warn,tower_http=info".into());

    match format {
        LogFormat::Pretty => {
            tracing_subscriber::fmt().with_env_filter(env_filter).init();
        }
        LogFormat::Json => {
            tracing_subscriber::fmt()
                .with_env_filter(env_filter)
                .json()
                .with_current_span(true)
                .with_span_list(false)
                .init();
        }
    }
}

pub static REQUEST_ID_HEADER: HeaderName = HeaderName::from_static("x-request-id");

#[derive(Clone, Default)]
pub struct UuidRequestId;

impl MakeRequestId for UuidRequestId {
    fn make_request_id<B>(&mut self, _request: &Request<B>) -> Option<RequestId> {
        let id = Uuid::new_v4().to_string();
        HeaderValue::from_str(&id).ok().map(RequestId::new)
    }
}

/// Tower TraceLayer producing one INFO span per request, including the request
/// id captured from `x-request-id` if present (set by SetRequestIdLayer).
pub fn http_trace_layer() -> TraceLayer<
    tower_http::classify::SharedClassifier<tower_http::classify::ServerErrorsAsFailures>,
    impl Fn(&Request<axum::body::Body>) -> tracing::Span + Clone,
> {
    TraceLayer::new_for_http().make_span_with(|req: &Request<axum::body::Body>| {
        let request_id = req
            .headers()
            .get(&REQUEST_ID_HEADER)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("-");
        tracing::span!(
            Level::INFO,
            "http",
            method = %req.method(),
            uri = %req.uri(),
            request_id = request_id,
        )
    })
}
