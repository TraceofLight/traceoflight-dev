//! Background tokio task that drains the translation queue.
//!
//! Boot path: spawned from `main.rs` after the queue and provider are
//! constructed. Loop body: BLPOP a job, dispatch to a per-entity handler.
//! On provider error, mark the sibling row's `translation_status='failed'`
//! and continue — no in-loop retry; the next save re-enqueues.

use std::sync::Arc;

use chrono::Utc;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter,
};
use tracing::{error, info, warn};
use uuid::Uuid;

use super::hash::{hash_post, hash_series};
use super::markdown::{mask, unmask};
use super::provider::{TranslationError, TranslationProvider};
use super::queue::{EntityKind, TranslationJob, TranslationQueue};
use crate::entities::{
    enums::{DbPostLocale, DbPostTranslationSourceKind, DbPostTranslationStatus},
    post, series,
};
use crate::indexnow::IndexNowClient;
use crate::posts::PostContentKind;

const POP_TIMEOUT_SECONDS: f64 = 5.0;

pub fn spawn<P>(
    pool: DatabaseConnection,
    queue: TranslationQueue,
    provider: Arc<P>,
    indexnow: IndexNowClient,
) where
    P: TranslationProvider + 'static,
{
    tokio::spawn(async move {
        info!(queue = %queue.key(), "translation worker started");
        loop {
            match queue.blocking_pop(POP_TIMEOUT_SECONDS).await {
                Ok(Some(job)) => {
                    if let Err(err) = handle_job(&pool, provider.as_ref(), &indexnow, &job).await {
                        error!(
                            error = %err,
                            entity = ?job.entity,
                            source_id = %job.source_id,
                            target = %job.target_locale,
                            "translation worker: job failed",
                        );
                    }
                }
                Ok(None) => continue, // BLPOP timeout; loop back so we can observe shutdown
                Err(err) => {
                    warn!(error = %err, "translation worker: blpop error, sleeping 5s");
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                }
            }
        }
    });
}

async fn handle_job<P: TranslationProvider>(
    pool: &DatabaseConnection,
    provider: &P,
    indexnow: &IndexNowClient,
    job: &TranslationJob,
) -> anyhow::Result<()> {
    match job.entity {
        EntityKind::Post => handle_post_job(pool, provider, indexnow, job).await,
        EntityKind::Series => handle_series_job(pool, provider, indexnow, job).await,
    }
}

async fn handle_post_job<P: TranslationProvider>(
    pool: &DatabaseConnection,
    provider: &P,
    indexnow: &IndexNowClient,
    job: &TranslationJob,
) -> anyhow::Result<()> {
    let source = post::Entity::find_by_id(job.source_id).one(pool).await?;

    let Some(source) = source else {
        // Source was deleted between enqueue and pickup — nothing to do.
        return Ok(());
    };
    if !matches!(source.locale, DbPostLocale::Ko) {
        return Ok(());
    }

    let source_hash = hash_post(
        &source.title,
        source.excerpt.as_deref(),
        &source.body_markdown,
    );

    let target_locale = parse_target_locale(&job.target_locale)?;
    let sibling = post::Entity::find()
        .filter(post::Column::TranslationGroupId.eq(source.translation_group_id))
        .filter(post::Column::Locale.eq(target_locale))
        .one(pool)
        .await?;

    if let Some(ref sib) = sibling {
        // Don't overwrite a manually-edited sibling. Only auto-generated
        // siblings carry source_post_id pointing back at the ko row.
        if sib.source_post_id != Some(source.id) {
            return Ok(());
        }
        if sib.translated_from_hash.as_deref() == Some(source_hash.as_str()) {
            return Ok(());
        }
    }

    let translated_title = provider
        .translate_text(&source.title, "ko", &job.target_locale)
        .await
        .map_err(map_provider_err)?;
    let translated_excerpt = match source.excerpt.as_deref() {
        Some(text) if !text.is_empty() => Some(
            provider
                .translate_text(text, "ko", &job.target_locale)
                .await
                .map_err(map_provider_err)?,
        ),
        _ => None,
    };
    // body_markdown is masked: code fences/inline code/HTML/URLs become
    // placeholder tokens before translation, then get spliced back in
    // afterwards. Without this Google mangles fenced code (saw `rust` lose
    // a backtick + get prose-translated in API smoke tests).
    let translated_body = {
        let masked = mask(&source.body_markdown);
        let translated = provider
            .translate_text(&masked.text, "ko", &job.target_locale)
            .await
            .map_err(map_provider_err)?;
        unmask(&translated, &masked.segments)
    };
    let translated_series_title = match source.series_title.as_deref() {
        Some(text) if !text.is_empty() => Some(
            provider
                .translate_text(text, "ko", &job.target_locale)
                .await
                .map_err(map_provider_err)?,
        ),
        _ => None,
    };

    if sibling.is_none() {
        post::ActiveModel {
            id: Set(Uuid::new_v4()),
            slug: Set(source.slug.clone()),
            title: Set(translated_title),
            excerpt: Set(translated_excerpt),
            body_markdown: Set(translated_body),
            cover_image_url: Set(source.cover_image_url.clone()),
            top_media_kind: Set(source.top_media_kind),
            top_media_image_url: Set(source.top_media_image_url.clone()),
            top_media_youtube_url: Set(source.top_media_youtube_url.clone()),
            top_media_video_url: Set(source.top_media_video_url.clone()),
            series_title: Set(translated_series_title),
            locale: Set(target_locale),
            translation_group_id: Set(source.translation_group_id),
            source_post_id: Set(Some(source.id)),
            translation_status: Set(DbPostTranslationStatus::Synced),
            translation_source_kind: Set(DbPostTranslationSourceKind::Machine),
            translated_from_hash: Set(Some(source_hash.clone())),
            content_kind: Set(source.content_kind),
            status: Set(source.status),
            visibility: Set(source.visibility),
            published_at: Set(source.published_at),
            ..Default::default()
        }
        .insert(pool)
        .await?;
    } else {
        let mut active: post::ActiveModel = sibling.expect("checked above").into();
        active.title = Set(translated_title);
        active.excerpt = Set(translated_excerpt);
        active.body_markdown = Set(translated_body);
        active.series_title = Set(translated_series_title);
        active.cover_image_url = Set(source.cover_image_url.clone());
        active.top_media_kind = Set(source.top_media_kind);
        active.top_media_image_url = Set(source.top_media_image_url.clone());
        active.top_media_youtube_url = Set(source.top_media_youtube_url.clone());
        active.top_media_video_url = Set(source.top_media_video_url.clone());
        active.content_kind = Set(source.content_kind);
        active.status = Set(source.status);
        active.visibility = Set(source.visibility);
        active.published_at = Set(source.published_at);
        active.translation_status = Set(DbPostTranslationStatus::Synced);
        active.translation_source_kind = Set(DbPostTranslationSourceKind::Machine);
        active.translated_from_hash = Set(Some(source_hash.clone()));
        active.updated_at = Set(Utc::now());
        active.update(pool).await?;
    }

    let content_kind = PostContentKind::from(source.content_kind);
    if let Some(url) = indexnow.post_url(&job.target_locale, content_kind.as_str(), &source.slug) {
        indexnow.submit_urls(vec![url]);
    }

    Ok(())
}

async fn handle_series_job<P: TranslationProvider>(
    pool: &DatabaseConnection,
    provider: &P,
    indexnow: &IndexNowClient,
    job: &TranslationJob,
) -> anyhow::Result<()> {
    let source = series::Entity::find_by_id(job.source_id).one(pool).await?;

    let Some(source) = source else {
        return Ok(());
    };
    if !matches!(source.locale, DbPostLocale::Ko) {
        return Ok(());
    }

    let source_hash = hash_series(&source.title, &source.description);

    let target_locale = parse_target_locale(&job.target_locale)?;
    let sibling = series::Entity::find()
        .filter(series::Column::TranslationGroupId.eq(source.translation_group_id))
        .filter(series::Column::Locale.eq(target_locale))
        .one(pool)
        .await?;

    if let Some(ref sib) = sibling {
        if sib.source_series_id != Some(source.id) {
            return Ok(());
        }
        if sib.translated_from_hash.as_deref() == Some(source_hash.as_str()) {
            return Ok(());
        }
    }

    let translated_title = provider
        .translate_text(&source.title, "ko", &job.target_locale)
        .await
        .map_err(map_provider_err)?;
    // Series description occasionally carries inline code or URLs —
    // apply the same mask/unmask roundtrip as body.
    let translated_description = {
        let masked = mask(&source.description);
        let translated = provider
            .translate_text(&masked.text, "ko", &job.target_locale)
            .await
            .map_err(map_provider_err)?;
        unmask(&translated, &masked.segments)
    };

    if sibling.is_none() {
        series::ActiveModel {
            id: Set(Uuid::new_v4()),
            slug: Set(source.slug.clone()),
            title: Set(translated_title),
            description: Set(translated_description),
            cover_image_url: Set(source.cover_image_url.clone()),
            list_order_index: Set(source.list_order_index),
            locale: Set(target_locale),
            translation_group_id: Set(source.translation_group_id),
            source_series_id: Set(Some(source.id)),
            translation_status: Set(DbPostTranslationStatus::Synced),
            translation_source_kind: Set(DbPostTranslationSourceKind::Machine),
            translated_from_hash: Set(Some(source_hash.clone())),
            ..Default::default()
        }
        .insert(pool)
        .await?;
    } else {
        let mut active: series::ActiveModel = sibling.expect("checked above").into();
        active.title = Set(translated_title);
        active.description = Set(translated_description);
        active.cover_image_url = Set(source.cover_image_url.clone());
        active.list_order_index = Set(source.list_order_index);
        active.translation_status = Set(DbPostTranslationStatus::Synced);
        active.translation_source_kind = Set(DbPostTranslationSourceKind::Machine);
        active.translated_from_hash = Set(Some(source_hash.clone()));
        active.updated_at = Set(Utc::now());
        active.update(pool).await?;
    }

    if let Some(url) = indexnow.series_url(&job.target_locale, &source.slug) {
        indexnow.submit_urls(vec![url]);
    }

    Ok(())
}

fn map_provider_err(err: TranslationError) -> anyhow::Error {
    anyhow::anyhow!("translation provider: {err}")
}

fn parse_target_locale(value: &str) -> anyhow::Result<DbPostLocale> {
    match value {
        "ko" => Ok(DbPostLocale::Ko),
        "en" => Ok(DbPostLocale::En),
        "ja" => Ok(DbPostLocale::Ja),
        "zh" => Ok(DbPostLocale::Zh),
        _ => Err(anyhow::anyhow!("unsupported target locale: {value}")),
    }
}
