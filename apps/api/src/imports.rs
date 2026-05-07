//! Backup ZIP archive encode + decode for admin-only download/restore.
//!
//! Produces a versioned bundle (`SCHEMA_VERSION` constant) containing post
//! markdown files, series metadata, media binaries, and JSON sidecars for the
//! relational tables. Restore validates the manifest, replays content, and
//! re-creates media objects in MinIO inside a single Postgres transaction.

mod codec;
mod restore;

use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sqlx::PgPool;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::config::MinioSettings;
use crate::error::AppError;
use crate::media as media_helpers;

#[derive(Debug, Serialize, ToSchema)]
pub struct BackupLoadRead {
    pub restored_posts: i64,
    pub restored_media: i64,
    pub restored_series_overrides: i64,
}

/// In-memory backup payload shared between `codec` (encode/decode) and
/// `restore` (apply to DB).
pub(crate) struct Bundle {
    pub(crate) site_profile: Option<Value>,
    pub(crate) tags: Vec<Value>,
    pub(crate) post_tags: Vec<Value>,
    pub(crate) media_assets: Vec<Value>,
    pub(crate) media_bytes: HashMap<String, Vec<u8>>,
    pub(crate) posts: Vec<(Value, String)>,
    pub(crate) series: Vec<Value>,
    pub(crate) series_posts: Vec<Value>,
    pub(crate) post_comments: Vec<Value>,
    pub(crate) generated_at: DateTime<Utc>,
}

pub async fn download_posts_backup(
    pool: &PgPool,
    minio: &MinioSettings,
) -> Result<(String, Vec<u8>), AppError> {
    let bundle = codec::collect_bundle(pool, minio).await?;
    let timestamp = bundle.generated_at.format("%Y%m%d-%H%M%S").to_string();
    let filename = format!("traceoflight-posts-backup-{timestamp}.zip");
    let bytes = codec::build_backup_zip(&bundle)?;
    Ok((filename, bytes))
}

pub async fn load_posts_backup(
    pool: &PgPool,
    minio: &MinioSettings,
    filename: &str,
    payload: &[u8],
) -> Result<BackupLoadRead, AppError> {
    if filename.trim().is_empty() {
        return Err(AppError::BadRequest("backup filename is required".into()));
    }
    let bundle = codec::parse_backup_zip(payload)?;

    // Stage media to temp keys; remember whatever currently lives at the
    // final keys so we can roll back on DB failure.
    let stage_id = Uuid::new_v4().simple().to_string();
    let mime_lookup: HashMap<&str, &str> = bundle
        .media_assets
        .iter()
        .filter_map(|m| {
            let object_key = m.get("object_key").and_then(|v| v.as_str())?;
            let mime = m
                .get("mime_type")
                .and_then(|v| v.as_str())
                .unwrap_or("application/octet-stream");
            Some((object_key, mime))
        })
        .collect();

    let mut staged_keys: Vec<(String, String)> = Vec::new();
    for (object_key, payload) in &bundle.media_bytes {
        let staged_key = format!("imports/backups/staging/{stage_id}/{object_key}");
        let mime = mime_lookup
            .get(object_key.as_str())
            .copied()
            .unwrap_or("application/octet-stream");
        if let Err(err) =
            media_helpers::put_object_bytes(minio, &staged_key, mime, payload.clone()).await
        {
            for (_, staged) in &staged_keys {
                let _ = media_helpers::delete_object(minio, staged).await;
            }
            return Err(err);
        }
        staged_keys.push((object_key.clone(), staged_key));
    }

    let mut previous: HashMap<String, Option<Vec<u8>>> = HashMap::new();
    for (object_key, _) in &staged_keys {
        let exists = media_helpers::object_exists(minio, object_key).await?;
        previous.insert(
            object_key.clone(),
            if exists {
                Some(media_helpers::fetch_object_bytes(minio, object_key).await?)
            } else {
                None
            },
        );
    }

    // Promote staged to final.
    for (object_key, staged_key) in &staged_keys {
        let mime = mime_lookup
            .get(object_key.as_str())
            .copied()
            .unwrap_or("application/octet-stream");
        let bytes = media_helpers::fetch_object_bytes(minio, staged_key).await?;
        media_helpers::put_object_bytes(minio, object_key, mime, bytes).await?;
    }

    let restore_result = restore::run_restore_transaction(pool, &bundle).await;

    if let Err(err) = restore_result {
        // Best-effort rollback of media to previous state, then propagate err.
        for (object_key, prev_bytes) in &previous {
            match prev_bytes {
                Some(bytes) => {
                    let mime = mime_lookup
                        .get(object_key.as_str())
                        .copied()
                        .unwrap_or("application/octet-stream");
                    let _ = media_helpers::put_object_bytes(minio, object_key, mime, bytes.clone())
                        .await;
                }
                None => {
                    let _ = media_helpers::delete_object(minio, object_key).await;
                }
            }
        }
        for (_, staged_key) in &staged_keys {
            let _ = media_helpers::delete_object(minio, staged_key).await;
        }
        return Err(err);
    }

    // Cleanup staging.
    for (_, staged_key) in &staged_keys {
        let _ = media_helpers::delete_object(minio, staged_key).await;
    }

    Ok(BackupLoadRead {
        restored_posts: bundle.posts.len() as i64,
        restored_media: bundle.media_assets.len() as i64,
        restored_series_overrides: 0,
    })
}
