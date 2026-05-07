use axum::{
    body::{Body, Bytes},
    http::{Request, Response, StatusCode},
};
use http_body_util::BodyExt;
use serde::Serialize;
use serde_json::Value;
use tower::ServiceExt;

use super::app::TestApp;

impl TestApp {
    pub fn url(&self, path: &str) -> String {
        format!("{}{}", self.api_prefix, path)
    }

    /// Send a request through the router via `oneshot` (no listener).
    pub async fn send(&self, req: Request<Body>) -> Response<Body> {
        self.router
            .clone()
            .oneshot(req)
            .await
            .expect("oneshot")
    }

    pub async fn get(&self, path: &str) -> Response<Body> {
        let req = Request::builder()
            .uri(self.url(path))
            .method("GET")
            .body(Body::empty())
            .expect("build request");
        self.send(req).await
    }

    pub async fn post_json(&self, path: &str, body: impl Serialize) -> Response<Body> {
        let json = serde_json::to_vec(&body).expect("serialize json");
        let req = Request::builder()
            .uri(self.url(path))
            .method("POST")
            .header("content-type", "application/json")
            .body(Body::from(json))
            .expect("build request");
        self.send(req).await
    }

    pub async fn post_json_with_internal_secret(
        &self,
        path: &str,
        body: impl Serialize,
    ) -> Response<Body> {
        let json = serde_json::to_vec(&body).expect("serialize json");
        let req = Request::builder()
            .uri(self.url(path))
            .method("POST")
            .header("content-type", "application/json")
            .header(
                traceoflight_api::auth::INTERNAL_SECRET_HEADER,
                &self.internal_api_secret,
            )
            .body(Body::from(json))
            .expect("build request");
        self.send(req).await
    }

    pub async fn delete(&self, path: &str) -> Response<Body> {
        let req = Request::builder()
            .uri(self.url(path))
            .method("DELETE")
            .body(Body::empty())
            .expect("build request");
        self.send(req).await
    }
}

/// Drain a response body into raw bytes.
pub async fn body_bytes(res: Response<Body>) -> (StatusCode, Bytes) {
    let status = res.status();
    let bytes = res
        .into_body()
        .collect()
        .await
        .expect("collect body")
        .to_bytes();
    (status, bytes)
}

/// Drain a response body and parse as JSON.
pub async fn body_json(res: Response<Body>) -> (StatusCode, Value) {
    let (status, bytes) = body_bytes(res).await;
    let value: Value =
        serde_json::from_slice(&bytes).unwrap_or_else(|err| panic!("body not JSON: {err}; raw={:?}", bytes));
    (status, value)
}
