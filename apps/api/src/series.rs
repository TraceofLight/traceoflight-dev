//! Series collection and member-post linkage. Each series owns an ordered
//! list of posts; the order is materialised by the background series
//! projector (`series_projection.rs`).

use std::collections::{HashMap, HashSet};

use chrono::{DateTime, Utc};
use sea_orm::{
    ActiveModelTrait,
    ActiveValue::Set,
    ColumnTrait, DatabaseConnection, DatabaseTransaction, DbErr, EntityTrait, PaginatorTrait,
    QueryFilter, QueryOrder, QuerySelect, TransactionTrait,
    sea_query::{NullOrdering, Order},
};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::db;
use crate::entities::{
    enums::{
        DbPostLocale, DbPostStatus, DbPostTranslationSourceKind, DbPostTranslationStatus,
        DbPostVisibility,
    },
    post, series, series_post, series_slug_redirect,
};
use crate::error::AppError;
use crate::posts::{PostLocale, PostVisibility};
use crate::serializers::{serialize_dt_us, serialize_dt_us_opt};

#[derive(Debug, Serialize, FromRow, ToSchema)]
pub struct SeriesPostRead {
    pub slug: String,
    pub title: String,
    pub excerpt: Option<String>,
    pub cover_image_url: Option<String>,
    pub order_index: i32,
    #[serde(serialize_with = "serialize_dt_us_opt")]
    pub published_at: Option<DateTime<Utc>>,
    pub visibility: PostVisibility,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SeriesRead {
    pub id: Uuid,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub cover_image_url: Option<String>,
    pub post_count: i64,
    pub locale: PostLocale,
    pub translation_group_id: Option<Uuid>,
    pub source_series_id: Option<Uuid>,
    #[serde(serialize_with = "serialize_dt_us")]
    pub created_at: DateTime<Utc>,
    #[serde(serialize_with = "serialize_dt_us")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SeriesDetailRead {
    pub id: Uuid,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub cover_image_url: Option<String>,
    pub post_count: i64,
    pub locale: PostLocale,
    pub translation_group_id: Option<Uuid>,
    pub source_series_id: Option<Uuid>,
    #[serde(serialize_with = "serialize_dt_us")]
    pub created_at: DateTime<Utc>,
    #[serde(serialize_with = "serialize_dt_us")]
    pub updated_at: DateTime<Utc>,
    pub posts: Vec<SeriesPostRead>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct SeriesUpsert {
    pub slug: String,
    pub title: String,
    pub description: String,
    #[serde(default)]
    pub cover_image_url: Option<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct SeriesOrderReplace {
    #[serde(default)]
    pub series_slugs: Vec<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct SeriesPostsReplace {
    #[serde(default)]
    pub post_slugs: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct ListSeriesParams {
    pub limit: i64,
    pub offset: i64,
    pub include_private: bool,
    pub locale: Option<PostLocale>,
}

#[derive(Debug)]
struct SeriesRow {
    id: Uuid,
    slug: String,
    title: String,
    description: String,
    cover_image_url: Option<String>,
    locale: PostLocale,
    translation_group_id: Option<Uuid>,
    source_series_id: Option<Uuid>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(Debug)]
struct SeriesListRow {
    id: Uuid,
    slug: String,
    title: String,
    description: String,
    cover_image_url: Option<String>,
    locale: PostLocale,
    translation_group_id: Option<Uuid>,
    source_series_id: Option<Uuid>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    post_count: i64,
}

pub async fn list_series(
    pool: &DatabaseConnection,
    params: ListSeriesParams,
) -> Result<Vec<SeriesRead>, DbErr> {
    let mut query = series::Entity::find()
        .order_by_with_nulls(
            series::Column::ListOrderIndex,
            Order::Asc,
            NullOrdering::Last,
        )
        .order_by_desc(series::Column::UpdatedAt)
        .limit(params.limit as u64)
        .offset(params.offset as u64);
    if let Some(locale) = params.locale {
        query = query.filter(series::Column::Locale.eq(DbPostLocale::from(locale)));
    }

    let models = query.all(pool).await?;
    let post_counts = count_visible_posts_by_series(pool, &models, params.include_private).await?;
    let rows: Vec<SeriesListRow> = models
        .into_iter()
        .map(|model| {
            let post_count = *post_counts.get(&model.id).unwrap_or(&0);
            series_list_row(model, post_count)
        })
        .collect();

    let drop_empty = params.locale.is_none();
    Ok(rows
        .into_iter()
        .filter(|r| !(drop_empty && r.post_count == 0))
        .map(|r| SeriesRead {
            id: r.id,
            slug: r.slug,
            title: r.title,
            description: r.description,
            cover_image_url: r.cover_image_url,
            post_count: r.post_count,
            locale: r.locale,
            translation_group_id: r.translation_group_id,
            source_series_id: r.source_series_id,
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
        .collect())
}

pub async fn get_series_by_slug(
    pool: &DatabaseConnection,
    slug: &str,
    include_private: bool,
    locale: Option<PostLocale>,
) -> Result<Option<SeriesDetailRead>, DbErr> {
    let series = fetch_series_row(pool, slug, locale).await?;
    let Some(series) = series else {
        return Ok(None);
    };
    let posts = fetch_series_posts(pool, series.id, include_private).await?;
    if posts.is_empty() {
        return Ok(None);
    }
    Ok(Some(detail_from(series, posts)))
}

pub async fn create_series(
    pool: &DatabaseConnection,
    payload: SeriesUpsert,
) -> Result<SeriesDetailRead, AppError> {
    let tx = pool.begin().await?;
    let series_id = Uuid::new_v4();
    let translation_group_id = Uuid::new_v4();

    series::ActiveModel {
        id: Set(series_id),
        slug: Set(payload.slug.clone()),
        title: Set(payload.title.clone()),
        description: Set(payload.description.clone()),
        cover_image_url: Set(payload.cover_image_url.clone()),
        locale: Set(DbPostLocale::Ko),
        translation_group_id: Set(translation_group_id),
        source_series_id: Set(None),
        translation_status: Set(DbPostTranslationStatus::Source),
        translation_source_kind: Set(DbPostTranslationSourceKind::Manual),
        ..Default::default()
    }
    .insert(&tx)
    .await
    .map_err(map_series_conflict)?;

    delete_series_redirect(&tx, PostLocale::Ko, &payload.slug).await?;

    tx.commit().await?;

    let series = fetch_series_row(pool, &payload.slug, None).await?;
    let series = series
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("series disappeared after insert")))?;
    Ok(detail_from(series, Vec::new()))
}

pub async fn update_series_by_slug(
    pool: &DatabaseConnection,
    current_slug: &str,
    payload: SeriesUpsert,
) -> Result<Option<SeriesDetailRead>, AppError> {
    let existing = fetch_series_row(pool, current_slug, None).await?;
    let Some(existing) = existing else {
        return Ok(None);
    };

    let tx = pool.begin().await?;

    let mut active: series::ActiveModel = series::Entity::find_by_id(existing.id)
        .one(&tx)
        .await?
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("series disappeared before update")))?
        .into();
    active.slug = Set(payload.slug.clone());
    active.title = Set(payload.title.clone());
    active.description = Set(payload.description.clone());
    active.cover_image_url = Set(payload.cover_image_url.clone());
    active.updated_at = Set(Utc::now());
    active.update(&tx).await.map_err(map_series_conflict)?;

    if existing.slug != payload.slug {
        record_series_rename(
            &tx,
            &existing.slug,
            &payload.slug,
            existing.locale,
            existing.id,
        )
        .await?;
    }

    tx.commit().await?;

    let updated = fetch_series_row(pool, &payload.slug, None).await?;
    let updated = updated
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("series disappeared after update")))?;
    let posts = fetch_series_posts(pool, updated.id, true).await?;
    Ok(Some(detail_from(updated, posts)))
}

pub async fn delete_series_by_slug(pool: &DatabaseConnection, slug: &str) -> Result<bool, DbErr> {
    let result = series::Entity::delete_many()
        .filter(series::Column::Slug.eq(slug))
        .exec(pool)
        .await?;
    Ok(result.rows_affected > 0)
}

pub async fn replace_series_posts_by_slug(
    pool: &DatabaseConnection,
    slug: &str,
    raw_post_slugs: Vec<String>,
) -> Result<Option<SeriesDetailRead>, AppError> {
    let series = fetch_series_row(pool, slug, None).await?;
    let Some(series) = series else {
        return Ok(None);
    };

    let post_slugs = normalize_slug_list(&raw_post_slugs, true);

    let tx = pool.begin().await?;

    if post_slugs.is_empty() {
        series_post::Entity::delete_many()
            .filter(series_post::Column::SeriesId.eq(series.id))
            .exec(&tx)
            .await?;
        tx.commit().await?;
        return Ok(Some(detail_from(series, Vec::new())));
    }

    let posts = post::Entity::find()
        .filter(post::Column::Slug.is_in(post_slugs.iter().cloned()))
        .all(&tx)
        .await?;

    let mut by_slug: std::collections::HashMap<String, Uuid> =
        posts.into_iter().map(|p| (p.slug, p.id)).collect();
    let missing: Vec<String> = post_slugs
        .iter()
        .filter(|s| !by_slug.contains_key(*s))
        .cloned()
        .collect();
    if !missing.is_empty() {
        return Err(AppError::BadRequest(format!(
            "unknown post slugs: {}",
            missing.join(", ")
        )));
    }

    let post_ids: Vec<Uuid> = post_slugs
        .iter()
        .map(|s| by_slug.remove(s).expect("verified existence"))
        .collect();

    let conflict_count = series_post::Entity::find()
        .filter(series_post::Column::PostId.is_in(post_ids.iter().copied()))
        .filter(series_post::Column::SeriesId.ne(series.id))
        .count(&tx)
        .await?;
    if conflict_count > 0 {
        return Err(AppError::Conflict(
            "one or more posts already belong to another series".into(),
        ));
    }

    series_post::Entity::delete_many()
        .filter(series_post::Column::SeriesId.eq(series.id))
        .exec(&tx)
        .await?;

    for (idx, post_id) in post_ids.iter().enumerate() {
        series_post::ActiveModel {
            id: Set(Uuid::new_v4()),
            series_id: Set(series.id),
            post_id: Set(*post_id),
            order_index: Set((idx as i32) + 1),
            ..Default::default()
        }
        .insert(&tx)
        .await
        .map_err(map_series_conflict)?;
    }

    tx.commit().await?;

    let posts = fetch_series_posts(pool, series.id, true).await?;
    Ok(Some(detail_from(series, posts)))
}

pub async fn replace_series_order(
    pool: &DatabaseConnection,
    raw_slugs: Vec<String>,
) -> Result<Vec<SeriesRead>, AppError> {
    let normalized = normalize_slug_list(&raw_slugs, false);
    if normalized.is_empty() {
        return Ok(Vec::new());
    }

    let tx = pool.begin().await?;

    let existing = series::Entity::find()
        .filter(series::Column::Slug.is_in(normalized.iter().cloned()))
        .all(&tx)
        .await?;
    let known: HashSet<String> = existing.into_iter().map(|r| r.slug).collect();
    let missing: Vec<String> = normalized
        .iter()
        .filter(|s| !known.contains(*s))
        .cloned()
        .collect();
    if !missing.is_empty() {
        return Err(AppError::BadRequest(format!(
            "unknown series slugs: {}",
            missing.join(", ")
        )));
    }

    for (idx, slug) in normalized.iter().enumerate() {
        let models = series::Entity::find()
            .filter(series::Column::Slug.eq(slug))
            .all(&tx)
            .await?;
        for model in models {
            let mut active: series::ActiveModel = model.into();
            active.list_order_index = Set(Some((idx as i32) + 1));
            active.updated_at = Set(Utc::now());
            active.update(&tx).await?;
        }
    }

    tx.commit().await?;

    // Admin reorder result: only Korean source rows, ordered by list_order_index.
    let models = series::Entity::find()
        .filter(series::Column::Locale.eq(DbPostLocale::Ko))
        .filter(series::Column::SourceSeriesId.is_null())
        .order_by_with_nulls(
            series::Column::ListOrderIndex,
            Order::Asc,
            NullOrdering::Last,
        )
        .order_by_desc(series::Column::CreatedAt)
        .all(pool)
        .await?;
    let post_counts = count_visible_posts_by_series(pool, &models, true).await?;
    let rows: Vec<SeriesListRow> = models
        .into_iter()
        .map(|model| {
            let post_count = *post_counts.get(&model.id).unwrap_or(&0);
            series_list_row(model, post_count)
        })
        .collect();

    Ok(rows
        .into_iter()
        .map(|r| SeriesRead {
            id: r.id,
            slug: r.slug,
            title: r.title,
            description: r.description,
            cover_image_url: r.cover_image_url,
            post_count: r.post_count,
            locale: r.locale,
            translation_group_id: r.translation_group_id,
            source_series_id: r.source_series_id,
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
        .collect())
}

pub async fn resolve_series_redirect(
    pool: &DatabaseConnection,
    old_slug: &str,
    locale: PostLocale,
) -> Result<Option<String>, DbErr> {
    let redirect = series_slug_redirect::Entity::find()
        .filter(series_slug_redirect::Column::Locale.eq(DbPostLocale::from(locale)))
        .filter(series_slug_redirect::Column::OldSlug.eq(old_slug))
        .one(pool)
        .await?;

    let Some(redirect) = redirect else {
        return Ok(None);
    };
    let target = series::Entity::find_by_id(redirect.target_series_id)
        .one(pool)
        .await?;
    let Some(target) = target else {
        return Ok(None);
    };

    let next_hit_count = redirect.hit_count + 1;
    let mut active: series_slug_redirect::ActiveModel = redirect.into();
    active.hit_count = Set(next_hit_count);
    active.last_hit_at = Set(Some(Utc::now()));
    active.update(pool).await?;
    Ok(Some(target.slug))
}

// ── helpers ─────────────────────────────────────────────────────────────────

async fn fetch_series_row(
    pool: &DatabaseConnection,
    slug: &str,
    locale: Option<PostLocale>,
) -> Result<Option<SeriesRow>, DbErr> {
    let mut query = series::Entity::find().filter(series::Column::Slug.eq(slug));
    if let Some(locale) = locale {
        query = query.filter(series::Column::Locale.eq(DbPostLocale::from(locale)));
    }
    Ok(query.one(pool).await?.map(series_row))
}

async fn fetch_series_posts(
    pool: &DatabaseConnection,
    series_id: Uuid,
    include_private: bool,
) -> Result<Vec<SeriesPostRead>, DbErr> {
    let links = series_post::Entity::find()
        .filter(series_post::Column::SeriesId.eq(series_id))
        .order_by_asc(series_post::Column::OrderIndex)
        .all(pool)
        .await?;
    let post_ids: Vec<Uuid> = links.iter().map(|link| link.post_id).collect();
    if post_ids.is_empty() {
        return Ok(Vec::new());
    }

    let mut post_query = post::Entity::find().filter(post::Column::Id.is_in(post_ids));
    if !include_private {
        post_query = post_query
            .filter(post::Column::Status.eq(DbPostStatus::Published))
            .filter(post::Column::Visibility.eq(DbPostVisibility::Public));
    }
    let posts_by_id: HashMap<Uuid, post::Model> = post_query
        .all(pool)
        .await?
        .into_iter()
        .map(|post| (post.id, post))
        .collect();

    Ok(links
        .into_iter()
        .filter_map(|link| {
            let post = posts_by_id.get(&link.post_id)?;
            Some(SeriesPostRead {
                slug: post.slug.clone(),
                title: post.title.clone(),
                excerpt: post.excerpt.clone(),
                cover_image_url: post.cover_image_url.clone(),
                order_index: link.order_index,
                published_at: post.published_at,
                visibility: PostVisibility::from(post.visibility),
            })
        })
        .collect())
}

fn series_row(model: series::Model) -> SeriesRow {
    SeriesRow {
        id: model.id,
        slug: model.slug,
        title: model.title,
        description: model.description,
        cover_image_url: model.cover_image_url,
        locale: PostLocale::from(model.locale),
        translation_group_id: Some(model.translation_group_id),
        source_series_id: model.source_series_id,
        created_at: model.created_at,
        updated_at: model.updated_at,
    }
}

fn series_list_row(model: series::Model, post_count: i64) -> SeriesListRow {
    SeriesListRow {
        id: model.id,
        slug: model.slug,
        title: model.title,
        description: model.description,
        cover_image_url: model.cover_image_url,
        locale: PostLocale::from(model.locale),
        translation_group_id: Some(model.translation_group_id),
        source_series_id: model.source_series_id,
        created_at: model.created_at,
        updated_at: model.updated_at,
        post_count,
    }
}

async fn count_visible_posts_by_series(
    pool: &DatabaseConnection,
    series_models: &[series::Model],
    include_private: bool,
) -> Result<HashMap<Uuid, i64>, DbErr> {
    let series_ids: Vec<Uuid> = series_models.iter().map(|series| series.id).collect();
    if series_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let links = series_post::Entity::find()
        .filter(series_post::Column::SeriesId.is_in(series_ids))
        .all(pool)
        .await?;
    let post_ids: Vec<Uuid> = links.iter().map(|link| link.post_id).collect();
    if post_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let mut post_query = post::Entity::find().filter(post::Column::Id.is_in(post_ids));
    if !include_private {
        post_query = post_query
            .filter(post::Column::Status.eq(DbPostStatus::Published))
            .filter(post::Column::Visibility.eq(DbPostVisibility::Public));
    }
    let visible_post_ids: HashSet<Uuid> = post_query
        .all(pool)
        .await?
        .into_iter()
        .map(|post| post.id)
        .collect();

    let mut counts = HashMap::new();
    for link in links {
        if visible_post_ids.contains(&link.post_id) {
            *counts.entry(link.series_id).or_insert(0) += 1;
        }
    }
    Ok(counts)
}

fn detail_from(series: SeriesRow, posts: Vec<SeriesPostRead>) -> SeriesDetailRead {
    SeriesDetailRead {
        id: series.id,
        slug: series.slug,
        title: series.title,
        description: series.description,
        cover_image_url: series.cover_image_url,
        post_count: posts.len() as i64,
        locale: series.locale,
        translation_group_id: series.translation_group_id,
        source_series_id: series.source_series_id,
        created_at: series.created_at,
        updated_at: series.updated_at,
        posts,
    }
}

async fn record_series_rename(
    tx: &DatabaseTransaction,
    old_slug: &str,
    new_slug: &str,
    locale: PostLocale,
    target_series_id: Uuid,
) -> Result<(), DbErr> {
    delete_series_redirect(tx, locale, old_slug).await?;
    series_slug_redirect::ActiveModel {
        id: Set(Uuid::new_v4()),
        locale: Set(DbPostLocale::from(locale)),
        old_slug: Set(old_slug.to_string()),
        target_series_id: Set(target_series_id),
        hit_count: Set(0),
        ..Default::default()
    }
    .insert(tx)
    .await?;
    delete_series_redirect(tx, locale, new_slug).await?;
    Ok(())
}

async fn delete_series_redirect(
    tx: &DatabaseTransaction,
    locale: PostLocale,
    old_slug: &str,
) -> Result<(), DbErr> {
    series_slug_redirect::Entity::delete_many()
        .filter(series_slug_redirect::Column::Locale.eq(DbPostLocale::from(locale)))
        .filter(series_slug_redirect::Column::OldSlug.eq(old_slug))
        .exec(tx)
        .await?;
    Ok(())
}

fn normalize_slug_list(raw: &[String], lowercase: bool) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for r in raw {
        let mut s = r.trim().to_string();
        if lowercase {
            s = s.to_lowercase();
        }
        if s.is_empty() || !seen.insert(s.clone()) {
            continue;
        }
        out.push(s);
    }
    out
}

/// Translate Postgres unique-violation codes to user-friendly conflicts.
/// Distinguishes the three conflict cases the FE surfaces:
/// - duplicate series.slug
/// - a post is already linked to another series
/// - a (series_id, order_index) pair collides
fn map_series_conflict(err: DbErr) -> AppError {
    if db::unique_violation(&err) {
        let constraint = db::pg_constraint(&err).unwrap_or_default();
        let detail = match constraint.as_str() {
            "uq_series_posts_post_id" => "post already belongs to another series",
            "uq_series_posts_series_order" => "series order index conflict",
            "ix_series_slug" | "uq_series_slug_locale" => "series slug already exists",
            _ => "series integrity conflict",
        };
        return AppError::Conflict(detail.into());
    }
    AppError::Database(err)
}
