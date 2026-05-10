//! Background loop that rebuilds the materialised series ordering view.
//! Coalesces concurrent refresh requests into a single rebuild per debounce
//! window, set by `series_projection_debounce_seconds`.

use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;
use std::time::Duration;

use chrono::{DateTime, Utc};
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, DatabaseConnection, DbErr, EntityTrait,
    QueryFilter, TransactionTrait,
};
use tokio::sync::Notify;
use tokio::time::sleep;
use tracing::{debug, info, warn};
use uuid::Uuid;

use crate::entities::{
    enums::{
        DbPostContentKind, DbPostLocale, DbPostTranslationSourceKind, DbPostTranslationStatus,
    },
    post, series, series_post,
};
use crate::posts::slugify_series_title;

#[derive(Clone)]
pub struct SeriesProjector {
    notify: Arc<Notify>,
}

impl SeriesProjector {
    pub fn new() -> Self {
        Self {
            notify: Arc::new(Notify::new()),
        }
    }

    /// Ask the background loop to rebuild on its next tick. Coalesces multiple
    /// concurrent calls into one rebuild.
    pub fn request_refresh(&self, reason: &'static str) {
        debug!(
            event = "series_projection.refresh_requested",
            reason, "series projection refresh requested"
        );
        self.notify.notify_one();
    }

    /// Spawn the background loop. Runs an initial rebuild on boot, then waits
    /// for `request_refresh` calls and rebuilds after a short debounce so a
    /// burst of post writes coalesces into a single rebuild.
    pub fn spawn_loop(
        &self,
        pool: DatabaseConnection,
        debounce_seconds: f32,
    ) -> tokio::task::JoinHandle<()> {
        let notify = self.notify.clone();
        tokio::spawn(async move {
            // Initial rebuild — bring projections current with whatever the
            // DB has even if no writes arrive immediately after boot.
            run_rebuild(&pool).await;
            loop {
                notify.notified().await;
                sleep(Duration::from_secs_f32(debounce_seconds)).await;
                run_rebuild(&pool).await;
            }
        })
    }
}

async fn run_rebuild(pool: &DatabaseConnection) {
    debug!(
        event = "series_projection.rebuild_started",
        "series projection rebuild started"
    );
    match rebuild_series_projection_cache(pool).await {
        Ok(summary) => info!(
            series = summary.series_count,
            mapped_posts = summary.mapped_post_count,
            created = summary.created_series_count,
            retained = summary.retained_series_count,
            deleted = summary.deleted_series_count,
            "series projection rebuilt"
        ),
        Err(err) => warn!(error = %err, "series projection rebuild failed"),
    }
}

#[derive(Debug)]
pub struct RebuildSummary {
    pub series_count: i64,
    pub mapped_post_count: i64,
    pub created_series_count: i64,
    pub retained_series_count: i64,
    pub deleted_series_count: i64,
}

#[derive(Debug, Clone)]
struct PostRow {
    id: Uuid,
    slug: String,
    series_title: String,
    published_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

/// Rebuild ko-source series + series_posts from posts.series_title content.
/// Sibling-locale series (translations) are owned by the translation
/// pipeline and are not touched here.
pub async fn rebuild_series_projection_cache(
    pool: &DatabaseConnection,
) -> Result<RebuildSummary, DbErr> {
    let posts: Vec<PostRow> = post::Entity::find()
        .filter(post::Column::SeriesTitle.is_not_null())
        .filter(post::Column::Locale.eq(DbPostLocale::Ko))
        .filter(post::Column::ContentKind.eq(DbPostContentKind::Blog))
        .all(pool)
        .await?
        .into_iter()
        .filter_map(|post| {
            Some(PostRow {
                id: post.id,
                slug: post.slug,
                series_title: post.series_title?,
                published_at: post.published_at,
                created_at: post.created_at,
                updated_at: post.updated_at,
            })
        })
        .collect();

    let existing_rows = series::Entity::find()
        .filter(series::Column::Locale.eq(DbPostLocale::Ko))
        .all(pool)
        .await?;
    let series_ids: Vec<Uuid> = existing_rows.iter().map(|r| r.id).collect();

    let existing_mappings = if series_ids.is_empty() {
        Vec::new()
    } else {
        series_post::Entity::find()
            .filter(series_post::Column::SeriesId.is_in(series_ids.iter().copied()))
            .all(pool)
            .await?
    };

    let existing_by_slug: HashMap<String, &series::Model> =
        existing_rows.iter().map(|r| (r.slug.clone(), r)).collect();

    let mut existing_order_by_slug: HashMap<String, HashMap<Uuid, i32>> = HashMap::new();
    {
        let mut id_to_slug: HashMap<Uuid, String> = HashMap::new();
        for row in &existing_rows {
            id_to_slug.insert(row.id, row.slug.clone());
        }
        for m in &existing_mappings {
            if let Some(slug) = id_to_slug.get(&m.series_id) {
                existing_order_by_slug
                    .entry(slug.clone())
                    .or_default()
                    .insert(m.post_id, m.order_index);
            }
        }
    }

    // Group posts by slugified series title.
    let mut grouped: BTreeMap<String, Vec<PostRow>> = BTreeMap::new();
    let mut series_titles: HashMap<String, (DateTime<Utc>, String)> = HashMap::new();
    for post in &posts {
        let normalized_title = match normalize_optional_text(Some(&post.series_title)) {
            Some(t) => t,
            None => continue,
        };
        let series_slug = slugify_series_title(&normalized_title);
        grouped
            .entry(series_slug.clone())
            .or_default()
            .push(post.clone());
        let candidate_at = post.updated_at.max(post.created_at);
        let entry = series_titles
            .entry(series_slug)
            .or_insert((candidate_at, normalized_title.clone()));
        if candidate_at >= entry.0 {
            *entry = (candidate_at, normalized_title);
        }
    }

    let tx = pool.begin().await?;

    if !series_ids.is_empty() {
        series_post::Entity::delete_many()
            .filter(series_post::Column::SeriesId.is_in(series_ids.iter().copied()))
            .exec(&tx)
            .await?;
    }

    let mut created = 0i64;
    let mut retained = 0i64;
    let mut deleted = 0i64;
    let mut mapped = 0i64;
    let mut target_slugs: std::collections::HashSet<String> = std::collections::HashSet::new();

    for (slug, mut posts_in_group) in grouped {
        target_slugs.insert(slug.clone());
        let title = series_titles
            .get(&slug)
            .map(|(_, t)| t.clone())
            .unwrap_or_else(|| slug.clone());
        let order_overrides = existing_order_by_slug.remove(&slug).unwrap_or_default();

        // Sort by (existing_order, published_at, created_at, slug).
        posts_in_group.sort_by(|a, b| {
            let order_a = order_overrides.get(&a.id).copied().unwrap_or(i32::MAX);
            let order_b = order_overrides.get(&b.id).copied().unwrap_or(i32::MAX);
            order_a
                .cmp(&order_b)
                .then_with(|| projection_order_key(a).cmp(&projection_order_key(b)))
        });

        let series_id = match existing_by_slug.get(&slug) {
            Some(row) => {
                retained += 1;
                let new_description = if row.description.trim().is_empty() {
                    Some(format!("{title} series"))
                } else {
                    None
                };
                let mut active: series::ActiveModel = (*row).clone().into();
                active.title = Set(title.clone());
                if let Some(desc) = new_description {
                    active.description = Set(desc);
                }
                active.updated_at = Set(Utc::now());
                active.update(&tx).await?;
                row.id
            }
            None => {
                created += 1;
                let new_id = Uuid::new_v4();
                series::ActiveModel {
                    id: Set(new_id),
                    slug: Set(slug.clone()),
                    title: Set(title.clone()),
                    description: Set(format!("{title} series")),
                    cover_image_url: Set(None),
                    locale: Set(DbPostLocale::Ko),
                    translation_group_id: Set(Uuid::new_v4()),
                    source_series_id: Set(None),
                    translation_status: Set(DbPostTranslationStatus::Source),
                    translation_source_kind: Set(DbPostTranslationSourceKind::Manual),
                    ..Default::default()
                }
                .insert(&tx)
                .await?;
                new_id
            }
        };

        for (idx, post) in posts_in_group.iter().enumerate() {
            series_post::ActiveModel {
                id: Set(Uuid::new_v4()),
                series_id: Set(series_id),
                post_id: Set(post.id),
                order_index: Set((idx + 1) as i32),
                ..Default::default()
            }
            .insert(&tx)
            .await?;
            mapped += 1;
        }
    }

    // Delete ko-source series rows that no longer have posts.
    for row in &existing_rows {
        if target_slugs.contains(&row.slug) {
            continue;
        }
        series::Entity::delete_by_id(row.id).exec(&tx).await?;
        deleted += 1;
    }

    tx.commit().await?;

    let series_count = (target_slugs.len()) as i64;
    Ok(RebuildSummary {
        series_count,
        mapped_post_count: mapped,
        created_series_count: created,
        retained_series_count: retained,
        deleted_series_count: deleted,
    })
}

fn normalize_optional_text(value: Option<&str>) -> Option<String> {
    let trimmed = value?.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn projection_order_key(post: &PostRow) -> (DateTime<Utc>, DateTime<Utc>, String) {
    let primary = post
        .published_at
        .unwrap_or(post.created_at)
        .max(post.updated_at);
    let secondary = post.created_at.max(post.updated_at);
    (primary, secondary, post.slug.clone())
}
