use std::time::Duration;

use bytes::Bytes;
use chrono::{DateTime, Utc};
use rusty_s3::{Bucket, Credentials, S3Action, UrlStyle};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::config::MinioSettings;
use crate::error::AppError;
use crate::posts::serialize_dt_us;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, sqlx::Type, ToSchema, PartialEq, Eq)]
#[sqlx(type_name = "asset_kind", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum AssetKind {
    Image,
    Video,
    File,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct MediaUploadRequest {
    pub kind: AssetKind,
    pub filename: String,
    pub mime_type: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct MediaUploadResponse {
    pub object_key: String,
    pub bucket: String,
    pub upload_url: String,
    pub expires_in_seconds: u64,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct MediaCreate {
    pub kind: AssetKind,
    pub original_filename: String,
    pub mime_type: String,
    pub object_key: String,
    #[serde(default)]
    pub size_bytes: i64,
}

#[derive(Debug, Serialize, FromRow, ToSchema)]
pub struct MediaRead {
    pub id: Uuid,
    pub kind: AssetKind,
    pub bucket: String,
    pub object_key: String,
    pub original_filename: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub duration_seconds: Option<i32>,
    pub owner_post_id: Option<Uuid>,
    #[serde(serialize_with = "serialize_dt_us")]
    pub created_at: DateTime<Utc>,
    #[serde(serialize_with = "serialize_dt_us")]
    pub updated_at: DateTime<Utc>,
}

pub fn build_object_key(kind: AssetKind, filename: &str) -> String {
    let kind_str = match kind {
        AssetKind::Image => "image",
        AssetKind::Video => "video",
        AssetKind::File => "file",
    };
    let safe_name: String = filename
        .chars()
        .map(|c| if c.is_whitespace() { '-' } else { c })
        .collect::<String>()
        .to_lowercase();
    format!("{kind_str}/{}-{safe_name}", Uuid::new_v4())
}

pub fn presigned_put_url(
    settings: &MinioSettings,
    object_key: &str,
    _content_type: &str,
) -> Result<String, AppError> {
    let scheme = if settings.secure { "https" } else { "http" };
    let endpoint = format!("{scheme}://{}", settings.endpoint);
    let endpoint_url = url::Url::parse(&endpoint)
        .map_err(|err| AppError::Internal(anyhow::anyhow!("invalid MinIO endpoint: {err}")))?;
    let bucket = Bucket::new(
        endpoint_url,
        UrlStyle::Path,
        settings.bucket.clone(),
        settings.region.clone(),
    )
    .map_err(|err| AppError::Internal(anyhow::anyhow!("bucket init failed: {err}")))?;
    let credentials = Credentials::new(settings.access_key.clone(), settings.secret_key.clone());
    let action = bucket.put_object(Some(&credentials), object_key);
    let signed = action.sign(Duration::from_secs(settings.presigned_expire_seconds));
    Ok(signed.to_string())
}

pub async fn register_media(
    pool: &PgPool,
    payload: MediaCreate,
    bucket: &str,
) -> Result<MediaRead, sqlx::Error> {
    let row = sqlx::query_as::<_, MediaRead>(
        r#"
        INSERT INTO media_assets (
            id, kind, bucket, object_key, original_filename, mime_type, size_bytes
        ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6
        )
        RETURNING id, kind, bucket, object_key, original_filename, mime_type,
                  size_bytes, width, height, duration_seconds, owner_post_id,
                  created_at, updated_at
        "#,
    )
    .bind(payload.kind)
    .bind(bucket)
    .bind(&payload.object_key)
    .bind(&payload.original_filename)
    .bind(&payload.mime_type)
    .bind(payload.size_bytes)
    .fetch_one(pool)
    .await?;
    Ok(row)
}

fn build_bucket(settings: &MinioSettings) -> Result<(Bucket, Credentials), AppError> {
    let scheme = if settings.secure { "https" } else { "http" };
    let endpoint = format!("{scheme}://{}", settings.endpoint);
    let endpoint_url = url::Url::parse(&endpoint)
        .map_err(|err| AppError::Internal(anyhow::anyhow!("invalid MinIO endpoint: {err}")))?;
    let bucket = Bucket::new(
        endpoint_url,
        UrlStyle::Path,
        settings.bucket.clone(),
        settings.region.clone(),
    )
    .map_err(|err| AppError::Internal(anyhow::anyhow!("bucket init failed: {err}")))?;
    let credentials = Credentials::new(settings.access_key.clone(), settings.secret_key.clone());
    Ok((bucket, credentials))
}

pub async fn fetch_object_bytes(
    settings: &MinioSettings,
    object_key: &str,
) -> Result<Vec<u8>, AppError> {
    let (bucket, credentials) = build_bucket(settings)?;
    let action = bucket.get_object(Some(&credentials), object_key);
    let url = action.sign(Duration::from_secs(120));

    let response = reqwest::get(url.as_str())
        .await
        .map_err(|err| AppError::BadGateway(format!("object fetch failed: {err}")))?;
    if !response.status().is_success() {
        return Err(AppError::BadGateway(format!(
            "object fetch failed with status {}",
            response.status().as_u16()
        )));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|err| AppError::BadGateway(format!("object body read failed: {err}")))?;
    Ok(bytes.to_vec())
}

pub async fn put_object_bytes(
    settings: &MinioSettings,
    object_key: &str,
    content_type: &str,
    payload: Vec<u8>,
) -> Result<(), AppError> {
    let (bucket, credentials) = build_bucket(settings)?;
    let action = bucket.put_object(Some(&credentials), object_key);
    let url = action.sign(Duration::from_secs(120));

    let client = reqwest::Client::new();
    let response = client
        .put(url.as_str())
        .header("content-type", content_type)
        .body(payload)
        .send()
        .await
        .map_err(|err| AppError::BadGateway(format!("object put failed: {err}")))?;
    if !response.status().is_success() {
        return Err(AppError::BadGateway(format!(
            "object put failed with status {}",
            response.status().as_u16()
        )));
    }
    Ok(())
}

pub async fn delete_object(settings: &MinioSettings, object_key: &str) -> Result<(), AppError> {
    let (bucket, credentials) = build_bucket(settings)?;
    let action = bucket.delete_object(Some(&credentials), object_key);
    let url = action.sign(Duration::from_secs(60));

    let client = reqwest::Client::new();
    let response = client
        .delete(url.as_str())
        .send()
        .await
        .map_err(|err| AppError::BadGateway(format!("object delete failed: {err}")))?;
    // S3 returns 204 on success, 404 is acceptable as a no-op.
    let status = response.status();
    if status.is_success() || status.as_u16() == 404 {
        return Ok(());
    }
    Err(AppError::BadGateway(format!(
        "object delete failed with status {}",
        status.as_u16()
    )))
}

pub async fn object_exists(settings: &MinioSettings, object_key: &str) -> Result<bool, AppError> {
    let (bucket, credentials) = build_bucket(settings)?;
    let action = bucket.head_object(Some(&credentials), object_key);
    let url = action.sign(Duration::from_secs(60));

    let client = reqwest::Client::new();
    let response = client
        .head(url.as_str())
        .send()
        .await
        .map_err(|err| AppError::BadGateway(format!("object head failed: {err}")))?;
    let status = response.status();
    if status.is_success() {
        return Ok(true);
    }
    if status.as_u16() == 404 {
        return Ok(false);
    }
    Err(AppError::BadGateway(format!(
        "object head failed with status {}",
        status.as_u16()
    )))
}

/// Forward a raw byte body to a presigned PUT URL on the operator's behalf.
/// Used as a fallback when the browser's CORS policy blocks direct uploads
/// to MinIO. Times out after 30s to bound bad URLs / slow links.
pub async fn proxy_upload(
    upload_url: &str,
    content_type: &str,
    body: Bytes,
) -> Result<(), AppError> {
    let parsed = url::Url::parse(upload_url)
        .map_err(|_| AppError::BadRequest("upload_url is not a valid URL".into()))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(AppError::BadRequest(
            "upload_url protocol is not supported".into(),
        ));
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|err| AppError::Internal(anyhow::anyhow!("http client init failed: {err}")))?;

    let response = client
        .put(upload_url)
        .header("content-type", content_type)
        .body(body)
        .send()
        .await
        .map_err(|err| AppError::BadGateway(format!("object storage request failed: {err}")))?;

    let status = response.status();
    if !status.is_success() {
        let body_text = response
            .text()
            .await
            .unwrap_or_else(|_| String::from("(no response body)"));
        let trimmed = body_text.trim();
        let detail = if trimmed.is_empty() {
            format!(
                "object storage upload failed with status {}",
                status.as_u16()
            )
        } else {
            trimmed.to_string()
        };
        return Err(AppError::BadGateway(detail));
    }

    Ok(())
}
