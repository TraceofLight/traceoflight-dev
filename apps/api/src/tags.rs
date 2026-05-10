//! Tag taxonomy CRUD (admin-only). Slugs are normalized via
//! `posts::normalize_tag_slug` to keep URL keys consistent across surfaces.

use chrono::Utc;
use sea_orm::{
    ActiveModelTrait,
    ActiveValue::Set,
    ColumnTrait, Condition, DatabaseConnection, DbErr, EntityTrait, PaginatorTrait, QueryFilter,
    QueryOrder, QuerySelect, TransactionTrait,
    sea_query::{Expr, extension::postgres::PgExpr},
};
use serde::Deserialize;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::db;
use crate::entities::{post_tag, tag};
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
    pool: &DatabaseConnection,
    query: Option<&str>,
    limit: i64,
    offset: i64,
) -> Result<Vec<TagRead>, DbErr> {
    let pattern: Option<String> = query
        .map(|q| q.trim().to_lowercase())
        .filter(|q| !q.is_empty())
        .map(|q| format!("%{q}%"));

    let mut query = tag::Entity::find();
    if let Some(pattern) = pattern {
        query = query.filter(
            Condition::any()
                .add(Expr::col(tag::Column::Slug).ilike(pattern.clone()))
                .add(Expr::col(tag::Column::Label).ilike(pattern)),
        );
    }

    query
        .order_by_asc(tag::Column::Slug)
        .limit(limit as u64)
        .offset(offset as u64)
        .all(pool)
        .await
        .map(|models| models.into_iter().map(tag_read).collect())
}

pub async fn create_tag(
    pool: &DatabaseConnection,
    payload: TagCreate,
) -> Result<TagRead, AppError> {
    let slug = normalize_tag_slug(&payload.slug);
    let label = payload.label.trim().to_string();
    if slug.is_empty() {
        return Err(AppError::BadRequest("tag slug is invalid".into()));
    }
    if label.is_empty() {
        return Err(AppError::BadRequest("tag label is required".into()));
    }

    let model = tag::ActiveModel {
        id: Set(Uuid::new_v4()),
        slug: Set(slug),
        label: Set(label),
        ..Default::default()
    }
    .insert(pool)
    .await
    .map_err(unique_violation_to_conflict)?;

    Ok(tag_read(model))
}

pub async fn update_tag(
    pool: &DatabaseConnection,
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

    let existing = tag::Entity::find()
        .filter(tag::Column::Slug.eq(&normalized_current))
        .one(pool)
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

    let mut active: tag::ActiveModel = existing.into();
    active.slug = Set(next_slug);
    active.label = Set(next_label);
    active.updated_at = Set(Utc::now());
    let updated = active
        .update(pool)
        .await
        .map_err(unique_violation_to_conflict)?;
    Ok(Some(tag_read(updated)))
}

/// Returns `Ok(true)` when the row was deleted, `Ok(false)` when no row
/// matched the slug. Returns `AppError::Conflict` if the tag has post links
/// and `force` is false; with `force = true` the post_tags links are removed
/// in the same transaction.
pub async fn delete_tag(
    pool: &DatabaseConnection,
    slug: &str,
    force: bool,
) -> Result<bool, AppError> {
    let normalized = normalize_tag_slug(slug);
    if normalized.is_empty() {
        return Ok(false);
    }

    let tx = pool.begin().await?;

    let tag_id = tag::Entity::find()
        .filter(tag::Column::Slug.eq(&normalized))
        .one(&tx)
        .await?;
    let Some(tag_model) = tag_id else {
        return Ok(false);
    };
    let tag_id = tag_model.id;

    let link_count = post_tag::Entity::find()
        .filter(post_tag::Column::TagId.eq(tag_id))
        .count(&tx)
        .await?;

    if link_count > 0 {
        if !force {
            return Err(AppError::Conflict(
                "tag is linked to one or more posts".into(),
            ));
        }
        post_tag::Entity::delete_many()
            .filter(post_tag::Column::TagId.eq(tag_id))
            .exec(&tx)
            .await?;
    }

    tag::Entity::delete_by_id(tag_id).exec(&tx).await?;

    tx.commit().await?;
    Ok(true)
}

fn tag_read(model: tag::Model) -> TagRead {
    TagRead {
        slug: model.slug,
        label: model.label,
    }
}

fn unique_violation_to_conflict(err: DbErr) -> AppError {
    if db::unique_violation(&err) {
        return AppError::Conflict("tag slug already exists".into());
    }
    AppError::Database(err)
}
