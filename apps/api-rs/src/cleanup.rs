use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;

use chrono::{DateTime, Local, NaiveDate, NaiveDateTime, NaiveTime, TimeZone, Utc};
use rand::Rng;
use sqlx::{FromRow, PgPool};
use tokio::time::sleep;
use tracing::{info, warn};
use uuid::Uuid;

use crate::config::MinioSettings;
use crate::error::AppError;
use crate::media as media_helpers;
use crate::media_refs::{extract_markdown_keys, extract_object_key};

#[derive(Debug, Clone)]
pub struct CleanupSettings {
    pub draft_retention_days: i64,
    pub media_orphan_retention_days: i64,
    pub slug_redirect_min_age_days: i64,
    pub slug_redirect_idle_days: i64,
    pub draft_cleanup_start_hour: u32,
    pub draft_cleanup_end_hour: u32,
}

impl CleanupSettings {
    pub fn from_env() -> Self {
        fn read_i64(key: &str, default: i64, min: i64) -> i64 {
            std::env::var(key)
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(default)
                .max(min)
        }
        fn read_hour(key: &str, default: u32) -> u32 {
            std::env::var(key)
                .ok()
                .and_then(|s| s.parse::<u32>().ok())
                .unwrap_or(default)
                .min(23)
        }
        Self {
            draft_retention_days: read_i64("DRAFT_RETENTION_DAYS", 7, 1),
            media_orphan_retention_days: read_i64("MEDIA_ORPHAN_RETENTION_DAYS", 7, 1),
            slug_redirect_min_age_days: read_i64("SLUG_REDIRECT_MIN_AGE_DAYS", 90, 1),
            slug_redirect_idle_days: read_i64("SLUG_REDIRECT_IDLE_DAYS", 30, 1),
            draft_cleanup_start_hour: read_hour("DRAFT_CLEANUP_START_HOUR", 0),
            draft_cleanup_end_hour: read_hour("DRAFT_CLEANUP_END_HOUR", 5),
        }
    }
}

/// Pick a random instant within today's [start_hour, end_hour] window in the
/// process's local timezone. If the window has already passed today (or
/// `last_run_local_date` already covered today), advance to the next day.
fn next_run_at(
    now_local: DateTime<Local>,
    last_run_local_date: Option<NaiveDate>,
    settings: &CleanupSettings,
) -> DateTime<Local> {
    let mut start_hour = settings.draft_cleanup_start_hour;
    let mut end_hour = settings.draft_cleanup_end_hour;
    if end_hour < start_hour {
        std::mem::swap(&mut start_hour, &mut end_hour);
    }

    let mut candidate_date = now_local.date_naive();
    if let Some(last) = last_run_local_date {
        if candidate_date <= last {
            candidate_date = last.succ_opt().unwrap_or(candidate_date);
        }
    }

    loop {
        let window_start = NaiveDateTime::new(
            candidate_date,
            NaiveTime::from_hms_opt(start_hour, 0, 0).unwrap(),
        );
        let window_end = NaiveDateTime::new(
            candidate_date,
            NaiveTime::from_hms_opt(end_hour, 59, 59).unwrap(),
        );
        let window_start_local = Local
            .from_local_datetime(&window_start)
            .single()
            .unwrap_or_else(|| now_local + chrono::Duration::seconds(1));
        let window_end_local = Local
            .from_local_datetime(&window_end)
            .single()
            .unwrap_or(window_start_local);

        let schedule_start = if candidate_date == now_local.date_naive() {
            if now_local > window_end_local {
                candidate_date = candidate_date.succ_opt().unwrap();
                continue;
            }
            window_start_local.max(now_local + chrono::Duration::seconds(1))
        } else {
            window_start_local
        };
        if schedule_start > window_end_local {
            candidate_date = candidate_date.succ_opt().unwrap();
            continue;
        }
        let start_ts = schedule_start.timestamp();
        let end_ts = window_end_local.timestamp().max(start_ts + 1);
        let target_ts = rand::thread_rng().gen_range(start_ts..=end_ts);
        return Local
            .timestamp_opt(target_ts, 0)
            .single()
            .unwrap_or(schedule_start);
    }
}

async fn sleep_until(when: DateTime<Local>) {
    let now = Local::now();
    let secs = (when - now).num_seconds().max(1) as u64;
    sleep(Duration::from_secs(secs)).await;
}

// ── Draft + orphan media cleanup ────────────────────────────────────────────

pub fn spawn_draft_cleanup(
    pool: PgPool,
    minio: Arc<MinioSettings>,
    settings: Arc<CleanupSettings>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut last_run: Option<NaiveDate> = None;
        loop {
            let next = next_run_at(Local::now(), last_run, &settings);
            info!(scheduled_for = %next.to_rfc3339(), "draft cleanup scheduled");
            sleep_until(next).await;
            match purge_maintenance(&pool, &minio, &settings).await {
                Ok((drafts, media)) => info!(
                    deleted_drafts = drafts,
                    deleted_media = media,
                    "draft/media cleanup completed"
                ),
                Err(err) => warn!(error = %err, "draft cleanup failed"),
            }
            last_run = Some(Local::now().date_naive());
        }
    })
}

async fn purge_maintenance(
    pool: &PgPool,
    minio: &MinioSettings,
    settings: &CleanupSettings,
) -> Result<(i64, i64), AppError> {
    let drafts = purge_expired_drafts(pool, settings.draft_retention_days).await?;
    let media = purge_orphan_media(pool, minio, settings.media_orphan_retention_days).await?;
    Ok((drafts, media))
}

pub async fn purge_expired_drafts(
    pool: &PgPool,
    retention_days: i64,
) -> Result<i64, sqlx::Error> {
    let cutoff = Utc::now() - chrono::Duration::days(retention_days.max(1));
    let result = sqlx::query(
        r#"
        DELETE FROM posts
        WHERE status = 'draft'::post_status
          AND updated_at < $1
        "#,
    )
    .bind(cutoff)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() as i64)
}

#[derive(FromRow)]
struct ReferenceRow {
    cover_image_url: Option<String>,
    top_media_image_url: Option<String>,
    top_media_video_url: Option<String>,
    body_markdown: String,
}

#[derive(FromRow)]
struct ProfileImageRow {
    card_image_url: String,
}

#[derive(FromRow)]
struct SeriesCoverRow {
    cover_image_url: Option<String>,
}

#[derive(FromRow)]
struct StaleMediaRow {
    id: Uuid,
    object_key: String,
}

pub async fn purge_orphan_media(
    pool: &PgPool,
    minio: &MinioSettings,
    retention_days: i64,
) -> Result<i64, AppError> {
    let referenced = collect_referenced_keys(pool).await?;
    let cutoff = Utc::now() - chrono::Duration::days(retention_days.max(1));
    let stale: Vec<StaleMediaRow> = sqlx::query_as(
        "SELECT id, object_key FROM media_assets WHERE updated_at < $1",
    )
    .bind(cutoff)
    .fetch_all(pool)
    .await?;

    let mut deleted = 0i64;
    for row in stale {
        if referenced.contains(&row.object_key) {
            continue;
        }
        if media_helpers::object_exists(minio, &row.object_key).await? {
            media_helpers::delete_object(minio, &row.object_key).await?;
        }
        sqlx::query("DELETE FROM media_assets WHERE id = $1")
            .bind(row.id)
            .execute(pool)
            .await?;
        deleted += 1;
    }
    Ok(deleted)
}

async fn collect_referenced_keys(pool: &PgPool) -> Result<HashSet<String>, sqlx::Error> {
    let mut keys: HashSet<String> = HashSet::new();

    let posts: Vec<ReferenceRow> = sqlx::query_as(
        "SELECT cover_image_url, top_media_image_url, top_media_video_url, body_markdown FROM posts",
    )
    .fetch_all(pool)
    .await?;
    for post in &posts {
        for url in [
            post.cover_image_url.as_deref(),
            post.top_media_image_url.as_deref(),
            post.top_media_video_url.as_deref(),
        ] {
            if let Some(key) = extract_object_key(url) {
                keys.insert(key);
            }
        }
        for key in extract_markdown_keys(&post.body_markdown) {
            keys.insert(key);
        }
    }

    let profiles: Vec<ProfileImageRow> =
        sqlx::query_as("SELECT card_image_url FROM project_profiles")
            .fetch_all(pool)
            .await?;
    for p in &profiles {
        if let Some(key) = extract_object_key(Some(&p.card_image_url)) {
            keys.insert(key);
        }
    }

    let series_rows: Vec<SeriesCoverRow> =
        sqlx::query_as("SELECT cover_image_url FROM series")
            .fetch_all(pool)
            .await?;
    for s in &series_rows {
        if let Some(key) = extract_object_key(s.cover_image_url.as_deref()) {
            keys.insert(key);
        }
    }
    Ok(keys)
}

// ── Slug redirect cleanup ──────────────────────────────────────────────────

pub fn spawn_slug_redirect_cleanup(
    pool: PgPool,
    settings: Arc<CleanupSettings>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut last_run: Option<NaiveDate> = None;
        loop {
            let next = next_run_at(Local::now(), last_run, &settings);
            info!(scheduled_for = %next.to_rfc3339(), "slug redirect cleanup scheduled");
            sleep_until(next).await;
            match purge_expired_redirects(&pool, &settings).await {
                Ok((posts, series)) => info!(
                    deleted_post_redirects = posts,
                    deleted_series_redirects = series,
                    "slug redirect cleanup completed"
                ),
                Err(err) => warn!(error = %err, "slug redirect cleanup failed"),
            }
            last_run = Some(Local::now().date_naive());
        }
    })
}

async fn purge_expired_redirects(
    pool: &PgPool,
    settings: &CleanupSettings,
) -> Result<(i64, i64), sqlx::Error> {
    let now = Utc::now();
    let age_cutoff = now - chrono::Duration::days(settings.slug_redirect_min_age_days.max(1));
    let idle_cutoff = now - chrono::Duration::days(settings.slug_redirect_idle_days.max(1));

    let posts = sqlx::query(
        r#"
        DELETE FROM post_slug_redirects
        WHERE created_at < $1
          AND (last_hit_at IS NULL OR last_hit_at < $2)
        "#,
    )
    .bind(age_cutoff)
    .bind(idle_cutoff)
    .execute(pool)
    .await?
    .rows_affected() as i64;

    let series = sqlx::query(
        r#"
        DELETE FROM series_slug_redirects
        WHERE created_at < $1
          AND (last_hit_at IS NULL OR last_hit_at < $2)
        "#,
    )
    .bind(age_cutoff)
    .bind(idle_cutoff)
    .execute(pool)
    .await?
    .rows_affected() as i64;

    Ok((posts, series))
}
