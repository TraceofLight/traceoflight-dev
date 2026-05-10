//! Threaded post comments: guest+admin authoring, soft-delete, and the admin
//! moderation feed. Guest comments use argon2-hashed passwords for self-edit;
//! admin authoring relies on the internal-secret header.

use std::collections::HashMap;

use argon2::{
    Argon2, PasswordVerifier,
    password_hash::{PasswordHash, PasswordHasher, SaltString, rand_core::OsRng},
};
use chrono::{DateTime, Utc};
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, DatabaseConnection, DbErr, EntityTrait,
    PaginatorTrait, QueryFilter, QueryOrder, QuerySelect,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::entities::{
    enums::{DbCommentAuthorType, DbCommentStatus, DbCommentVisibility},
    post, post_comment,
};
use crate::error::AppError;
use crate::serializers::serialize_dt_us;

const ADMIN_AUTHOR_NAME: &str = "TraceofLight";
const PRIVATE_PLACEHOLDER: &str = "비공개된 댓글입니다.";
const DELETED_PLACEHOLDER: &str = "삭제된 댓글입니다.";

const AUTHOR_NAME_MAX: usize = 24;
const PASSWORD_MIN: usize = 4;
const PASSWORD_MAX: usize = 64;
const BODY_MIN: usize = 2;
const BODY_MAX: usize = 2000;

// ── Enums ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, Serialize, Deserialize, sqlx::Type, ToSchema, PartialEq, Eq)]
#[sqlx(type_name = "post_comment_author_type", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum CommentAuthorType {
    Guest,
    Admin,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, sqlx::Type, ToSchema, PartialEq, Eq)]
#[sqlx(type_name = "post_comment_visibility", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum CommentVisibility {
    Public,
    Private,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, sqlx::Type, ToSchema, PartialEq, Eq)]
#[sqlx(type_name = "post_comment_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum CommentStatus {
    Active,
    Deleted,
}

// ── Request / response DTOs ─────────────────────────────────────────────────

fn default_visibility() -> CommentVisibility {
    CommentVisibility::Public
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct PostCommentCreate {
    #[serde(default)]
    pub author_name: Option<String>,
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default = "default_visibility")]
    pub visibility: CommentVisibility,
    pub body: String,
    #[serde(default)]
    pub reply_to_comment_id: Option<Uuid>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct PostCommentUpdate {
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub visibility: Option<CommentVisibility>,
    #[serde(default)]
    pub body: Option<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct PostCommentDelete {
    #[serde(default)]
    pub password: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct PostCommentRead {
    pub id: Uuid,
    pub root_comment_id: Option<Uuid>,
    pub reply_to_comment_id: Option<Uuid>,
    pub author_name: String,
    pub author_type: CommentAuthorType,
    pub visibility: CommentVisibility,
    pub status: CommentStatus,
    pub body: String,
    pub password_hash: Option<String>,
    pub can_reply: bool,
    pub reply_to_author_name: Option<String>,
    #[serde(serialize_with = "serialize_dt_us")]
    pub created_at: DateTime<Utc>,
    #[serde(serialize_with = "serialize_dt_us")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct PostCommentThreadItem {
    pub id: Uuid,
    pub root_comment_id: Option<Uuid>,
    pub reply_to_comment_id: Option<Uuid>,
    pub author_name: String,
    pub author_type: CommentAuthorType,
    pub visibility: CommentVisibility,
    pub status: CommentStatus,
    pub body: String,
    pub password_hash: Option<String>,
    pub can_reply: bool,
    pub reply_to_author_name: Option<String>,
    #[serde(serialize_with = "serialize_dt_us")]
    pub created_at: DateTime<Utc>,
    #[serde(serialize_with = "serialize_dt_us")]
    pub updated_at: DateTime<Utc>,
    pub replies: Vec<PostCommentRead>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct PostCommentThreadList {
    pub comment_count: i64,
    pub items: Vec<PostCommentThreadItem>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AdminCommentFeedItem {
    pub id: Uuid,
    pub root_comment_id: Option<Uuid>,
    pub reply_to_comment_id: Option<Uuid>,
    pub author_name: String,
    pub author_type: CommentAuthorType,
    pub visibility: CommentVisibility,
    pub status: CommentStatus,
    pub body: String,
    pub password_hash: Option<String>,
    pub can_reply: bool,
    pub reply_to_author_name: Option<String>,
    #[serde(serialize_with = "serialize_dt_us")]
    pub created_at: DateTime<Utc>,
    #[serde(serialize_with = "serialize_dt_us")]
    pub updated_at: DateTime<Utc>,
    pub post_slug: String,
    pub post_title: String,
    pub is_reply: bool,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AdminCommentFeed {
    pub total_count: i64,
    pub items: Vec<AdminCommentFeedItem>,
}

// ── Internal row + helpers ──────────────────────────────────────────────────

#[derive(Debug, Clone)]
struct CommentRow {
    id: Uuid,
    post_id: Uuid,
    root_comment_id: Option<Uuid>,
    reply_to_comment_id: Option<Uuid>,
    author_name: String,
    author_type: CommentAuthorType,
    password_hash: Option<String>,
    visibility: CommentVisibility,
    status: CommentStatus,
    body: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

fn comment_author_type_from_db(value: DbCommentAuthorType) -> CommentAuthorType {
    match value {
        DbCommentAuthorType::Guest => CommentAuthorType::Guest,
        DbCommentAuthorType::Admin => CommentAuthorType::Admin,
    }
}

fn comment_visibility_from_db(value: DbCommentVisibility) -> CommentVisibility {
    match value {
        DbCommentVisibility::Public => CommentVisibility::Public,
        DbCommentVisibility::Private => CommentVisibility::Private,
    }
}

fn comment_status_from_db(value: DbCommentStatus) -> CommentStatus {
    match value {
        DbCommentStatus::Active => CommentStatus::Active,
        DbCommentStatus::Deleted => CommentStatus::Deleted,
    }
}

fn db_comment_author_type(value: CommentAuthorType) -> DbCommentAuthorType {
    match value {
        CommentAuthorType::Guest => DbCommentAuthorType::Guest,
        CommentAuthorType::Admin => DbCommentAuthorType::Admin,
    }
}

fn db_comment_visibility(value: CommentVisibility) -> DbCommentVisibility {
    match value {
        CommentVisibility::Public => DbCommentVisibility::Public,
        CommentVisibility::Private => DbCommentVisibility::Private,
    }
}

fn comment_row(model: post_comment::Model) -> CommentRow {
    CommentRow {
        id: model.id,
        post_id: model.post_id,
        root_comment_id: model.root_comment_id,
        reply_to_comment_id: model.reply_to_comment_id,
        author_name: model.author_name,
        author_type: comment_author_type_from_db(model.author_type),
        password_hash: model.password_hash,
        visibility: comment_visibility_from_db(model.visibility),
        status: comment_status_from_db(model.status),
        body: model.body,
        created_at: model.created_at,
        updated_at: model.updated_at,
    }
}

fn normalize_author_name(name: &str, author_type: CommentAuthorType) -> String {
    match author_type {
        CommentAuthorType::Admin => name.strip_prefix('@').unwrap_or(name).to_string(),
        CommentAuthorType::Guest => name.to_string(),
    }
}

fn to_read(
    row: &CommentRow,
    reply_to: Option<&CommentRow>,
    include_private: bool,
) -> PostCommentRead {
    let body = match (row.status, row.visibility, include_private) {
        (CommentStatus::Deleted, _, _) => DELETED_PLACEHOLDER.to_string(),
        (_, CommentVisibility::Private, false) => PRIVATE_PLACEHOLDER.to_string(),
        _ => row.body.clone(),
    };
    PostCommentRead {
        id: row.id,
        root_comment_id: row.root_comment_id,
        reply_to_comment_id: row.reply_to_comment_id,
        author_name: normalize_author_name(&row.author_name, row.author_type),
        author_type: row.author_type,
        visibility: row.visibility,
        status: row.status,
        body,
        password_hash: None,
        can_reply: !matches!(row.status, CommentStatus::Deleted),
        reply_to_author_name: reply_to
            .map(|r| normalize_author_name(&r.author_name, r.author_type)),
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

fn to_thread_item(read: PostCommentRead, replies: Vec<PostCommentRead>) -> PostCommentThreadItem {
    PostCommentThreadItem {
        id: read.id,
        root_comment_id: read.root_comment_id,
        reply_to_comment_id: read.reply_to_comment_id,
        author_name: read.author_name,
        author_type: read.author_type,
        visibility: read.visibility,
        status: read.status,
        body: read.body,
        password_hash: read.password_hash,
        can_reply: read.can_reply,
        reply_to_author_name: read.reply_to_author_name,
        created_at: read.created_at,
        updated_at: read.updated_at,
        replies,
    }
}

fn to_admin_item(
    read: PostCommentRead,
    post_slug: String,
    post_title: String,
    is_reply: bool,
) -> AdminCommentFeedItem {
    AdminCommentFeedItem {
        id: read.id,
        root_comment_id: read.root_comment_id,
        reply_to_comment_id: read.reply_to_comment_id,
        author_name: read.author_name,
        author_type: read.author_type,
        visibility: read.visibility,
        status: read.status,
        body: read.body,
        password_hash: read.password_hash,
        can_reply: read.can_reply,
        reply_to_author_name: read.reply_to_author_name,
        created_at: read.created_at,
        updated_at: read.updated_at,
        post_slug,
        post_title,
        is_reply,
    }
}

fn hash_password(password: &str) -> Result<String, AppError> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|err| AppError::Internal(anyhow::anyhow!("password hash failed: {err}")))
}

fn verify_password(hash: &str, password: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(hash) else {
        return false;
    };
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok()
}

// ── Public API ──────────────────────────────────────────────────────────────

pub async fn list_post_comments(
    pool: &DatabaseConnection,
    post_slug: &str,
    include_private: bool,
) -> Result<Option<PostCommentThreadList>, DbErr> {
    // Comments are unified across all locale siblings: a comment written
    // on the ko row is visible from /en, /ja, /zh too. Resolve slug →
    // translation_group_id, fetch comments tied to any locale row in the
    // group. Comments stay in their original language.
    let post = post::Entity::find()
        .filter(post::Column::Slug.eq(post_slug))
        .one(pool)
        .await?;
    let Some(post) = post else {
        return Ok(None);
    };

    let sibling_ids: Vec<Uuid> = post::Entity::find()
        .filter(post::Column::TranslationGroupId.eq(post.translation_group_id))
        .all(pool)
        .await?
        .into_iter()
        .map(|p| p.id)
        .collect();

    let comments: Vec<CommentRow> = post_comment::Entity::find()
        .filter(post_comment::Column::PostId.is_in(sibling_ids))
        .order_by_asc(post_comment::Column::CreatedAt)
        .order_by_asc(post_comment::Column::Id)
        .all(pool)
        .await?
        .into_iter()
        .map(comment_row)
        .collect();

    let by_id: HashMap<Uuid, CommentRow> = comments.iter().cloned().map(|c| (c.id, c)).collect();

    let mut roots: Vec<&CommentRow> = comments
        .iter()
        .filter(|c| c.root_comment_id.is_none())
        .collect();
    roots.sort_by(|a, b| a.created_at.cmp(&b.created_at).then(a.id.cmp(&b.id)));

    let mut replies_by_root: HashMap<Uuid, Vec<&CommentRow>> = HashMap::new();
    for c in &comments {
        if let Some(root_id) = c.root_comment_id {
            replies_by_root.entry(root_id).or_default().push(c);
        }
    }

    let items: Vec<PostCommentThreadItem> = roots
        .into_iter()
        .map(|root| {
            let reply_to_root = root.reply_to_comment_id.and_then(|id| by_id.get(&id));
            let root_read = to_read(root, reply_to_root, include_private);
            let mut replies = replies_by_root.remove(&root.id).unwrap_or_default();
            replies.sort_by(|a, b| a.created_at.cmp(&b.created_at).then(a.id.cmp(&b.id)));
            let reply_reads: Vec<PostCommentRead> = replies
                .into_iter()
                .map(|r| {
                    let reply_to = r.reply_to_comment_id.and_then(|id| by_id.get(&id));
                    to_read(r, reply_to, include_private)
                })
                .collect();
            to_thread_item(root_read, reply_reads)
        })
        .collect();

    Ok(Some(PostCommentThreadList {
        comment_count: comments.len() as i64,
        items,
    }))
}

pub async fn create_comment(
    pool: &DatabaseConnection,
    post_slug: &str,
    payload: PostCommentCreate,
    is_admin: bool,
) -> Result<Option<PostCommentRead>, AppError> {
    let body = payload.body.trim();
    if !(BODY_MIN..=BODY_MAX).contains(&body.chars().count()) {
        return Err(AppError::BadRequest(format!(
            "body length must be between {BODY_MIN} and {BODY_MAX}"
        )));
    }

    let post = post::Entity::find()
        .filter(post::Column::Slug.eq(post_slug))
        .one(pool)
        .await?;
    let Some(post) = post else {
        return Ok(None);
    };
    let post_id = post.id;

    let (root_comment_id, reply_to_comment_id) =
        resolve_reply_target(pool, post_id, payload.reply_to_comment_id).await?;

    let (author_name, author_type, password_hash) = if is_admin {
        (
            ADMIN_AUTHOR_NAME.to_string(),
            CommentAuthorType::Admin,
            None,
        )
    } else {
        let raw_name = payload.author_name.unwrap_or_default();
        let trimmed_name = raw_name.trim();
        let password = payload.password.unwrap_or_default();
        if trimmed_name.is_empty() {
            return Err(AppError::Unauthorized);
        }
        if trimmed_name.chars().count() < 2 || trimmed_name.chars().count() > AUTHOR_NAME_MAX {
            return Err(AppError::Unauthorized);
        }
        if !(PASSWORD_MIN..=PASSWORD_MAX).contains(&password.len()) {
            return Err(AppError::Unauthorized);
        }
        (
            trimmed_name.to_string(),
            CommentAuthorType::Guest,
            Some(hash_password(&password)?),
        )
    };

    let comment_id = Uuid::new_v4();
    post_comment::ActiveModel {
        id: Set(comment_id),
        post_id: Set(post_id),
        root_comment_id: Set(root_comment_id),
        reply_to_comment_id: Set(reply_to_comment_id),
        author_name: Set(author_name),
        author_type: Set(db_comment_author_type(author_type)),
        password_hash: Set(password_hash),
        visibility: Set(db_comment_visibility(payload.visibility)),
        status: Set(DbCommentStatus::Active),
        body: Set(body.to_string()),
        ..Default::default()
    }
    .insert(pool)
    .await?;

    let row = fetch_comment_row(pool, comment_id)
        .await?
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("comment disappeared after insert")))?;
    let reply_to = match row.reply_to_comment_id {
        Some(id) => fetch_comment_row(pool, id).await?,
        None => None,
    };
    Ok(Some(to_read(&row, reply_to.as_ref(), true)))
}

pub async fn update_comment(
    pool: &DatabaseConnection,
    comment_id: Uuid,
    payload: PostCommentUpdate,
    is_admin: bool,
) -> Result<Option<PostCommentRead>, AppError> {
    let row = match fetch_comment_row(pool, comment_id).await? {
        Some(r) => r,
        None => return Ok(None),
    };
    if matches!(row.status, CommentStatus::Deleted) {
        return Err(AppError::BadRequest(
            "deleted comments cannot be edited".into(),
        ));
    }
    authorize_owner(&row, payload.password.as_deref(), is_admin)?;

    let new_body = match payload.body {
        Some(ref b) => {
            let trimmed = b.trim();
            if !(BODY_MIN..=BODY_MAX).contains(&trimmed.chars().count()) {
                return Err(AppError::BadRequest(format!(
                    "body length must be between {BODY_MIN} and {BODY_MAX}"
                )));
            }
            Some(trimmed.to_string())
        }
        None => None,
    };
    let new_visibility = payload.visibility;

    let mut active: post_comment::ActiveModel = post_comment::Entity::find_by_id(comment_id)
        .one(pool)
        .await?
        .ok_or(AppError::NotFound("comment not found"))?
        .into();
    if let Some(body) = new_body {
        active.body = Set(body);
    }
    if let Some(visibility) = new_visibility {
        active.visibility = Set(db_comment_visibility(visibility));
    }
    let now = Utc::now();
    active.last_edited_at = Set(Some(now));
    active.updated_at = Set(now);
    active.update(pool).await?;

    let refreshed = fetch_comment_row(pool, comment_id)
        .await?
        .ok_or(AppError::NotFound("comment not found"))?;
    let reply_to = match refreshed.reply_to_comment_id {
        Some(id) => fetch_comment_row(pool, id).await?,
        None => None,
    };
    Ok(Some(to_read(&refreshed, reply_to.as_ref(), true)))
}

pub async fn delete_comment(
    pool: &DatabaseConnection,
    comment_id: Uuid,
    payload: PostCommentDelete,
    is_admin: bool,
) -> Result<Option<PostCommentRead>, AppError> {
    let row = match fetch_comment_row(pool, comment_id).await? {
        Some(r) => r,
        None => return Ok(None),
    };
    authorize_owner(&row, payload.password.as_deref(), is_admin)?;

    let mut active: post_comment::ActiveModel = post_comment::Entity::find_by_id(comment_id)
        .one(pool)
        .await?
        .ok_or(AppError::NotFound("comment not found"))?
        .into();
    let now = Utc::now();
    active.status = Set(DbCommentStatus::Deleted);
    active.body = Set(DELETED_PLACEHOLDER.to_string());
    active.deleted_at = Set(Some(now));
    active.last_edited_at = Set(Some(now));
    active.updated_at = Set(now);
    active.update(pool).await?;

    let refreshed = fetch_comment_row(pool, comment_id)
        .await?
        .ok_or(AppError::NotFound("comment not found"))?;
    let reply_to = match refreshed.reply_to_comment_id {
        Some(id) => fetch_comment_row(pool, id).await?,
        None => None,
    };
    Ok(Some(to_read(&refreshed, reply_to.as_ref(), true)))
}

pub async fn list_admin_comments(
    pool: &DatabaseConnection,
    limit: i64,
    offset: i64,
    post_slug: Option<&str>,
) -> Result<AdminCommentFeed, DbErr> {
    let normalized_slug: Option<String> = post_slug
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let post_filter = match normalized_slug.as_deref() {
        Some(slug) => {
            let post = post::Entity::find()
                .filter(post::Column::Slug.eq(slug))
                .one(pool)
                .await?;
            match post {
                Some(post) => Some(post.id),
                None => {
                    return Ok(AdminCommentFeed {
                        total_count: 0,
                        items: Vec::new(),
                    });
                }
            }
        }
        None => None,
    };

    let mut count_query = post_comment::Entity::find();
    if let Some(post_id) = post_filter {
        count_query = count_query.filter(post_comment::Column::PostId.eq(post_id));
    }
    let total_count = count_query.count(pool).await? as i64;

    let mut row_query = post_comment::Entity::find()
        .order_by_desc(post_comment::Column::CreatedAt)
        .order_by_desc(post_comment::Column::Id)
        .limit(limit as u64)
        .offset(offset as u64);
    if let Some(post_id) = post_filter {
        row_query = row_query.filter(post_comment::Column::PostId.eq(post_id));
    }
    let rows: Vec<CommentRow> = row_query
        .all(pool)
        .await?
        .into_iter()
        .map(comment_row)
        .collect();

    // Fetch reply targets for the items in this page so reply_to_author_name
    // can be filled without an N+1 round-trip.
    let reply_target_ids: Vec<Uuid> = rows.iter().filter_map(|r| r.reply_to_comment_id).collect();
    let reply_targets: HashMap<Uuid, CommentRow> = if reply_target_ids.is_empty() {
        HashMap::new()
    } else {
        post_comment::Entity::find()
            .filter(post_comment::Column::Id.is_in(reply_target_ids))
            .all(pool)
            .await?
            .into_iter()
            .map(comment_row)
            .map(|r| (r.id, r))
            .collect()
    };

    let post_ids: Vec<Uuid> = rows.iter().map(|r| r.post_id).collect();
    let posts_by_id: HashMap<Uuid, post::Model> = if post_ids.is_empty() {
        HashMap::new()
    } else {
        post::Entity::find()
            .filter(post::Column::Id.is_in(post_ids))
            .all(pool)
            .await?
            .into_iter()
            .map(|p| (p.id, p))
            .collect()
    };

    let items: Vec<AdminCommentFeedItem> = rows
        .into_iter()
        .filter_map(|comment| {
            let post = posts_by_id.get(&comment.post_id)?;
            let reply_to = comment
                .reply_to_comment_id
                .and_then(|id| reply_targets.get(&id));
            let read = to_read(&comment, reply_to, true);
            Some(to_admin_item(
                read,
                post.slug.clone(),
                post.title.clone(),
                comment.root_comment_id.is_some(),
            ))
        })
        .collect();

    Ok(AdminCommentFeed { total_count, items })
}

// ── helpers ─────────────────────────────────────────────────────────────────

async fn fetch_comment_row(
    pool: &DatabaseConnection,
    comment_id: Uuid,
) -> Result<Option<CommentRow>, DbErr> {
    Ok(post_comment::Entity::find_by_id(comment_id)
        .one(pool)
        .await?
        .map(comment_row))
}

async fn resolve_reply_target(
    pool: &DatabaseConnection,
    post_id: Uuid,
    reply_to_comment_id: Option<Uuid>,
) -> Result<(Option<Uuid>, Option<Uuid>), AppError> {
    let Some(target_id) = reply_to_comment_id else {
        return Ok((None, None));
    };
    let target = fetch_comment_row(pool, target_id).await?;
    let Some(target) = target else {
        return Err(AppError::BadRequest("invalid comment target".into()));
    };
    if target.post_id != post_id {
        return Err(AppError::BadRequest("invalid comment target".into()));
    }
    if matches!(target.status, CommentStatus::Deleted) {
        return Err(AppError::BadRequest(
            "deleted comments cannot receive new replies".into(),
        ));
    }
    let root = target.root_comment_id.unwrap_or(target.id);
    Ok((Some(root), Some(target.id)))
}

fn authorize_owner(
    row: &CommentRow,
    password: Option<&str>,
    is_admin: bool,
) -> Result<(), AppError> {
    if is_admin {
        return Ok(());
    }
    if !matches!(row.author_type, CommentAuthorType::Guest) {
        return Err(AppError::Unauthorized);
    }
    let Some(stored_hash) = row.password_hash.as_deref() else {
        return Err(AppError::Unauthorized);
    };
    let Some(supplied) = password else {
        return Err(AppError::Unauthorized);
    };
    if !verify_password(stored_hash, supplied) {
        return Err(AppError::Unauthorized);
    }
    Ok(())
}
