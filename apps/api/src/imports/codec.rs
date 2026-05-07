//! Bundle ↔ ZIP codec and DB → Bundle collection.
//!
//! Owns the on-disk schema (`SCHEMA_VERSION`, manifest layout, JSON sidecar
//! paths) and produces a self-contained in-memory `Bundle` either from the
//! live database or from a backup archive.

use std::collections::{HashMap, HashSet};
use std::io::{Cursor, Read, Write};

use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;
use zip::{CompressionMethod, ZipArchive, ZipWriter, write::SimpleFileOptions};

use crate::config::MinioSettings;
use crate::error::AppError;
use crate::media as media_helpers;
use crate::media_refs::{extract_markdown_keys, extract_object_key};
use crate::posts::slugify_series_title;

use super::Bundle;

const SCHEMA_VERSION: &str = "backup-v3";
const MANIFEST_PATH: &str = "manifest.json";
const POSTS_DIR: &str = "posts";
const SERIES_DIR: &str = "series";
const MEDIA_DIR: &str = "media";

const DB_TAGS_PATH: &str = "db/tags.json";
const DB_POST_TAGS_PATH: &str = "db/post_tags.json";
const DB_SERIES_POSTS_PATH: &str = "db/series_posts.json";
const DB_POST_COMMENTS_PATH: &str = "db/post_comments.json";
const DB_SITE_PROFILE_PATH: &str = "db/site_profile.json";
const DB_MEDIA_ASSETS_PATH: &str = "db/media_assets.json";

// ── DB row shapes for serialization ────────────────────────────────────────

#[derive(Debug, FromRow)]
struct PostBackupRow {
    id: Uuid,
    slug: String,
    title: String,
    excerpt: Option<String>,
    body_markdown: String,
    cover_image_url: Option<String>,
    top_media_kind: String,
    top_media_image_url: Option<String>,
    top_media_youtube_url: Option<String>,
    top_media_video_url: Option<String>,
    project_order_index: Option<i32>,
    series_title: Option<String>,
    locale: String,
    translation_group_id: Uuid,
    source_post_id: Option<Uuid>,
    translation_status: String,
    translation_source_kind: String,
    translated_from_hash: Option<String>,
    content_kind: String,
    status: String,
    visibility: String,
    published_at: Option<DateTime<Utc>>,
}

#[derive(Debug, FromRow)]
struct ProjectProfileRow {
    id: Uuid,
    post_id: Uuid,
    period_label: String,
    role_summary: String,
    project_intro: Option<String>,
    card_image_url: String,
    highlights_json: Value,
    resource_links_json: Value,
}

#[derive(Debug, FromRow)]
struct SeriesBackupRow {
    id: Uuid,
    slug: String,
    title: String,
    description: String,
    cover_image_url: Option<String>,
    list_order_index: Option<i32>,
    locale: String,
    translation_group_id: Uuid,
    source_series_id: Option<Uuid>,
    translation_status: String,
    translation_source_kind: String,
    translated_from_hash: Option<String>,
}

#[derive(Debug, FromRow)]
struct SeriesPostBackupRow {
    id: Uuid,
    series_id: Uuid,
    post_id: Uuid,
    order_index: i32,
}

#[derive(Debug, FromRow)]
struct TagBackupRow {
    id: Uuid,
    slug: String,
    label: String,
}

#[derive(Debug, FromRow)]
struct PostTagBackupRow {
    post_id: Uuid,
    tag_id: Uuid,
}

#[derive(Debug, FromRow)]
struct CommentBackupRow {
    id: Uuid,
    post_id: Uuid,
    root_comment_id: Option<Uuid>,
    reply_to_comment_id: Option<Uuid>,
    author_name: String,
    author_type: String,
    password_hash: Option<String>,
    visibility: String,
    status: String,
    body: String,
    deleted_at: Option<DateTime<Utc>>,
    last_edited_at: Option<DateTime<Utc>>,
    request_ip_hash: Option<String>,
    user_agent_hash: Option<String>,
}

#[derive(Debug, FromRow)]
struct MediaAssetBackupRow {
    id: Uuid,
    kind: String,
    bucket: String,
    object_key: String,
    original_filename: String,
    mime_type: String,
    size_bytes: i64,
    width: Option<i32>,
    height: Option<i32>,
    duration_seconds: Option<i32>,
    owner_post_id: Option<Uuid>,
}

#[derive(Debug, FromRow)]
struct SiteProfileBackupRow {
    key: String,
    email: String,
    github_url: String,
}

// ── Helpers ────────────────────────────────────────────────────────────────

fn iso_utc_z(dt: DateTime<Utc>) -> String {
    if dt.timestamp_subsec_micros() == 0 {
        dt.format("%Y-%m-%dT%H:%M:%SZ").to_string()
    } else {
        dt.format("%Y-%m-%dT%H:%M:%S%.6fZ").to_string()
    }
}

fn iso_utc_z_opt(dt: Option<DateTime<Utc>>) -> Value {
    match dt {
        Some(t) => Value::String(iso_utc_z(t)),
        None => Value::Null,
    }
}

fn dump_pretty(value: &Value) -> Vec<u8> {
    serde_json::to_string_pretty(value)
        .unwrap_or_default()
        .into_bytes()
}

fn guess_kind(object_key: &str, mime_type: &str) -> &'static str {
    if mime_type.starts_with("image/") || object_key.starts_with("image/") {
        "image"
    } else if mime_type.starts_with("video/") || object_key.starts_with("video/") {
        "video"
    } else {
        "file"
    }
}

fn fallback_media_entry(object_key: &str, payload_len: usize, bucket: &str) -> Value {
    let original_filename = object_key.rsplit('/').next().unwrap_or(object_key);
    let mime_type = mime_guess::from_path(original_filename)
        .first_or_octet_stream()
        .essence_str()
        .to_string();
    json!({
        "id": Value::Null,
        "kind": guess_kind(object_key, &mime_type),
        "bucket": bucket,
        "object_key": object_key,
        "original_filename": original_filename,
        "mime_type": mime_type,
        "size_bytes": payload_len,
        "width": Value::Null,
        "height": Value::Null,
        "duration_seconds": Value::Null,
        "owner_post_id": Value::Null,
    })
}

// ── Serializers ────────────────────────────────────────────────────────────

fn serialize_tag(row: &TagBackupRow) -> Value {
    json!({
        "id": row.id.to_string(),
        "slug": row.slug,
        "label": row.label,
    })
}

fn serialize_post_tag(row: &PostTagBackupRow) -> Value {
    json!({
        "post_id": row.post_id.to_string(),
        "tag_id": row.tag_id.to_string(),
    })
}

fn serialize_series(row: &SeriesBackupRow) -> Value {
    json!({
        "id": row.id.to_string(),
        "slug": row.slug,
        "title": row.title,
        "description": row.description,
        "cover_image_url": row.cover_image_url,
        "list_order_index": row.list_order_index,
        "locale": row.locale,
        "translation_group_id": row.translation_group_id.to_string(),
        "source_series_id": row.source_series_id.map(|u| u.to_string()),
        "translation_status": row.translation_status,
        "translation_source_kind": row.translation_source_kind,
        "translated_from_hash": row.translated_from_hash,
    })
}

fn serialize_series_post(row: &SeriesPostBackupRow) -> Value {
    json!({
        "id": row.id.to_string(),
        "series_id": row.series_id.to_string(),
        "post_id": row.post_id.to_string(),
        "order_index": row.order_index,
    })
}

fn serialize_comment(row: &CommentBackupRow) -> Value {
    json!({
        "id": row.id.to_string(),
        "post_id": row.post_id.to_string(),
        "root_comment_id": row.root_comment_id.map(|u| u.to_string()),
        "reply_to_comment_id": row.reply_to_comment_id.map(|u| u.to_string()),
        "author_name": row.author_name,
        "author_type": row.author_type,
        "password_hash": row.password_hash,
        "visibility": row.visibility,
        "status": row.status,
        "body": row.body,
        "deleted_at": iso_utc_z_opt(row.deleted_at),
        "last_edited_at": iso_utc_z_opt(row.last_edited_at),
        "request_ip_hash": row.request_ip_hash,
        "user_agent_hash": row.user_agent_hash,
    })
}

fn serialize_media_asset(row: &MediaAssetBackupRow) -> Value {
    json!({
        "id": row.id.to_string(),
        "kind": row.kind,
        "bucket": row.bucket,
        "object_key": row.object_key,
        "original_filename": row.original_filename,
        "mime_type": row.mime_type,
        "size_bytes": row.size_bytes,
        "width": row.width,
        "height": row.height,
        "duration_seconds": row.duration_seconds,
        "owner_post_id": row.owner_post_id.map(|u| u.to_string()),
    })
}

fn serialize_site_profile(row: &SiteProfileBackupRow) -> Value {
    json!({
        "key": row.key,
        "email": row.email,
        "github_url": row.github_url,
    })
}

fn serialize_post(row: &PostBackupRow, profile: Option<&ProjectProfileRow>) -> (Value, String) {
    let project_profile = profile.map(|p| {
        json!({
            "id": p.id.to_string(),
            "period_label": p.period_label,
            "role_summary": p.role_summary,
            "project_intro": p.project_intro,
            "card_image_url": p.card_image_url,
            "highlights": p.highlights_json,
            "resource_links": p.resource_links_json,
        })
    });
    let meta = json!({
        "id": row.id.to_string(),
        "slug": row.slug,
        "title": row.title,
        "excerpt": row.excerpt,
        "cover_image_url": row.cover_image_url,
        "top_media_kind": row.top_media_kind,
        "top_media_image_url": row.top_media_image_url,
        "top_media_youtube_url": row.top_media_youtube_url,
        "top_media_video_url": row.top_media_video_url,
        "project_order_index": row.project_order_index,
        "series_title": row.series_title,
        "locale": row.locale,
        "translation_group_id": row.translation_group_id.to_string(),
        "source_post_id": row.source_post_id.map(|u| u.to_string()),
        "translation_status": row.translation_status,
        "translation_source_kind": row.translation_source_kind,
        "translated_from_hash": row.translated_from_hash,
        "content_kind": row.content_kind,
        "status": row.status,
        "visibility": row.visibility,
        "published_at": iso_utc_z_opt(row.published_at),
        "project_profile": project_profile.unwrap_or(Value::Null),
    });
    (meta, row.body_markdown.clone())
}

// ── Collect bundle from DB + MinIO ─────────────────────────────────────────

pub(super) async fn collect_bundle(
    pool: &PgPool,
    minio: &MinioSettings,
) -> Result<Bundle, AppError> {
    let posts: Vec<PostBackupRow> = sqlx::query_as(
        r#"
        SELECT
            id, slug, title, excerpt, body_markdown,
            cover_image_url,
            top_media_kind::text AS top_media_kind,
            top_media_image_url, top_media_youtube_url, top_media_video_url,
            project_order_index, series_title,
            locale::text AS locale,
            translation_group_id, source_post_id,
            translation_status::text AS translation_status,
            translation_source_kind::text AS translation_source_kind,
            translated_from_hash,
            content_kind::text AS content_kind,
            status::text AS status,
            visibility::text AS visibility,
            published_at
        FROM posts
        ORDER BY created_at ASC, slug ASC
        "#,
    )
    .fetch_all(pool)
    .await?;

    let post_ids: Vec<Uuid> = posts.iter().map(|p| p.id).collect();
    let project_profiles: Vec<ProjectProfileRow> = if post_ids.is_empty() {
        Vec::new()
    } else {
        sqlx::query_as(
            r#"
            SELECT id, post_id, period_label, role_summary, project_intro,
                   card_image_url, highlights_json, resource_links_json
            FROM project_profiles
            WHERE post_id = ANY($1)
            "#,
        )
        .bind(&post_ids)
        .fetch_all(pool)
        .await?
    };
    let profiles_by_post: HashMap<Uuid, &ProjectProfileRow> =
        project_profiles.iter().map(|p| (p.post_id, p)).collect();

    let series_rows: Vec<SeriesBackupRow> = sqlx::query_as(
        r#"
        SELECT
            id, slug, title, description, cover_image_url, list_order_index,
            locale::text AS locale,
            translation_group_id, source_series_id,
            translation_status::text AS translation_status,
            translation_source_kind::text AS translation_source_kind,
            translated_from_hash
        FROM series
        ORDER BY created_at ASC
        "#,
    )
    .fetch_all(pool)
    .await?;

    let series_posts: Vec<SeriesPostBackupRow> = sqlx::query_as(
        "SELECT id, series_id, post_id, order_index FROM series_posts ORDER BY series_id, order_index",
    )
    .fetch_all(pool)
    .await?;

    let tags: Vec<TagBackupRow> = sqlx::query_as("SELECT id, slug, label FROM tags ORDER BY slug")
        .fetch_all(pool)
        .await?;
    let post_tag_links: Vec<PostTagBackupRow> =
        sqlx::query_as("SELECT post_id, tag_id FROM post_tags")
            .fetch_all(pool)
            .await?;

    let comments: Vec<CommentBackupRow> = sqlx::query_as(
        r#"
        SELECT id, post_id, root_comment_id, reply_to_comment_id,
               author_name,
               author_type::text AS author_type,
               password_hash,
               visibility::text AS visibility,
               status::text AS status,
               body, deleted_at, last_edited_at,
               request_ip_hash, user_agent_hash
        FROM post_comments
        ORDER BY created_at
        "#,
    )
    .fetch_all(pool)
    .await?;

    let site_profile: Option<SiteProfileBackupRow> =
        sqlx::query_as("SELECT key, email, github_url FROM site_profiles LIMIT 1")
            .fetch_optional(pool)
            .await?;

    // Collect referenced media keys from post fields, markdown, and series cover
    let mut referenced: HashSet<String> = HashSet::new();
    for post in &posts {
        for url in [
            post.cover_image_url.as_deref(),
            post.top_media_image_url.as_deref(),
            post.top_media_video_url.as_deref(),
        ] {
            if let Some(key) = extract_object_key(url) {
                referenced.insert(key);
            }
        }
        for key in extract_markdown_keys(&post.body_markdown) {
            referenced.insert(key);
        }
        if let Some(profile) = profiles_by_post.get(&post.id) {
            if let Some(key) = extract_object_key(Some(profile.card_image_url.as_str())) {
                referenced.insert(key);
            }
        }
    }
    for s in &series_rows {
        if let Some(key) = extract_object_key(s.cover_image_url.as_deref()) {
            referenced.insert(key);
        }
    }

    let mut sorted_keys: Vec<String> = referenced.into_iter().collect();
    sorted_keys.sort();

    let media_rows: Vec<MediaAssetBackupRow> = if sorted_keys.is_empty() {
        Vec::new()
    } else {
        sqlx::query_as(
            r#"
            SELECT id,
                   kind::text AS kind,
                   bucket, object_key, original_filename, mime_type, size_bytes,
                   width, height, duration_seconds, owner_post_id
            FROM media_assets
            WHERE object_key = ANY($1)
            "#,
        )
        .bind(&sorted_keys)
        .fetch_all(pool)
        .await?
    };
    let media_by_key: HashMap<String, &MediaAssetBackupRow> = media_rows
        .iter()
        .map(|r| (r.object_key.clone(), r))
        .collect();

    let mut media_bytes: HashMap<String, Vec<u8>> = HashMap::new();
    let mut media_assets_payload: Vec<Value> = Vec::new();
    for key in &sorted_keys {
        // Object referenced in the DB but missing in storage: skip rather than
        // fail the whole backup. The DB row stays as-is; media just isn't in
        // the zip. Matches the operator-friendly intent of "back up what you
        // can" even when storage drifts away from the DB.
        let exists = media_helpers::object_exists(minio, key).await?;
        if !exists {
            continue;
        }
        let bytes = media_helpers::fetch_object_bytes(minio, key).await?;
        let payload_len = bytes.len();
        media_bytes.insert(key.clone(), bytes);
        let entry = match media_by_key.get(key) {
            Some(row) => serialize_media_asset(row),
            None => fallback_media_entry(key, payload_len, &minio.bucket),
        };
        media_assets_payload.push(entry);
    }

    let mut posts_payload: Vec<(Value, String)> = Vec::with_capacity(posts.len());
    for post in &posts {
        let profile = profiles_by_post.get(&post.id).copied();
        posts_payload.push(serialize_post(post, profile));
    }

    Ok(Bundle {
        site_profile: site_profile.as_ref().map(serialize_site_profile),
        tags: tags.iter().map(serialize_tag).collect(),
        post_tags: post_tag_links.iter().map(serialize_post_tag).collect(),
        media_assets: media_assets_payload,
        media_bytes,
        posts: posts_payload,
        series: series_rows.iter().map(serialize_series).collect(),
        series_posts: series_posts.iter().map(serialize_series_post).collect(),
        post_comments: comments.iter().map(serialize_comment).collect(),
        generated_at: Utc::now(),
    })
}

// ── Build / parse zip ──────────────────────────────────────────────────────

pub(super) fn build_backup_zip(bundle: &Bundle) -> Result<Vec<u8>, AppError> {
    let manifest = json!({
        "schema_version": SCHEMA_VERSION,
        "generated_at": iso_utc_z(bundle.generated_at),
        "counts": {
            "posts": bundle.posts.len(),
            "series": bundle.series.len(),
            "tags": bundle.tags.len(),
            "post_tags": bundle.post_tags.len(),
            "series_posts": bundle.series_posts.len(),
            "post_comments": bundle.post_comments.len(),
            "media_assets": bundle.media_assets.len(),
        }
    });

    let mut buf = Vec::new();
    {
        let mut writer = ZipWriter::new(Cursor::new(&mut buf));
        let opts: SimpleFileOptions =
            SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

        let mut write_text = |path: &str, contents: &[u8]| -> Result<(), AppError> {
            writer
                .start_file(path, opts)
                .map_err(|e| AppError::Internal(anyhow::anyhow!("zip start_file: {e}")))?;
            writer
                .write_all(contents)
                .map_err(|e| AppError::Internal(anyhow::anyhow!("zip write: {e}")))?;
            Ok(())
        };

        write_text(MANIFEST_PATH, &dump_pretty(&manifest))?;
        write_text(
            DB_SITE_PROFILE_PATH,
            &dump_pretty(bundle.site_profile.as_ref().unwrap_or(&Value::Null)),
        )?;
        write_text(
            DB_TAGS_PATH,
            &dump_pretty(&Value::Array(bundle.tags.clone())),
        )?;
        write_text(
            DB_POST_TAGS_PATH,
            &dump_pretty(&Value::Array(bundle.post_tags.clone())),
        )?;
        write_text(
            DB_SERIES_POSTS_PATH,
            &dump_pretty(&Value::Array(bundle.series_posts.clone())),
        )?;
        write_text(
            DB_POST_COMMENTS_PATH,
            &dump_pretty(&Value::Array(bundle.post_comments.clone())),
        )?;
        write_text(
            DB_MEDIA_ASSETS_PATH,
            &dump_pretty(&Value::Array(bundle.media_assets.clone())),
        )?;

        for (meta, body) in &bundle.posts {
            let group_id = meta
                .get("translation_group_id")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            let locale = meta.get("locale").and_then(|v| v.as_str()).unwrap_or("ko");
            write_text(
                &format!("{POSTS_DIR}/{group_id}/{locale}/meta.json"),
                &dump_pretty(meta),
            )?;
            write_text(
                &format!("{POSTS_DIR}/{group_id}/{locale}/content.md"),
                body.as_bytes(),
            )?;
        }

        for s in &bundle.series {
            let group_id = s
                .get("translation_group_id")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            let locale = s.get("locale").and_then(|v| v.as_str()).unwrap_or("ko");
            write_text(
                &format!("{SERIES_DIR}/{group_id}/{locale}.json"),
                &dump_pretty(s),
            )?;
        }

        for (key, payload) in &bundle.media_bytes {
            write_text(&format!("{MEDIA_DIR}/{key}"), payload)?;
        }

        writer
            .finish()
            .map_err(|e| AppError::Internal(anyhow::anyhow!("zip finish: {e}")))?;
    }
    Ok(buf)
}

pub(super) fn parse_backup_zip(data: &[u8]) -> Result<Bundle, AppError> {
    let mut archive = ZipArchive::new(Cursor::new(data))
        .map_err(|_| AppError::BadRequest("backup zip is invalid".into()))?;

    let manifest_value: Value = read_json(&mut archive, MANIFEST_PATH)?;
    if manifest_value
        .get("schema_version")
        .and_then(|v| v.as_str())
        != Some(SCHEMA_VERSION)
    {
        return Err(AppError::BadRequest(
            "backup manifest schema is invalid".into(),
        ));
    }
    let generated_at = manifest_value
        .get("generated_at")
        .and_then(|v| v.as_str())
        .and_then(|s| {
            let normalized = s.replace('Z', "+00:00");
            DateTime::parse_from_rfc3339(&normalized).ok()
        })
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or_else(Utc::now);

    let site_profile = read_json::<Value>(&mut archive, DB_SITE_PROFILE_PATH)?;
    let site_profile = if site_profile.is_object() {
        Some(site_profile)
    } else {
        None
    };
    let tags = read_array(&mut archive, DB_TAGS_PATH)?;
    let post_tags = read_array(&mut archive, DB_POST_TAGS_PATH)?;
    let series_posts = read_array(&mut archive, DB_SERIES_POSTS_PATH)?;
    let post_comments = read_array(&mut archive, DB_POST_COMMENTS_PATH)?;
    let media_assets = read_array(&mut archive, DB_MEDIA_ASSETS_PATH)?;

    let mut posts: Vec<(Value, String)> = Vec::new();
    let mut series: Vec<Value> = Vec::new();
    let mut media_bytes: HashMap<String, Vec<u8>> = HashMap::new();

    let names: Vec<String> = (0..archive.len())
        .filter_map(|i| archive.by_index(i).ok().map(|f| f.name().to_string()))
        .collect();

    for name in names {
        if name.starts_with(&format!("{POSTS_DIR}/")) && name.ends_with("/meta.json") {
            let meta: Value = read_json(&mut archive, &name)?;
            if !meta.is_object() {
                return Err(AppError::BadRequest(format!(
                    "backup {name} must be an object"
                )));
            }
            let content_path = format!("{}content.md", &name[..name.len() - "meta.json".len()]);
            let body = read_text(&mut archive, &content_path)?;
            posts.push((meta, body));
        } else if name.starts_with(&format!("{SERIES_DIR}/")) && name.ends_with(".json") {
            let v: Value = read_json(&mut archive, &name)?;
            if !v.is_object() {
                return Err(AppError::BadRequest(format!(
                    "backup {name} must be an object"
                )));
            }
            series.push(v);
        } else if name.starts_with(&format!("{MEDIA_DIR}/")) {
            let object_key = &name[MEDIA_DIR.len() + 1..];
            if !object_key.is_empty() {
                let payload = read_bytes(&mut archive, &name)?;
                media_bytes.insert(object_key.to_string(), payload);
            }
        }
    }

    let bundle = Bundle {
        site_profile,
        tags,
        post_tags,
        media_assets,
        media_bytes,
        posts,
        series,
        series_posts,
        post_comments,
        generated_at,
    };
    validate_bundle(&bundle, manifest_value.get("counts"))?;
    Ok(bundle)
}

fn read_json<T: for<'a> serde::Deserialize<'a>>(
    archive: &mut ZipArchive<Cursor<&[u8]>>,
    path: &str,
) -> Result<T, AppError> {
    let mut file = archive
        .by_name(path)
        .map_err(|_| AppError::BadRequest(format!("backup archive missing {path}")))?;
    let mut buf = String::new();
    file.read_to_string(&mut buf)
        .map_err(|_| AppError::BadRequest(format!("backup archive {path} unreadable")))?;
    serde_json::from_str(&buf)
        .map_err(|_| AppError::BadRequest(format!("backup archive {path} is not valid JSON")))
}

fn read_array(archive: &mut ZipArchive<Cursor<&[u8]>>, path: &str) -> Result<Vec<Value>, AppError> {
    let value: Value = read_json(archive, path)?;
    match value {
        Value::Array(arr) => Ok(arr),
        _ => Err(AppError::BadRequest(format!(
            "backup {path} payload must be a list"
        ))),
    }
}

fn read_text(archive: &mut ZipArchive<Cursor<&[u8]>>, path: &str) -> Result<String, AppError> {
    let mut file = archive
        .by_name(path)
        .map_err(|_| AppError::BadRequest(format!("backup archive missing {path}")))?;
    let mut buf = String::new();
    file.read_to_string(&mut buf)
        .map_err(|_| AppError::BadRequest(format!("backup archive {path} unreadable")))?;
    Ok(buf)
}

fn read_bytes(archive: &mut ZipArchive<Cursor<&[u8]>>, path: &str) -> Result<Vec<u8>, AppError> {
    let mut file = archive
        .by_name(path)
        .map_err(|_| AppError::BadRequest(format!("backup archive missing {path}")))?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf)
        .map_err(|_| AppError::BadRequest(format!("backup archive {path} unreadable")))?;
    Ok(buf)
}

fn validate_bundle(bundle: &Bundle, manifest_counts: Option<&Value>) -> Result<(), AppError> {
    let actual = json!({
        "posts": bundle.posts.len(),
        "series": bundle.series.len(),
        "tags": bundle.tags.len(),
        "post_tags": bundle.post_tags.len(),
        "series_posts": bundle.series_posts.len(),
        "post_comments": bundle.post_comments.len(),
        "media_assets": bundle.media_assets.len(),
    });
    if let Some(expected) = manifest_counts.and_then(|v| v.as_object()) {
        for (key, expected_value) in expected {
            let actual_value = actual.get(key);
            if actual_value != Some(expected_value) {
                return Err(AppError::BadRequest(format!(
                    "backup count mismatch for {key}: manifest={expected_value} actual={}",
                    actual_value.cloned().unwrap_or(Value::Null)
                )));
            }
        }
    }

    let mut post_ids: HashSet<String> = HashSet::new();
    for (meta, _) in &bundle.posts {
        if let Some(id) = meta.get("id").and_then(|v| v.as_str()) {
            post_ids.insert(id.to_string());
        }
    }
    let mut tag_ids: HashSet<String> = HashSet::new();
    for tag in &bundle.tags {
        if let Some(id) = tag.get("id").and_then(|v| v.as_str()) {
            tag_ids.insert(id.to_string());
        }
    }
    let mut series_ids: HashSet<String> = HashSet::new();
    for s in &bundle.series {
        if let Some(id) = s.get("id").and_then(|v| v.as_str()) {
            series_ids.insert(id.to_string());
        }
    }
    let mut comment_ids: HashSet<String> = HashSet::new();
    for c in &bundle.post_comments {
        if let Some(id) = c.get("id").and_then(|v| v.as_str()) {
            comment_ids.insert(id.to_string());
        }
    }

    for link in &bundle.post_tags {
        let pid = link.get("post_id").and_then(|v| v.as_str()).unwrap_or("");
        let tid = link.get("tag_id").and_then(|v| v.as_str()).unwrap_or("");
        if !post_ids.contains(pid) {
            return Err(AppError::BadRequest(
                "post_tags references unknown post_id".into(),
            ));
        }
        if !tag_ids.contains(tid) {
            return Err(AppError::BadRequest(
                "post_tags references unknown tag_id".into(),
            ));
        }
    }
    for sp in &bundle.series_posts {
        let sid = sp.get("series_id").and_then(|v| v.as_str()).unwrap_or("");
        let pid = sp.get("post_id").and_then(|v| v.as_str()).unwrap_or("");
        if !series_ids.contains(sid) {
            return Err(AppError::BadRequest(
                "series_posts references unknown series_id".into(),
            ));
        }
        if !post_ids.contains(pid) {
            return Err(AppError::BadRequest(
                "series_posts references unknown post_id".into(),
            ));
        }
    }
    for media in &bundle.media_assets {
        if let Some(owner) = media.get("owner_post_id").and_then(|v| v.as_str()) {
            if !post_ids.contains(owner) {
                return Err(AppError::BadRequest(
                    "media_assets owner_post_id references unknown post".into(),
                ));
            }
        }
    }
    for comment in &bundle.post_comments {
        let pid = comment
            .get("post_id")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if !post_ids.contains(pid) {
            return Err(AppError::BadRequest(
                "post_comments references unknown post_id".into(),
            ));
        }
        for fk in ["root_comment_id", "reply_to_comment_id"] {
            if let Some(target) = comment.get(fk).and_then(|v| v.as_str()) {
                if !comment_ids.contains(target) {
                    return Err(AppError::BadRequest(format!(
                        "post_comments {fk} references unknown comment"
                    )));
                }
            }
        }
    }
    let ko_series_slugs: HashSet<String> = bundle
        .series
        .iter()
        .filter(|s| s.get("locale").and_then(|v| v.as_str()) == Some("ko"))
        .filter_map(|s| s.get("slug").and_then(|v| v.as_str()).map(String::from))
        .collect();
    for (meta, _) in &bundle.posts {
        let series_title = meta.get("series_title").and_then(|v| v.as_str());
        let locale = meta.get("locale").and_then(|v| v.as_str()).unwrap_or("");
        let Some(title) = series_title else { continue };
        if title.is_empty() || locale != "ko" {
            continue;
        }
        if !ko_series_slugs.contains(&slugify_series_title(title)) {
            let slug = meta.get("slug").and_then(|v| v.as_str()).unwrap_or("?");
            return Err(AppError::BadRequest(format!(
                "post '{slug}' references series_title without matching ko series row"
            )));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn empty_bundle() -> Bundle {
        Bundle {
            site_profile: None,
            tags: Vec::new(),
            post_tags: Vec::new(),
            media_assets: Vec::new(),
            media_bytes: HashMap::new(),
            posts: Vec::new(),
            series: Vec::new(),
            series_posts: Vec::new(),
            post_comments: Vec::new(),
            generated_at: Utc::now(),
        }
    }

    fn bundle_with_tag(slug: &str, label: &str) -> Bundle {
        let mut b = empty_bundle();
        b.tags.push(json!({
            "id": Uuid::new_v4().to_string(),
            "slug": slug,
            "label": label,
        }));
        b
    }

    #[test]
    fn empty_bundle_round_trips() {
        let bytes = build_backup_zip(&empty_bundle()).expect("build empty zip");
        let parsed = parse_backup_zip(&bytes).expect("parse empty zip");
        assert!(parsed.tags.is_empty());
        assert!(parsed.posts.is_empty());
        assert!(parsed.series.is_empty());
        assert!(parsed.media_bytes.is_empty());
        assert!(parsed.site_profile.is_none());
    }

    #[test]
    fn round_trip_preserves_single_tag() {
        let bytes = build_backup_zip(&bundle_with_tag("rust", "Rust")).expect("build zip");
        let parsed = parse_backup_zip(&bytes).expect("parse zip");
        assert_eq!(parsed.tags.len(), 1);
        assert_eq!(parsed.tags[0].get("slug").unwrap(), "rust");
        assert_eq!(parsed.tags[0].get("label").unwrap(), "Rust");
    }

    #[test]
    fn parse_rejects_non_zip_payload() {
        // Avoid `unwrap_err` because `Bundle` doesn't impl Debug and changing
        // the production type just to print an unexpected Ok branch isn't
        // worth it.
        match parse_backup_zip(b"this is not a zip archive") {
            Ok(_) => panic!("expected parse failure on non-zip input"),
            Err(AppError::BadRequest(msg)) => assert!(msg.contains("backup zip is invalid")),
            Err(other) => panic!("expected BadRequest, got {other:?}"),
        }
    }

    #[test]
    fn validate_bundle_rejects_post_tag_pointing_at_unknown_post() {
        let mut b = bundle_with_tag("rust", "Rust");
        let tag_id = b.tags[0].get("id").unwrap().as_str().unwrap().to_string();
        b.post_tags.push(json!({
            "post_id": Uuid::new_v4().to_string(), // not present in posts
            "tag_id": tag_id,
        }));
        let err = validate_bundle(&b, None).unwrap_err();
        match err {
            AppError::BadRequest(msg) => {
                assert!(msg.contains("post_tags references unknown post_id"))
            }
            other => panic!("expected BadRequest, got {other:?}"),
        }
    }

    #[test]
    fn validate_bundle_rejects_post_tag_pointing_at_unknown_tag() {
        let mut b = empty_bundle();
        let post_id = Uuid::new_v4();
        b.posts.push((
            json!({
                "id": post_id.to_string(),
                "translation_group_id": Uuid::new_v4().to_string(),
                "locale": "ko",
            }),
            String::new(),
        ));
        b.post_tags.push(json!({
            "post_id": post_id.to_string(),
            "tag_id": Uuid::new_v4().to_string(),
        }));
        let err = validate_bundle(&b, None).unwrap_err();
        match err {
            AppError::BadRequest(msg) => {
                assert!(msg.contains("post_tags references unknown tag_id"))
            }
            other => panic!("expected BadRequest, got {other:?}"),
        }
    }

    #[test]
    fn validate_bundle_rejects_series_post_with_unknown_series() {
        let mut b = empty_bundle();
        let post_id = Uuid::new_v4();
        b.posts.push((
            json!({
                "id": post_id.to_string(),
                "translation_group_id": Uuid::new_v4().to_string(),
                "locale": "ko",
            }),
            String::new(),
        ));
        b.series_posts.push(json!({
            "id": Uuid::new_v4().to_string(),
            "series_id": Uuid::new_v4().to_string(),
            "post_id": post_id.to_string(),
            "order_index": 0,
        }));
        let err = validate_bundle(&b, None).unwrap_err();
        match err {
            AppError::BadRequest(msg) => {
                assert!(msg.contains("series_posts references unknown series_id"))
            }
            other => panic!("expected BadRequest, got {other:?}"),
        }
    }

    #[test]
    fn validate_bundle_rejects_count_mismatch_against_manifest() {
        let b = bundle_with_tag("rust", "Rust");
        // Manifest claims 5 tags but bundle has 1 — should fail before any
        // FK checks even get a chance to disagree.
        let manifest_counts = json!({"tags": 5});
        let err = validate_bundle(&b, Some(&manifest_counts)).unwrap_err();
        match err {
            AppError::BadRequest(msg) => assert!(msg.contains("count mismatch for tags")),
            other => panic!("expected BadRequest, got {other:?}"),
        }
    }
}
