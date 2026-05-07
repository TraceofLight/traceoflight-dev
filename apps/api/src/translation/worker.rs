//! Background tokio task that drains the translation queue.
//!
//! Boot path: spawned from `main.rs` after the queue and provider are
//! constructed. Loop body: BLPOP a job, dispatch to a per-entity handler.
//! On provider error, mark the sibling row's `translation_status='failed'`
//! and continue — no in-loop retry; the next save re-enqueues.

use std::sync::Arc;

use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};
use tracing::{error, info, warn};
use uuid::Uuid;

use super::hash::{hash_post, hash_series};
use super::markdown::{mask, unmask};
use super::provider::{TranslationError, TranslationProvider};
use super::queue::{EntityKind, TranslationJob, TranslationQueue};

const POP_TIMEOUT_SECONDS: f64 = 5.0;

pub fn spawn<P>(pool: PgPool, queue: TranslationQueue, provider: Arc<P>)
where
    P: TranslationProvider + 'static,
{
    tokio::spawn(async move {
        info!(queue = %queue.key(), "translation worker started");
        loop {
            match queue.blocking_pop(POP_TIMEOUT_SECONDS).await {
                Ok(Some(job)) => {
                    if let Err(err) = handle_job(&pool, provider.as_ref(), &job).await {
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
    pool: &PgPool,
    provider: &P,
    job: &TranslationJob,
) -> anyhow::Result<()> {
    match job.entity {
        EntityKind::Post => handle_post_job(pool, provider, job).await,
        EntityKind::Series => handle_series_job(pool, provider, job).await,
    }
}

#[derive(Debug, FromRow)]
struct PostSourceRow {
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
    series_title: Option<String>,
    translation_group_id: Uuid,
    content_kind: String,
    status: String,
    visibility: String,
    published_at: Option<DateTime<Utc>>,
    locale: String,
}

#[derive(Debug, FromRow)]
struct PostSiblingRow {
    translated_from_hash: Option<String>,
    source_post_id: Option<Uuid>,
}

async fn handle_post_job<P: TranslationProvider>(
    pool: &PgPool,
    provider: &P,
    job: &TranslationJob,
) -> anyhow::Result<()> {
    let source = sqlx::query_as::<_, PostSourceRow>(
        r#"
        SELECT id, slug, title, excerpt, body_markdown, cover_image_url,
               top_media_kind::text AS top_media_kind,
               top_media_image_url, top_media_youtube_url, top_media_video_url,
               series_title, translation_group_id,
               content_kind::text AS content_kind,
               status::text AS status,
               visibility::text AS visibility,
               published_at,
               locale::text AS locale
        FROM posts WHERE id = $1
        "#,
    )
    .bind(job.source_id)
    .fetch_optional(pool)
    .await?;

    let Some(source) = source else {
        // Source was deleted between enqueue and pickup — nothing to do.
        return Ok(());
    };
    if source.locale != "ko" {
        return Ok(());
    }

    let source_hash = hash_post(&source.title, source.excerpt.as_deref(), &source.body_markdown);

    let sibling = sqlx::query_as::<_, PostSiblingRow>(
        r#"
        SELECT translated_from_hash, source_post_id
        FROM posts
        WHERE translation_group_id = $1
          AND locale = $2::post_locale
        LIMIT 1
        "#,
    )
    .bind(source.translation_group_id)
    .bind(&job.target_locale)
    .fetch_optional(pool)
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

    let mut tx = pool.begin().await?;
    if sibling.is_none() {
        sqlx::query(
            r#"
            INSERT INTO posts (
                id, slug, title, excerpt, body_markdown, cover_image_url,
                top_media_kind, top_media_image_url, top_media_youtube_url, top_media_video_url,
                series_title, locale, translation_group_id, source_post_id,
                translation_status, translation_source_kind, translated_from_hash,
                content_kind, status, visibility, published_at
            ) VALUES (
                gen_random_uuid(), $1, $2, $3, $4, $5,
                $6::post_top_media_kind, $7, $8, $9,
                $10, $11::post_locale, $12, $13,
                'translated'::post_translation_status, 'auto'::post_translation_source_kind, $14,
                $15::post_content_kind, $16::post_status, $17::post_visibility, $18
            )
            "#,
        )
        .bind(&source.slug)
        .bind(&translated_title)
        .bind(&translated_excerpt)
        .bind(&translated_body)
        .bind(&source.cover_image_url)
        .bind(&source.top_media_kind)
        .bind(&source.top_media_image_url)
        .bind(&source.top_media_youtube_url)
        .bind(&source.top_media_video_url)
        .bind(&translated_series_title)
        .bind(&job.target_locale)
        .bind(source.translation_group_id)
        .bind(source.id)
        .bind(&source_hash)
        .bind(&source.content_kind)
        .bind(&source.status)
        .bind(&source.visibility)
        .bind(source.published_at)
        .execute(&mut *tx)
        .await?;
    } else {
        sqlx::query(
            r#"
            UPDATE posts SET
                title = $1,
                excerpt = $2,
                body_markdown = $3,
                series_title = $4,
                cover_image_url = $5,
                top_media_kind = $6::post_top_media_kind,
                top_media_image_url = $7,
                top_media_youtube_url = $8,
                top_media_video_url = $9,
                content_kind = $10::post_content_kind,
                status = $11::post_status,
                visibility = $12::post_visibility,
                published_at = $13,
                translation_status = 'translated'::post_translation_status,
                translation_source_kind = 'auto'::post_translation_source_kind,
                translated_from_hash = $14,
                updated_at = NOW()
            WHERE translation_group_id = $15 AND locale = $16::post_locale
            "#,
        )
        .bind(&translated_title)
        .bind(&translated_excerpt)
        .bind(&translated_body)
        .bind(&translated_series_title)
        .bind(&source.cover_image_url)
        .bind(&source.top_media_kind)
        .bind(&source.top_media_image_url)
        .bind(&source.top_media_youtube_url)
        .bind(&source.top_media_video_url)
        .bind(&source.content_kind)
        .bind(&source.status)
        .bind(&source.visibility)
        .bind(source.published_at)
        .bind(&source_hash)
        .bind(source.translation_group_id)
        .bind(&job.target_locale)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;

    Ok(())
}

#[derive(Debug, FromRow)]
struct SeriesSourceRow {
    id: Uuid,
    slug: String,
    title: String,
    description: String,
    cover_image_url: Option<String>,
    list_order_index: Option<i32>,
    translation_group_id: Uuid,
    locale: String,
}

#[derive(Debug, FromRow)]
struct SeriesSiblingRow {
    translated_from_hash: Option<String>,
    source_series_id: Option<Uuid>,
}

async fn handle_series_job<P: TranslationProvider>(
    pool: &PgPool,
    provider: &P,
    job: &TranslationJob,
) -> anyhow::Result<()> {
    let source = sqlx::query_as::<_, SeriesSourceRow>(
        r#"
        SELECT id, slug, title, description, cover_image_url, list_order_index,
               translation_group_id, locale::text AS locale
        FROM series WHERE id = $1
        "#,
    )
    .bind(job.source_id)
    .fetch_optional(pool)
    .await?;

    let Some(source) = source else {
        return Ok(());
    };
    if source.locale != "ko" {
        return Ok(());
    }

    let source_hash = hash_series(&source.title, &source.description);

    let sibling = sqlx::query_as::<_, SeriesSiblingRow>(
        r#"
        SELECT translated_from_hash, source_series_id
        FROM series
        WHERE translation_group_id = $1
          AND locale = $2::post_locale
        LIMIT 1
        "#,
    )
    .bind(source.translation_group_id)
    .bind(&job.target_locale)
    .fetch_optional(pool)
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

    let mut tx = pool.begin().await?;
    if sibling.is_none() {
        sqlx::query(
            r#"
            INSERT INTO series (
                id, slug, title, description, cover_image_url, list_order_index,
                locale, translation_group_id, source_series_id,
                translation_status, translation_source_kind, translated_from_hash
            ) VALUES (
                gen_random_uuid(), $1, $2, $3, $4, $5,
                $6::post_locale, $7, $8,
                'translated'::post_translation_status, 'auto'::post_translation_source_kind, $9
            )
            "#,
        )
        .bind(&source.slug)
        .bind(&translated_title)
        .bind(&translated_description)
        .bind(&source.cover_image_url)
        .bind(source.list_order_index)
        .bind(&job.target_locale)
        .bind(source.translation_group_id)
        .bind(source.id)
        .bind(&source_hash)
        .execute(&mut *tx)
        .await?;
    } else {
        sqlx::query(
            r#"
            UPDATE series SET
                title = $1,
                description = $2,
                cover_image_url = $3,
                list_order_index = $4,
                translation_status = 'translated'::post_translation_status,
                translation_source_kind = 'auto'::post_translation_source_kind,
                translated_from_hash = $5,
                updated_at = NOW()
            WHERE translation_group_id = $6 AND locale = $7::post_locale
            "#,
        )
        .bind(&translated_title)
        .bind(&translated_description)
        .bind(&source.cover_image_url)
        .bind(source.list_order_index)
        .bind(&source_hash)
        .bind(source.translation_group_id)
        .bind(&job.target_locale)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;

    Ok(())
}

fn map_provider_err(err: TranslationError) -> anyhow::Error {
    anyhow::anyhow!("translation provider: {err}")
}
