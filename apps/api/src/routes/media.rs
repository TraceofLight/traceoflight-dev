use axum::{
    body::Bytes,
    extract::State,
    http::HeaderMap,
    response::Json,
};
use serde::Serialize;
use utoipa::ToSchema;

use crate::{
    AppState,
    error::{AppError, ErrorDetail},
    media::{
        MediaCreate, MediaRead, MediaUploadRequest, MediaUploadResponse, build_object_key,
        presigned_put_url, proxy_upload, register_media,
    },
};

#[utoipa::path(
    post,
    path = "/media/upload-url",
    tag = "media",
    operation_id = "create_upload_url",
    summary = "Create upload URL",
    description = "Issue a presigned PUT URL for object storage. The browser uploads bytes directly to that URL, then calls `POST /media` to persist metadata.",
    request_body = MediaUploadRequest,
    responses(
        (status = 200, description = "Upload URL issued", body = MediaUploadResponse),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
)]
pub async fn create_upload_url_handler(
    State(state): State<AppState>,
    Json(payload): Json<MediaUploadRequest>,
) -> Result<Json<MediaUploadResponse>, AppError> {
    let object_key = build_object_key(payload.kind, &payload.filename);
    let upload_url = presigned_put_url(&state.minio, &object_key, &payload.mime_type)?;
    Ok(Json(MediaUploadResponse {
        object_key,
        bucket: state.minio.bucket.clone(),
        upload_url,
        expires_in_seconds: state.minio.presigned_expire_seconds,
    }))
}

#[utoipa::path(
    post,
    path = "/media",
    tag = "media",
    operation_id = "register_media",
    summary = "Register uploaded media",
    description = "Persist metadata for a media object that has already been uploaded to storage.",
    request_body = MediaCreate,
    responses(
        (status = 200, description = "Media metadata registered", body = MediaRead),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
)]
pub async fn register_media_handler(
    State(state): State<AppState>,
    Json(payload): Json<MediaCreate>,
) -> Result<Json<MediaRead>, AppError> {
    let media = register_media(&state.pool, payload, &state.minio.bucket).await?;
    Ok(Json(media))
}

#[derive(Debug, Serialize, ToSchema)]
pub struct UploadProxyAck {
    ok: bool,
}

#[utoipa::path(
    post,
    path = "/media/upload-proxy",
    tag = "media",
    operation_id = "upload_media_proxy",
    summary = "Proxy upload to object storage",
    description = "Forward the raw request body to the URL given in `x-upload-url`. The optional `x-upload-content-type` header overrides Content-Type forwarded to storage. Used as a CORS-blocked browser fallback.",
    request_body(content = String, content_type = "application/octet-stream"),
    responses(
        (status = 200, description = "Body uploaded", body = UploadProxyAck),
        (status = 400, description = "Missing header/body or unsupported protocol", body = ErrorDetail),
        (status = 502, description = "Object storage rejected the upload", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
)]
pub async fn upload_media_proxy_handler(
    headers: HeaderMap,
    body: Bytes,
) -> Result<Json<UploadProxyAck>, AppError> {
    let upload_url = headers
        .get("x-upload-url")
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| AppError::BadRequest("x-upload-url header is required".into()))?;
    if body.is_empty() {
        return Err(AppError::BadRequest("request body is empty".into()));
    }
    let content_type = headers
        .get("x-upload-content-type")
        .or_else(|| headers.get("content-type"))
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("application/octet-stream");

    proxy_upload(upload_url, content_type, body).await?;
    Ok(Json(UploadProxyAck { ok: true }))
}
