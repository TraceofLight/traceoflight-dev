//! Apply a parsed `Bundle` to the live database in a single transaction.

use chrono::{DateTime, Utc};
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, DatabaseConnection, DatabaseTransaction, DbErr,
    EntityTrait, TransactionTrait,
};
use serde_json::Value;
use uuid::Uuid;

use crate::entities::{
    enums::{
        DbAssetKind, DbCommentAuthorType, DbCommentStatus, DbCommentVisibility, DbPostContentKind,
        DbPostLocale, DbPostStatus, DbPostTopMediaKind, DbPostTranslationSourceKind,
        DbPostTranslationStatus, DbPostVisibility,
    },
    media_asset, post, post_comment, post_tag, project_profile, series, series_post, site_profile,
    tag,
};
use crate::error::AppError;

use super::Bundle;

pub(super) async fn run_restore_transaction(
    pool: &DatabaseConnection,
    bundle: &Bundle,
) -> Result<(), AppError> {
    let tx = pool.begin().await?;
    wipe_tables(&tx).await?;
    insert_bundle(&tx, bundle).await?;
    tx.commit().await?;
    Ok(())
}

async fn wipe_tables(tx: &DatabaseTransaction) -> Result<(), DbErr> {
    post_comment::Entity::delete_many().exec(tx).await?;
    series_post::Entity::delete_many().exec(tx).await?;
    post_tag::Entity::delete_many().exec(tx).await?;
    project_profile::Entity::delete_many().exec(tx).await?;
    post::Entity::delete_many().exec(tx).await?;
    series::Entity::delete_many().exec(tx).await?;
    tag::Entity::delete_many().exec(tx).await?;
    media_asset::Entity::delete_many().exec(tx).await?;
    site_profile::Entity::delete_many().exec(tx).await?;
    Ok(())
}

async fn insert_bundle(tx: &DatabaseTransaction, bundle: &Bundle) -> Result<(), AppError> {
    for tag_value in &bundle.tags {
        let id = uuid_field(tag_value, "id")?;
        let slug = str_field(tag_value, "slug")?;
        let label = str_field(tag_value, "label")?;
        tag::ActiveModel {
            id: Set(id),
            slug: Set(slug),
            label: Set(label),
            ..Default::default()
        }
        .insert(tx)
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
            post::ActiveModel {
                id: Set(id),
                source_post_id: Set(Some(source)),
                ..Default::default()
            }
            .update(tx)
            .await?;
        }
    }

    for media in &bundle.media_assets {
        insert_media_asset(tx, media).await?;
    }

    for link in &bundle.post_tags {
        let post_id = uuid_field(link, "post_id")?;
        let tag_id = uuid_field(link, "tag_id")?;
        post_tag::ActiveModel {
            post_id: Set(post_id),
            tag_id: Set(tag_id),
        }
        .insert(tx)
        .await?;
    }

    // Same self-FK story for series.source_series_id.
    for s in &bundle.series {
        insert_series(tx, s).await?;
    }
    for s in &bundle.series {
        if let Some(source) = opt_uuid(s, "source_series_id")? {
            let id = uuid_field(s, "id")?;
            series::ActiveModel {
                id: Set(id),
                source_series_id: Set(Some(source)),
                ..Default::default()
            }
            .update(tx)
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
        series_post::ActiveModel {
            id: Set(id),
            series_id: Set(series_id),
            post_id: Set(post_id),
            order_index: Set(order_index as i32),
            ..Default::default()
        }
        .insert(tx)
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
        site_profile::ActiveModel {
            key: Set(key),
            email: Set(email),
            github_url: Set(github_url),
            ..Default::default()
        }
        .insert(tx)
        .await?;
    }

    Ok(())
}

async fn insert_post(tx: &DatabaseTransaction, meta: &Value, body: &str) -> Result<(), AppError> {
    let id = uuid_field(meta, "id")?;
    let translation_group_id = uuid_field(meta, "translation_group_id")?;
    post::ActiveModel {
        id: Set(id),
        slug: Set(str_field(meta, "slug")?),
        title: Set(str_field(meta, "title")?),
        excerpt: Set(opt_str(meta, "excerpt")),
        body_markdown: Set(body.to_owned()),
        cover_image_url: Set(opt_str(meta, "cover_image_url")),
        top_media_kind: Set(parse_post_top_media_kind(&str_field(
            meta,
            "top_media_kind",
        )?)?),
        top_media_image_url: Set(opt_str(meta, "top_media_image_url")),
        top_media_youtube_url: Set(opt_str(meta, "top_media_youtube_url")),
        top_media_video_url: Set(opt_str(meta, "top_media_video_url")),
        project_order_index: Set(opt_i32(meta, "project_order_index")),
        series_title: Set(opt_str(meta, "series_title")),
        locale: Set(parse_post_locale(&str_field(meta, "locale")?)?),
        translation_group_id: Set(translation_group_id),
        source_post_id: Set(None),
        translation_status: Set(parse_translation_status(&str_field(
            meta,
            "translation_status",
        )?)?),
        translation_source_kind: Set(parse_translation_source_kind(&str_field(
            meta,
            "translation_source_kind",
        )?)?),
        translated_from_hash: Set(opt_str(meta, "translated_from_hash")),
        content_kind: Set(parse_post_content_kind(&str_field(meta, "content_kind")?)?),
        status: Set(parse_post_status(&str_field(meta, "status")?)?),
        visibility: Set(parse_post_visibility(&str_field(meta, "visibility")?)?),
        published_at: Set(opt_iso(meta, "published_at")?),
        ..Default::default()
    }
    .insert(tx)
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
        project_profile::ActiveModel {
            id: Set(profile_id),
            post_id: Set(id),
            period_label: Set(profile
                .get("period_label")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_owned()),
            role_summary: Set(profile
                .get("role_summary")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_owned()),
            project_intro: Set(profile
                .get("project_intro")
                .and_then(|v| v.as_str())
                .map(str::to_owned)),
            card_image_url: Set(Some(
                profile
                    .get("card_image_url")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_owned(),
            )),
            highlights_json: Set(highlights),
            resource_links_json: Set(resource_links),
            ..Default::default()
        }
        .insert(tx)
        .await?;
    }
    Ok(())
}

async fn insert_media_asset(tx: &DatabaseTransaction, media: &Value) -> Result<(), AppError> {
    let id = media
        .get("id")
        .and_then(|v| v.as_str())
        .and_then(|s| Uuid::parse_str(s).ok())
        .unwrap_or_else(Uuid::new_v4);
    media_asset::ActiveModel {
        id: Set(id),
        kind: Set(parse_asset_kind(&str_field(media, "kind")?)?),
        bucket: Set(str_field(media, "bucket")?),
        object_key: Set(str_field(media, "object_key")?),
        original_filename: Set(str_field(media, "original_filename")?),
        mime_type: Set(str_field(media, "mime_type")?),
        size_bytes: Set(media
            .get("size_bytes")
            .and_then(|v| v.as_i64())
            .unwrap_or(0)),
        width: Set(opt_i32(media, "width")),
        height: Set(opt_i32(media, "height")),
        duration_seconds: Set(opt_i32(media, "duration_seconds")),
        owner_post_id: Set(opt_uuid(media, "owner_post_id")?),
        ..Default::default()
    }
    .insert(tx)
    .await?;
    Ok(())
}

async fn insert_series(tx: &DatabaseTransaction, s: &Value) -> Result<(), AppError> {
    series::ActiveModel {
        id: Set(uuid_field(s, "id")?),
        slug: Set(str_field(s, "slug")?),
        title: Set(str_field(s, "title")?),
        description: Set(str_field(s, "description")?),
        cover_image_url: Set(opt_str(s, "cover_image_url")),
        list_order_index: Set(opt_i32(s, "list_order_index")),
        locale: Set(parse_post_locale(&str_field(s, "locale")?)?),
        translation_group_id: Set(uuid_field(s, "translation_group_id")?),
        source_series_id: Set(None),
        translation_status: Set(parse_translation_status(&str_field(
            s,
            "translation_status",
        )?)?),
        translation_source_kind: Set(parse_translation_source_kind(&str_field(
            s,
            "translation_source_kind",
        )?)?),
        translated_from_hash: Set(opt_str(s, "translated_from_hash")),
        ..Default::default()
    }
    .insert(tx)
    .await?;
    Ok(())
}

async fn insert_comment(tx: &DatabaseTransaction, c: &Value) -> Result<(), AppError> {
    post_comment::ActiveModel {
        id: Set(uuid_field(c, "id")?),
        post_id: Set(uuid_field(c, "post_id")?),
        root_comment_id: Set(opt_uuid(c, "root_comment_id")?),
        reply_to_comment_id: Set(opt_uuid(c, "reply_to_comment_id")?),
        author_name: Set(str_field(c, "author_name")?),
        author_type: Set(parse_comment_author_type(&str_field(c, "author_type")?)?),
        password_hash: Set(opt_str(c, "password_hash")),
        visibility: Set(parse_comment_visibility(&str_field(c, "visibility")?)?),
        status: Set(parse_comment_status(&str_field(c, "status")?)?),
        body: Set(str_field(c, "body")?),
        deleted_at: Set(opt_iso(c, "deleted_at")?),
        last_edited_at: Set(opt_iso(c, "last_edited_at")?),
        request_ip_hash: Set(opt_str(c, "request_ip_hash")),
        user_agent_hash: Set(opt_str(c, "user_agent_hash")),
        ..Default::default()
    }
    .insert(tx)
    .await?;
    Ok(())
}

// ── Field accessors for Value-shaped JSON ──────────────────────────────────

fn enum_error(kind: &str, value: &str) -> AppError {
    AppError::BadRequest(format!("backup payload has invalid {kind} `{value}`"))
}

fn parse_post_top_media_kind(value: &str) -> Result<DbPostTopMediaKind, AppError> {
    match value {
        "image" => Ok(DbPostTopMediaKind::Image),
        "youtube" => Ok(DbPostTopMediaKind::Youtube),
        "video" => Ok(DbPostTopMediaKind::Video),
        _ => Err(enum_error("post_top_media_kind", value)),
    }
}

fn parse_post_locale(value: &str) -> Result<DbPostLocale, AppError> {
    match value {
        "ko" => Ok(DbPostLocale::Ko),
        "en" => Ok(DbPostLocale::En),
        "ja" => Ok(DbPostLocale::Ja),
        "zh" => Ok(DbPostLocale::Zh),
        _ => Err(enum_error("post_locale", value)),
    }
}

fn parse_translation_status(value: &str) -> Result<DbPostTranslationStatus, AppError> {
    match value {
        "source" => Ok(DbPostTranslationStatus::Source),
        "synced" => Ok(DbPostTranslationStatus::Synced),
        "stale" => Ok(DbPostTranslationStatus::Stale),
        "failed" => Ok(DbPostTranslationStatus::Failed),
        _ => Err(enum_error("post_translation_status", value)),
    }
}

fn parse_translation_source_kind(value: &str) -> Result<DbPostTranslationSourceKind, AppError> {
    match value {
        "manual" => Ok(DbPostTranslationSourceKind::Manual),
        "machine" => Ok(DbPostTranslationSourceKind::Machine),
        _ => Err(enum_error("post_translation_source_kind", value)),
    }
}

fn parse_post_content_kind(value: &str) -> Result<DbPostContentKind, AppError> {
    match value {
        "blog" => Ok(DbPostContentKind::Blog),
        "project" => Ok(DbPostContentKind::Project),
        _ => Err(enum_error("post_content_kind", value)),
    }
}

fn parse_post_status(value: &str) -> Result<DbPostStatus, AppError> {
    match value {
        "draft" => Ok(DbPostStatus::Draft),
        "published" => Ok(DbPostStatus::Published),
        "archived" => Ok(DbPostStatus::Archived),
        _ => Err(enum_error("post_status", value)),
    }
}

fn parse_post_visibility(value: &str) -> Result<DbPostVisibility, AppError> {
    match value {
        "public" => Ok(DbPostVisibility::Public),
        "private" => Ok(DbPostVisibility::Private),
        _ => Err(enum_error("post_visibility", value)),
    }
}

fn parse_asset_kind(value: &str) -> Result<DbAssetKind, AppError> {
    match value {
        "image" => Ok(DbAssetKind::Image),
        "video" => Ok(DbAssetKind::Video),
        "file" => Ok(DbAssetKind::File),
        _ => Err(enum_error("asset_kind", value)),
    }
}

fn parse_comment_author_type(value: &str) -> Result<DbCommentAuthorType, AppError> {
    match value {
        "guest" => Ok(DbCommentAuthorType::Guest),
        "admin" => Ok(DbCommentAuthorType::Admin),
        _ => Err(enum_error("post_comment_author_type", value)),
    }
}

fn parse_comment_visibility(value: &str) -> Result<DbCommentVisibility, AppError> {
    match value {
        "public" => Ok(DbCommentVisibility::Public),
        "private" => Ok(DbCommentVisibility::Private),
        _ => Err(enum_error("post_comment_visibility", value)),
    }
}

fn parse_comment_status(value: &str) -> Result<DbCommentStatus, AppError> {
    match value {
        "active" => Ok(DbCommentStatus::Active),
        "deleted" => Ok(DbCommentStatus::Deleted),
        _ => Err(enum_error("post_comment_status", value)),
    }
}

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
