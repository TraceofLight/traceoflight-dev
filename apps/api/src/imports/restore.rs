//! Apply a parsed `Bundle` to the live database in a single transaction.

use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::error::AppError;

use super::Bundle;

pub(super) async fn run_restore_transaction(
    pool: &PgPool,
    bundle: &Bundle,
) -> Result<(), AppError> {
    let mut tx = pool.begin().await?;
    wipe_tables(&mut tx).await?;
    insert_bundle(&mut tx, bundle).await?;
    tx.commit().await?;
    Ok(())
}

async fn wipe_tables(tx: &mut Transaction<'_, Postgres>) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM post_comments")
        .execute(&mut **tx)
        .await?;
    sqlx::query("DELETE FROM series_posts")
        .execute(&mut **tx)
        .await?;
    sqlx::query("DELETE FROM post_tags")
        .execute(&mut **tx)
        .await?;
    sqlx::query("DELETE FROM project_profiles")
        .execute(&mut **tx)
        .await?;
    sqlx::query("DELETE FROM posts").execute(&mut **tx).await?;
    sqlx::query("DELETE FROM series").execute(&mut **tx).await?;
    sqlx::query("DELETE FROM tags").execute(&mut **tx).await?;
    sqlx::query("DELETE FROM media_assets")
        .execute(&mut **tx)
        .await?;
    sqlx::query("DELETE FROM site_profiles")
        .execute(&mut **tx)
        .await?;
    Ok(())
}

async fn insert_bundle(
    tx: &mut Transaction<'_, Postgres>,
    bundle: &Bundle,
) -> Result<(), AppError> {
    for tag in &bundle.tags {
        let id = uuid_field(tag, "id")?;
        let slug = str_field(tag, "slug")?;
        let label = str_field(tag, "label")?;
        sqlx::query("INSERT INTO tags (id, slug, label) VALUES ($1, $2, $3)")
            .bind(id)
            .bind(slug)
            .bind(label)
            .execute(&mut **tx)
            .await?;
    }

    // Posts use a self-referential FK (source_post_id → posts.id). Inserting in
    // bundle order can violate the FK when a translated row appears before its
    // source. Two-pass: stage every row with source_post_id = NULL, then
    // backfill the parent ids in a second pass.
    for (meta, body) in &bundle.posts {
        insert_post(tx, meta, body).await?;
    }
    for (meta, _) in &bundle.posts {
        if let Some(source) = opt_uuid(meta, "source_post_id")? {
            let id = uuid_field(meta, "id")?;
            sqlx::query("UPDATE posts SET source_post_id = $1 WHERE id = $2")
                .bind(source)
                .bind(id)
                .execute(&mut **tx)
                .await?;
        }
    }

    for media in &bundle.media_assets {
        insert_media_asset(tx, media).await?;
    }

    for link in &bundle.post_tags {
        let post_id = uuid_field(link, "post_id")?;
        let tag_id = uuid_field(link, "tag_id")?;
        sqlx::query("INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2)")
            .bind(post_id)
            .bind(tag_id)
            .execute(&mut **tx)
            .await?;
    }

    // Same self-FK story for series.source_series_id.
    for s in &bundle.series {
        insert_series(tx, s).await?;
    }
    for s in &bundle.series {
        if let Some(source) = opt_uuid(s, "source_series_id")? {
            let id = uuid_field(s, "id")?;
            sqlx::query("UPDATE series SET source_series_id = $1 WHERE id = $2")
                .bind(source)
                .bind(id)
                .execute(&mut **tx)
                .await?;
        }
    }
    for sp in &bundle.series_posts {
        let id = uuid_field(sp, "id")?;
        let series_id = uuid_field(sp, "series_id")?;
        let post_id = uuid_field(sp, "post_id")?;
        let order_index = sp
            .get("order_index")
            .and_then(|v| v.as_i64())
            .ok_or_else(|| AppError::BadRequest("series_post.order_index missing".into()))?;
        sqlx::query(
            "INSERT INTO series_posts (id, series_id, post_id, order_index) VALUES ($1, $2, $3, $4)",
        )
        .bind(id)
        .bind(series_id)
        .bind(post_id)
        .bind(order_index as i32)
        .execute(&mut **tx)
        .await?;
    }

    let mut roots: Vec<&Value> = Vec::new();
    let mut replies: Vec<&Value> = Vec::new();
    for c in &bundle.post_comments {
        let id = c.get("id").and_then(|v| v.as_str());
        let root_ref = c.get("root_comment_id").and_then(|v| v.as_str());
        if root_ref.is_none() || root_ref == id {
            roots.push(c);
        } else {
            replies.push(c);
        }
    }
    for c in roots {
        insert_comment(tx, c).await?;
    }
    for c in replies {
        insert_comment(tx, c).await?;
    }

    if let Some(profile) = &bundle.site_profile {
        let key = str_field(profile, "key")?;
        let email = str_field(profile, "email")?;
        let github_url = str_field(profile, "github_url")?;
        sqlx::query("INSERT INTO site_profiles (key, email, github_url) VALUES ($1, $2, $3)")
            .bind(key)
            .bind(email)
            .bind(github_url)
            .execute(&mut **tx)
            .await?;
    }

    Ok(())
}

async fn insert_post(
    tx: &mut Transaction<'_, Postgres>,
    meta: &Value,
    body: &str,
) -> Result<(), AppError> {
    let id = uuid_field(meta, "id")?;
    let translation_group_id = uuid_field(meta, "translation_group_id")?;
    sqlx::query(
        r#"
        INSERT INTO posts (
            id, slug, title, excerpt, body_markdown, cover_image_url,
            top_media_kind, top_media_image_url, top_media_youtube_url, top_media_video_url,
            project_order_index, series_title,
            locale, translation_group_id, source_post_id,
            translation_status, translation_source_kind, translated_from_hash,
            content_kind, status, visibility, published_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7::post_top_media_kind, $8, $9, $10,
            $11, $12,
            $13::post_locale, $14, NULL,
            $15::post_translation_status, $16::post_translation_source_kind, $17,
            $18::post_content_kind, $19::post_status, $20::post_visibility, $21
        )
        "#,
    )
    .bind(id)
    .bind(str_field(meta, "slug")?)
    .bind(str_field(meta, "title")?)
    .bind(opt_str(meta, "excerpt"))
    .bind(body)
    .bind(opt_str(meta, "cover_image_url"))
    .bind(str_field(meta, "top_media_kind")?)
    .bind(opt_str(meta, "top_media_image_url"))
    .bind(opt_str(meta, "top_media_youtube_url"))
    .bind(opt_str(meta, "top_media_video_url"))
    .bind(opt_i32(meta, "project_order_index"))
    .bind(opt_str(meta, "series_title"))
    .bind(str_field(meta, "locale")?)
    .bind(translation_group_id)
    .bind(str_field(meta, "translation_status")?)
    .bind(str_field(meta, "translation_source_kind")?)
    .bind(opt_str(meta, "translated_from_hash"))
    .bind(str_field(meta, "content_kind")?)
    .bind(str_field(meta, "status")?)
    .bind(str_field(meta, "visibility")?)
    .bind(opt_iso(meta, "published_at")?)
    .execute(&mut **tx)
    .await?;

    if let Some(profile) = meta.get("project_profile").and_then(|v| v.as_object()) {
        let highlights = profile
            .get("highlights")
            .cloned()
            .unwrap_or(Value::Array(Vec::new()));
        let resource_links = profile
            .get("resource_links")
            .cloned()
            .unwrap_or(Value::Array(Vec::new()));
        let profile_id = profile
            .get("id")
            .and_then(|v| v.as_str())
            .and_then(|s| Uuid::parse_str(s).ok())
            .unwrap_or_else(Uuid::new_v4);
        sqlx::query(
            r#"
            INSERT INTO project_profiles (
                id, post_id, period_label, role_summary, project_intro, card_image_url,
                highlights_json, resource_links_json
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            "#,
        )
        .bind(profile_id)
        .bind(id)
        .bind(
            profile
                .get("period_label")
                .and_then(|v| v.as_str())
                .unwrap_or(""),
        )
        .bind(
            profile
                .get("role_summary")
                .and_then(|v| v.as_str())
                .unwrap_or(""),
        )
        .bind(profile.get("project_intro").and_then(|v| v.as_str()))
        .bind(
            profile
                .get("card_image_url")
                .and_then(|v| v.as_str())
                .unwrap_or(""),
        )
        .bind(highlights)
        .bind(resource_links)
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

async fn insert_media_asset(
    tx: &mut Transaction<'_, Postgres>,
    media: &Value,
) -> Result<(), AppError> {
    let id = media
        .get("id")
        .and_then(|v| v.as_str())
        .and_then(|s| Uuid::parse_str(s).ok())
        .unwrap_or_else(Uuid::new_v4);
    sqlx::query(
        r#"
        INSERT INTO media_assets (
            id, kind, bucket, object_key, original_filename, mime_type, size_bytes,
            width, height, duration_seconds, owner_post_id
        ) VALUES (
            $1, $2::asset_kind, $3, $4, $5, $6, $7, $8, $9, $10, $11
        )
        "#,
    )
    .bind(id)
    .bind(str_field(media, "kind")?)
    .bind(str_field(media, "bucket")?)
    .bind(str_field(media, "object_key")?)
    .bind(str_field(media, "original_filename")?)
    .bind(str_field(media, "mime_type")?)
    .bind(
        media
            .get("size_bytes")
            .and_then(|v| v.as_i64())
            .unwrap_or(0),
    )
    .bind(opt_i32(media, "width"))
    .bind(opt_i32(media, "height"))
    .bind(opt_i32(media, "duration_seconds"))
    .bind(opt_uuid(media, "owner_post_id")?)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn insert_series(tx: &mut Transaction<'_, Postgres>, s: &Value) -> Result<(), AppError> {
    sqlx::query(
        r#"
        INSERT INTO series (
            id, slug, title, description, cover_image_url, list_order_index,
            locale, translation_group_id, source_series_id,
            translation_status, translation_source_kind, translated_from_hash
        ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7::post_locale, $8, NULL,
            $9::post_translation_status, $10::post_translation_source_kind, $11
        )
        "#,
    )
    .bind(uuid_field(s, "id")?)
    .bind(str_field(s, "slug")?)
    .bind(str_field(s, "title")?)
    .bind(str_field(s, "description")?)
    .bind(opt_str(s, "cover_image_url"))
    .bind(opt_i32(s, "list_order_index"))
    .bind(str_field(s, "locale")?)
    .bind(uuid_field(s, "translation_group_id")?)
    .bind(str_field(s, "translation_status")?)
    .bind(str_field(s, "translation_source_kind")?)
    .bind(opt_str(s, "translated_from_hash"))
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn insert_comment(tx: &mut Transaction<'_, Postgres>, c: &Value) -> Result<(), AppError> {
    sqlx::query(
        r#"
        INSERT INTO post_comments (
            id, post_id, root_comment_id, reply_to_comment_id,
            author_name,
            author_type, password_hash,
            visibility, status, body,
            deleted_at, last_edited_at,
            request_ip_hash, user_agent_hash
        ) VALUES (
            $1, $2, $3, $4,
            $5,
            $6::post_comment_author_type, $7,
            $8::post_comment_visibility, $9::post_comment_status, $10,
            $11, $12,
            $13, $14
        )
        "#,
    )
    .bind(uuid_field(c, "id")?)
    .bind(uuid_field(c, "post_id")?)
    .bind(opt_uuid(c, "root_comment_id")?)
    .bind(opt_uuid(c, "reply_to_comment_id")?)
    .bind(str_field(c, "author_name")?)
    .bind(str_field(c, "author_type")?)
    .bind(opt_str(c, "password_hash"))
    .bind(str_field(c, "visibility")?)
    .bind(str_field(c, "status")?)
    .bind(str_field(c, "body")?)
    .bind(opt_iso(c, "deleted_at")?)
    .bind(opt_iso(c, "last_edited_at")?)
    .bind(opt_str(c, "request_ip_hash"))
    .bind(opt_str(c, "user_agent_hash"))
    .execute(&mut **tx)
    .await?;
    Ok(())
}

// ── Field accessors for Value-shaped JSON ──────────────────────────────────

fn str_field(value: &Value, key: &str) -> Result<String, AppError> {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .map(String::from)
        .ok_or_else(|| AppError::BadRequest(format!("backup payload missing string `{key}`")))
}

fn opt_str(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(|v| v.as_str()).map(String::from)
}

fn opt_i32(value: &Value, key: &str) -> Option<i32> {
    value
        .get(key)
        .and_then(|v| v.as_i64())
        .and_then(|n| i32::try_from(n).ok())
}

fn uuid_field(value: &Value, key: &str) -> Result<Uuid, AppError> {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .and_then(|s| Uuid::parse_str(s).ok())
        .ok_or_else(|| AppError::BadRequest(format!("backup payload missing uuid `{key}`")))
}

fn opt_uuid(value: &Value, key: &str) -> Result<Option<Uuid>, AppError> {
    let raw = value.get(key);
    match raw {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(s)) => Uuid::parse_str(s)
            .map(Some)
            .map_err(|_| AppError::BadRequest(format!("backup payload `{key}` is not a uuid"))),
        Some(_) => Err(AppError::BadRequest(format!(
            "backup payload `{key}` must be a string"
        ))),
    }
}

fn opt_iso(value: &Value, key: &str) -> Result<Option<DateTime<Utc>>, AppError> {
    let raw = value.get(key).and_then(|v| v.as_str());
    let Some(s) = raw else { return Ok(None) };
    if s.is_empty() {
        return Ok(None);
    }
    let normalized = s.replace('Z', "+00:00");
    DateTime::parse_from_rfc3339(&normalized)
        .map(|dt| Some(dt.with_timezone(&Utc)))
        .map_err(|_| AppError::BadRequest(format!("backup payload `{key}` is not ISO-8601")))
}
