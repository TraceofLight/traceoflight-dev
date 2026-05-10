//! Tracing initialization and request-id propagation.

use axum::http::{HeaderName, HeaderValue, Request};
use tower_http::{
    request_id::{MakeRequestId, RequestId},
    trace::{
        DefaultOnBodyChunk, DefaultOnEos, DefaultOnFailure, DefaultOnRequest, DefaultOnResponse,
        TraceLayer,
    },
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
    DefaultOnRequest,
    DefaultOnResponse,
    DefaultOnBodyChunk,
    DefaultOnEos,
    DefaultOnFailure,
> {
    TraceLayer::new_for_http()
        .make_span_with(|req: &Request<axum::body::Body>| {
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
        .on_request(DefaultOnRequest::new().level(Level::INFO))
        .on_response(DefaultOnResponse::new().level(Level::INFO))
        .on_failure(DefaultOnFailure::new().level(Level::ERROR))
}

#[cfg(test)]
mod tests {
    use std::{
        convert::Infallible,
        io,
        sync::{Arc, Mutex},
    };

    use axum::{
        body::Body,
        http::{Request, Response},
    };
    use tower::{ServiceBuilder, ServiceExt, service_fn};
    use tracing::Level;
    use tracing_subscriber::fmt::MakeWriter;

    use super::http_trace_layer;

    #[derive(Clone, Default)]
    struct SharedLogBuffer(Arc<Mutex<Vec<u8>>>);

    struct SharedLogWriter(Arc<Mutex<Vec<u8>>>);

    impl SharedLogBuffer {
        fn output(&self) -> String {
            let bytes = self.0.lock().expect("log buffer lock").clone();
            String::from_utf8(bytes).expect("utf8 log output")
        }
    }

    impl<'a> MakeWriter<'a> for SharedLogBuffer {
        type Writer = SharedLogWriter;

        fn make_writer(&'a self) -> Self::Writer {
            SharedLogWriter(self.0.clone())
        }
    }

    impl io::Write for SharedLogWriter {
        fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
            self.0
                .lock()
                .expect("log buffer lock")
                .extend_from_slice(buf);
            Ok(buf.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    #[tokio::test]
    async fn http_trace_layer_emits_request_and_response_at_info() {
        let logs = SharedLogBuffer::default();
        let subscriber = tracing_subscriber::fmt()
            .with_ansi(false)
            .with_max_level(Level::INFO)
            .with_writer(logs.clone())
            .finish();
        let dispatch = tracing::Dispatch::new(subscriber);
        let _guard = tracing::dispatcher::set_default(&dispatch);

        let service = ServiceBuilder::new()
            .layer(http_trace_layer())
            .service(service_fn(|_req: Request<Body>| async {
                Ok::<_, Infallible>(Response::new(Body::empty()))
            }));
        let req = Request::builder()
            .method("GET")
            .uri("/health")
            .body(Body::empty())
            .expect("request");

        service.oneshot(req).await.expect("response");

        let output = logs.output();
        assert!(
            output.contains("started processing request"),
            "missing info request log: {output}"
        );
        assert!(
            output.contains("finished processing request"),
            "missing info response log: {output}"
        );
        assert!(
            output.contains("method=GET"),
            "missing method field: {output}"
        );
        assert!(
            output.contains("uri=/health"),
            "missing uri field: {output}"
        );
        assert!(
            output.contains("status=200"),
            "missing response status field: {output}"
        );
    }
}
