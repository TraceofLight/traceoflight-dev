use std::collections::HashSet;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool, Postgres, Transaction};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::error::AppError;
use crate::posts::{serialize_dt_us, serialize_dt_us_opt, PostLocale, PostVisibility};

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

#[derive(Debug, FromRow)]
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

#[derive(Debug, FromRow)]
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
    pool: &PgPool,
    params: ListSeriesParams,
) -> Result<Vec<SeriesRead>, sqlx::Error> {
    let rows = sqlx::query_as::<_, SeriesListRow>(
        r#"
        SELECT
            s.id, s.slug, s.title, s.description, s.cover_image_url,
            s.locale, s.translation_group_id, s.source_series_id,
            s.created_at, s.updated_at,
            COALESCE((
                SELECT COUNT(*)::int8
                FROM series_posts sp
                JOIN posts p ON p.id = sp.post_id
                WHERE sp.series_id = s.id
                  AND ($1::boolean
                       OR (p.status = 'published'::post_status
                           AND p.visibility = 'public'::post_visibility))
            ), 0) AS post_count
        FROM series s
        WHERE ($2::post_locale IS NULL OR s.locale = $2)
        ORDER BY s.list_order_index ASC NULLS LAST, s.updated_at DESC
        LIMIT $3 OFFSET $4
        "#,
    )
    .bind(params.include_private)
    .bind(params.locale)
    .bind(params.limit)
    .bind(params.offset)
    .fetch_all(pool)
    .await?;

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
    pool: &PgPool,
    slug: &str,
    include_private: bool,
    locale: Option<PostLocale>,
) -> Result<Option<SeriesDetailRead>, sqlx::Error> {
    let series = fetch_series_row(pool, slug, locale).await?;
    let Some(series) = series else { return Ok(None) };
    let posts = fetch_series_posts(pool, series.id, include_private).await?;
    if posts.is_empty() {
        return Ok(None);
    }
    Ok(Some(detail_from(series, posts)))
}

pub async fn create_series(
    pool: &PgPool,
    payload: SeriesUpsert,
) -> Result<SeriesDetailRead, AppError> {
    let mut tx = pool.begin().await?;
    let series_id = Uuid::new_v4();
    let translation_group_id = Uuid::new_v4();

    sqlx::query(
        r#"
        INSERT INTO series (
            id, slug, title, description, cover_image_url,
            locale, translation_group_id, source_series_id,
            translation_status, translation_source_kind
        ) VALUES (
            $1, $2, $3, $4, $5,
            'ko'::post_locale, $6, NULL,
            'source'::post_translation_status, 'manual'::post_translation_source_kind
        )
        "#,
    )
    .bind(series_id)
    .bind(&payload.slug)
    .bind(&payload.title)
    .bind(&payload.description)
    .bind(&payload.cover_image_url)
    .bind(translation_group_id)
    .execute(&mut *tx)
    .await
    .map_err(map_series_conflict)?;

    sqlx::query("DELETE FROM series_slug_redirects WHERE locale = 'ko'::post_locale AND old_slug = $1")
        .bind(&payload.slug)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    let series = fetch_series_row(pool, &payload.slug, None).await?;
    let series = series
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("series disappeared after insert")))?;
    Ok(detail_from(series, Vec::new()))
}

pub async fn update_series_by_slug(
    pool: &PgPool,
    current_slug: &str,
    payload: SeriesUpsert,
) -> Result<Option<SeriesDetailRead>, AppError> {
    let existing = fetch_series_row(pool, current_slug, None).await?;
    let Some(existing) = existing else {
        return Ok(None);
    };

    let mut tx = pool.begin().await?;

    sqlx::query(
        r#"
        UPDATE series
        SET slug = $1, title = $2, description = $3, cover_image_url = $4,
            updated_at = NOW()
        WHERE id = $5
        "#,
    )
    .bind(&payload.slug)
    .bind(&payload.title)
    .bind(&payload.description)
    .bind(&payload.cover_image_url)
    .bind(existing.id)
    .execute(&mut *tx)
    .await
    .map_err(map_series_conflict)?;

    if existing.slug != payload.slug {
        record_series_rename(
            &mut tx,
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

pub async fn delete_series_by_slug(pool: &PgPool, slug: &str) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM series WHERE slug = $1")
        .bind(slug)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn replace_series_posts_by_slug(
    pool: &PgPool,
    slug: &str,
    raw_post_slugs: Vec<String>,
) -> Result<Option<SeriesDetailRead>, AppError> {
    let series = fetch_series_row(pool, slug, None).await?;
    let Some(series) = series else {
        return Ok(None);
    };

    let post_slugs = normalize_slug_list(&raw_post_slugs, true);

    let mut tx = pool.begin().await?;

    if post_slugs.is_empty() {
        sqlx::query("DELETE FROM series_posts WHERE series_id = $1")
            .bind(series.id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        return Ok(Some(detail_from(series, Vec::new())));
    }

    #[derive(FromRow)]
    struct PostLookup {
        id: Uuid,
        slug: String,
    }
    let posts: Vec<PostLookup> = sqlx::query_as(
        "SELECT id, slug FROM posts WHERE slug = ANY($1::text[])",
    )
    .bind(&post_slugs)
    .fetch_all(&mut *tx)
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

    let conflict_count: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)::int8
        FROM series_posts
        WHERE post_id = ANY($1::uuid[])
          AND series_id <> $2
        "#,
    )
    .bind(&post_ids)
    .bind(series.id)
    .fetch_one(&mut *tx)
    .await?;
    if conflict_count > 0 {
        return Err(AppError::Conflict(
            "one or more posts already belong to another series".into(),
        ));
    }

    sqlx::query("DELETE FROM series_posts WHERE series_id = $1")
        .bind(series.id)
        .execute(&mut *tx)
        .await?;

    for (idx, post_id) in post_ids.iter().enumerate() {
        sqlx::query(
            r#"
            INSERT INTO series_posts (id, series_id, post_id, order_index)
            VALUES (gen_random_uuid(), $1, $2, $3)
            "#,
        )
        .bind(series.id)
        .bind(post_id)
        .bind((idx as i64) + 1)
        .execute(&mut *tx)
        .await
        .map_err(map_series_conflict)?;
    }

    tx.commit().await?;

    let posts = fetch_series_posts(pool, series.id, true).await?;
    Ok(Some(detail_from(series, posts)))
}

pub async fn replace_series_order(
    pool: &PgPool,
    raw_slugs: Vec<String>,
) -> Result<Vec<SeriesRead>, AppError> {
    let normalized = normalize_slug_list(&raw_slugs, false);
    if normalized.is_empty() {
        return Ok(Vec::new());
    }

    let mut tx = pool.begin().await?;

    #[derive(FromRow)]
    struct ExistingRow {
        slug: String,
    }
    let existing: Vec<ExistingRow> =
        sqlx::query_as("SELECT slug FROM series WHERE slug = ANY($1::text[])")
            .bind(&normalized)
            .fetch_all(&mut *tx)
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
        sqlx::query(
            "UPDATE series SET list_order_index = $1, updated_at = NOW() WHERE slug = $2",
        )
        .bind((idx as i64) + 1)
        .bind(slug)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    // Admin reorder result: only Korean source rows, ordered by list_order_index.
    let rows = sqlx::query_as::<_, SeriesListRow>(
        r#"
        SELECT
            s.id, s.slug, s.title, s.description, s.cover_image_url,
            s.locale, s.translation_group_id, s.source_series_id,
            s.created_at, s.updated_at,
            COALESCE((
                SELECT COUNT(*)::int8
                FROM series_posts sp
                JOIN posts p ON p.id = sp.post_id
                WHERE sp.series_id = s.id
            ), 0) AS post_count
        FROM series s
        WHERE s.locale = 'ko'::post_locale AND s.source_series_id IS NULL
        ORDER BY s.list_order_index ASC NULLS LAST, s.created_at DESC
        "#,
    )
    .fetch_all(pool)
    .await?;

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
    pool: &PgPool,
    old_slug: &str,
    locale: PostLocale,
) -> Result<Option<String>, sqlx::Error> {
    let row: Option<(Uuid, String)> = sqlx::query_as(
        r#"
        SELECT ssr.id, s.slug
        FROM series_slug_redirects ssr
        JOIN series s ON s.id = ssr.target_series_id
        WHERE ssr.locale = $1
          AND ssr.old_slug = $2
        "#,
    )
    .bind(locale)
    .bind(old_slug)
    .fetch_optional(pool)
    .await?;

    let Some((redirect_id, target_slug)) = row else {
        return Ok(None);
    };
    sqlx::query(
        r#"
        UPDATE series_slug_redirects
        SET hit_count = hit_count + 1, last_hit_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(redirect_id)
    .execute(pool)
    .await?;
    Ok(Some(target_slug))
}

// ── helpers ─────────────────────────────────────────────────────────────────

async fn fetch_series_row(
    pool: &PgPool,
    slug: &str,
    locale: Option<PostLocale>,
) -> Result<Option<SeriesRow>, sqlx::Error> {
    sqlx::query_as::<_, SeriesRow>(
        r#"
        SELECT id, slug, title, description, cover_image_url,
               locale, translation_group_id, source_series_id,
               created_at, updated_at
        FROM series
        WHERE slug = $1
          AND ($2::post_locale IS NULL OR locale = $2)
        LIMIT 1
        "#,
    )
    .bind(slug)
    .bind(locale)
    .fetch_optional(pool)
    .await
}

async fn fetch_series_posts(
    pool: &PgPool,
    series_id: Uuid,
    include_private: bool,
) -> Result<Vec<SeriesPostRead>, sqlx::Error> {
    sqlx::query_as::<_, SeriesPostRead>(
        r#"
        SELECT
            p.slug,
            p.title,
            p.excerpt,
            p.cover_image_url,
            sp.order_index,
            p.published_at,
            p.visibility
        FROM series_posts sp
        JOIN posts p ON p.id = sp.post_id
        WHERE sp.series_id = $1
          AND ($2::boolean
               OR (p.status = 'published'::post_status
                   AND p.visibility = 'public'::post_visibility))
        ORDER BY sp.order_index ASC
        "#,
    )
    .bind(series_id)
    .bind(include_private)
    .fetch_all(pool)
    .await
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
    tx: &mut Transaction<'_, Postgres>,
    old_slug: &str,
    new_slug: &str,
    locale: PostLocale,
    target_series_id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM series_slug_redirects WHERE locale = $1 AND old_slug = $2")
        .bind(locale)
        .bind(old_slug)
        .execute(&mut **tx)
        .await?;
    sqlx::query(
        r#"
        INSERT INTO series_slug_redirects (id, locale, old_slug, target_series_id, hit_count)
        VALUES (gen_random_uuid(), $1, $2, $3, 0)
        "#,
    )
    .bind(locale)
    .bind(old_slug)
    .bind(target_series_id)
    .execute(&mut **tx)
    .await?;
    sqlx::query("DELETE FROM series_slug_redirects WHERE locale = $1 AND old_slug = $2")
        .bind(locale)
        .bind(new_slug)
        .execute(&mut **tx)
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
fn map_series_conflict(err: sqlx::Error) -> AppError {
    if let Some(db_err) = err.as_database_error() {
        if db_err.code().as_deref() == Some("23505") {
            let constraint = db_err.constraint().unwrap_or("");
            let detail = match constraint {
                "uq_series_posts_post_id" => "post already belongs to another series",
                "uq_series_posts_series_order" => "series order index conflict",
                "ix_series_slug" | "uq_series_slug_locale" => "series slug already exists",
                _ => "series integrity conflict",
            };
            return AppError::Conflict(detail.into());
        }
    }
    AppError::Database(err)
}
