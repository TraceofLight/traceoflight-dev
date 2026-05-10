//! Background cleanup loops: draft/orphan-media retention and slug-redirect GC.
//! Loops are gated to a configured local-time window to keep prod load off-peak.

use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;

use chrono::{DateTime, Local, NaiveDate, NaiveDateTime, NaiveTime, TimeZone, Utc};
use rand::Rng;
use sea_orm::{ColumnTrait, Condition, DatabaseConnection, DbErr, EntityTrait, QueryFilter};
use tokio::time::sleep;
use tracing::{debug, info, warn};

use crate::config::MinioSettings;
use crate::entities::{
    enums::DbPostStatus, media_asset, post, post_slug_redirect, project_profile, series,
    series_slug_redirect,
};
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
    pool: DatabaseConnection,
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
    pool: &DatabaseConnection,
    minio: &MinioSettings,
    settings: &CleanupSettings,
) -> Result<(i64, i64), AppError> {
    let drafts = purge_expired_drafts(pool, settings.draft_retention_days).await?;
    let media = purge_orphan_media(pool, minio, settings.media_orphan_retention_days).await?;
    Ok((drafts, media))
}

pub async fn purge_expired_drafts(
    pool: &DatabaseConnection,
    retention_days: i64,
) -> Result<i64, DbErr> {
    let cutoff = Utc::now() - chrono::Duration::days(retention_days.max(1));
    let result = post::Entity::delete_many()
        .filter(post::Column::Status.eq(DbPostStatus::Draft))
        .filter(post::Column::UpdatedAt.lt(cutoff))
        .exec(pool)
        .await?;
    let deleted = result.rows_affected as i64;
    debug!(
        event = "cleanup.expired_drafts_purged",
        deleted_count = deleted,
        retention_days = retention_days.max(1),
        "expired drafts purge completed"
    );
    Ok(deleted)
}

pub async fn purge_orphan_media(
    pool: &DatabaseConnection,
    minio: &MinioSettings,
    retention_days: i64,
) -> Result<i64, AppError> {
    let referenced = collect_referenced_keys(pool).await?;
    let cutoff = Utc::now() - chrono::Duration::days(retention_days.max(1));
    let stale = media_asset::Entity::find()
        .filter(media_asset::Column::UpdatedAt.lt(cutoff))
        .all(pool)
        .await?;
    let stale_count = stale.len();

    let mut deleted = 0i64;
    for row in stale {
        if referenced.contains(&row.object_key) {
            continue;
        }
        if media_helpers::object_exists(minio, &row.object_key).await? {
            media_helpers::delete_object(minio, &row.object_key).await?;
        }
        media_asset::Entity::delete_by_id(row.id).exec(pool).await?;
        deleted += 1;
    }
    debug!(
        event = "cleanup.orphan_media_scan_completed",
        referenced_count = referenced.len(),
        stale_count,
        deleted_count = deleted,
        retention_days = retention_days.max(1),
        "orphan media cleanup scan completed"
    );
    Ok(deleted)
}

async fn collect_referenced_keys(pool: &DatabaseConnection) -> Result<HashSet<String>, DbErr> {
    let mut keys: HashSet<String> = HashSet::new();

    let posts = post::Entity::find().all(pool).await?;
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

    let profiles = project_profile::Entity::find().all(pool).await?;
    for p in &profiles {
        if let Some(key) = extract_object_key(p.card_image_url.as_deref()) {
            keys.insert(key);
        }
    }

    let series_rows = series::Entity::find().all(pool).await?;
    for s in &series_rows {
        if let Some(key) = extract_object_key(s.cover_image_url.as_deref()) {
            keys.insert(key);
        }
    }
    Ok(keys)
}

// ── Slug redirect cleanup ──────────────────────────────────────────────────

pub fn spawn_slug_redirect_cleanup(
    pool: DatabaseConnection,
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
    pool: &DatabaseConnection,
    settings: &CleanupSettings,
) -> Result<(i64, i64), DbErr> {
    let now = Utc::now();
    let age_cutoff = now - chrono::Duration::days(settings.slug_redirect_min_age_days.max(1));
    let idle_cutoff = now - chrono::Duration::days(settings.slug_redirect_idle_days.max(1));

    let idle_condition = Condition::any()
        .add(post_slug_redirect::Column::LastHitAt.is_null())
        .add(post_slug_redirect::Column::LastHitAt.lt(idle_cutoff));
    let posts = post_slug_redirect::Entity::delete_many()
        .filter(post_slug_redirect::Column::CreatedAt.lt(age_cutoff))
        .filter(idle_condition)
        .exec(pool)
        .await?
        .rows_affected as i64;

    let idle_condition = Condition::any()
        .add(series_slug_redirect::Column::LastHitAt.is_null())
        .add(series_slug_redirect::Column::LastHitAt.lt(idle_cutoff));
    let series = series_slug_redirect::Entity::delete_many()
        .filter(series_slug_redirect::Column::CreatedAt.lt(age_cutoff))
        .filter(idle_condition)
        .exec(pool)
        .await?
        .rows_affected as i64;

    debug!(
        event = "cleanup.slug_redirect_scan_completed",
        deleted_post_redirects = posts,
        deleted_series_redirects = series,
        min_age_days = settings.slug_redirect_min_age_days.max(1),
        idle_days = settings.slug_redirect_idle_days.max(1),
        "slug redirect cleanup scan completed"
    );

    Ok((posts, series))
}
