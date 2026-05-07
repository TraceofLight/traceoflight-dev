use serde::Deserialize;
use sqlx::PgPool;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::error::AppError;
use crate::posts::{TagRead, normalize_tag_slug};

#[derive(Debug, Deserialize, ToSchema)]
pub struct TagCreate {
    /// URL-safe unique tag slug. Will be normalized server-side
    /// (lowercase, dashes, no special chars).
    pub slug: String,
    /// Display label rendered in UI chips.
    pub label: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct TagUpdate {
    /// Optional replacement slug. Normalized like `TagCreate.slug`.
    #[serde(default)]
    pub slug: Option<String>,
    /// Optional replacement display label (whitespace-trimmed).
    #[serde(default)]
    pub label: Option<String>,
}

pub async fn list_tags(
    pool: &PgPool,
    query: Option<&str>,
    limit: i64,
    offset: i64,
) -> Result<Vec<TagRead>, sqlx::Error> {
    let pattern: Option<String> = query
        .map(|q| q.trim().to_lowercase())
        .filter(|q| !q.is_empty())
        .map(|q| format!("%{q}%"));

    sqlx::query_as::<_, TagRead>(
        r#"
        SELECT slug, label FROM tags
        WHERE ($1::text IS NULL
            OR LOWER(slug)  LIKE $1
            OR LOWER(label) LIKE $1)
        ORDER BY slug ASC
        LIMIT $2 OFFSET $3
        "#,
    )
    .bind(&pattern)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await
}

pub async fn create_tag(pool: &PgPool, payload: TagCreate) -> Result<TagRead, AppError> {
    let slug = normalize_tag_slug(&payload.slug);
    let label = payload.label.trim().to_string();
    if slug.is_empty() {
        return Err(AppError::BadRequest("tag slug is invalid".into()));
    }
    if label.is_empty() {
        return Err(AppError::BadRequest("tag label is required".into()));
    }

    sqlx::query_as::<_, TagRead>(
        r#"
        INSERT INTO tags (id, slug, label)
        VALUES (gen_random_uuid(), $1, $2)
        RETURNING slug, label
        "#,
    )
    .bind(&slug)
    .bind(&label)
    .fetch_one(pool)
    .await
    .map_err(unique_violation_to_conflict)
}

pub async fn update_tag(
    pool: &PgPool,
    current_slug: &str,
    payload: TagUpdate,
) -> Result<Option<TagRead>, AppError> {
    if payload.slug.is_none() && payload.label.is_none() {
        return Err(AppError::BadRequest(
            "at least one field is required".into(),
        ));
    }
    let normalized_current = normalize_tag_slug(current_slug);
    if normalized_current.is_empty() {
        return Ok(None);
    }

    let existing = sqlx::query_as::<_, TagRead>("SELECT slug, label FROM tags WHERE slug = $1")
        .bind(&normalized_current)
        .fetch_optional(pool)
        .await?;
    let Some(existing) = existing else {
        return Ok(None);
    };

    let next_slug = match payload.slug.as_deref() {
        Some(s) => {
            let normalized = normalize_tag_slug(s);
            if normalized.is_empty() {
                return Err(AppError::BadRequest("tag slug is invalid".into()));
            }
            normalized
        }
        None => existing.slug.clone(),
    };
    let next_label = match payload.label.as_deref() {
        Some(l) => {
            let trimmed = l.trim().to_string();
            if trimmed.is_empty() {
                return Err(AppError::BadRequest("tag label is required".into()));
            }
            trimmed
        }
        None => existing.label.clone(),
    };

    let updated = sqlx::query_as::<_, TagRead>(
        r#"
        UPDATE tags
        SET slug = $1, label = $2, updated_at = NOW()
        WHERE slug = $3
        RETURNING slug, label
        "#,
    )
    .bind(&next_slug)
    .bind(&next_label)
    .bind(&normalized_current)
    .fetch_one(pool)
    .await
    .map_err(unique_violation_to_conflict)?;
    Ok(Some(updated))
}

/// Returns `Ok(true)` when the row was deleted, `Ok(false)` when no row
/// matched the slug. Returns `AppError::Conflict` if the tag has post links
/// and `force` is false; with `force = true` the post_tags links are removed
/// in the same transaction.
pub async fn delete_tag(pool: &PgPool, slug: &str, force: bool) -> Result<bool, AppError> {
    let normalized = normalize_tag_slug(slug);
    if normalized.is_empty() {
        return Ok(false);
    }

    let mut tx = pool.begin().await?;

    let tag_id: Option<Uuid> = sqlx::query_scalar("SELECT id FROM tags WHERE slug = $1")
        .bind(&normalized)
        .fetch_optional(&mut *tx)
        .await?;
    let Some(tag_id) = tag_id else {
        return Ok(false);
    };

    let link_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM post_tags WHERE tag_id = $1")
        .bind(tag_id)
        .fetch_one(&mut *tx)
        .await?;

    if link_count > 0 {
        if !force {
            return Err(AppError::Conflict(
                "tag is linked to one or more posts".into(),
            ));
        }
        sqlx::query("DELETE FROM post_tags WHERE tag_id = $1")
            .bind(tag_id)
            .execute(&mut *tx)
            .await?;
    }

    sqlx::query("DELETE FROM tags WHERE id = $1")
        .bind(tag_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(true)
}

fn unique_violation_to_conflict(err: sqlx::Error) -> AppError {
    if let Some(db_err) = err.as_database_error() {
        if db_err.code().as_deref() == Some("23505") {
            return AppError::Conflict("tag slug already exists".into());
        }
    }
    AppError::Database(err)
}
