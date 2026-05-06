use std::collections::HashMap;

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, SaltString},
    Argon2, PasswordVerifier,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::error::AppError;
use crate::posts::{serialize_dt_us};

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

#[derive(Debug, Clone, FromRow)]
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
    pool: &PgPool,
    post_slug: &str,
    include_private: bool,
) -> Result<Option<PostCommentThreadList>, sqlx::Error> {
    let post_id: Option<Uuid> = sqlx::query_scalar("SELECT id FROM posts WHERE slug = $1")
        .bind(post_slug)
        .fetch_optional(pool)
        .await?;
    let Some(post_id) = post_id else {
        return Ok(None);
    };

    let comments: Vec<CommentRow> = sqlx::query_as(
        r#"
        SELECT id, post_id, root_comment_id, reply_to_comment_id,
               author_name, author_type, password_hash, visibility, status, body,
               created_at, updated_at
        FROM post_comments
        WHERE post_id = $1
        ORDER BY created_at ASC, id ASC
        "#,
    )
    .bind(post_id)
    .fetch_all(pool)
    .await?;

    let by_id: HashMap<Uuid, CommentRow> =
        comments.iter().cloned().map(|c| (c.id, c)).collect();

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
            let reply_to_root = root
                .reply_to_comment_id
                .and_then(|id| by_id.get(&id));
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
    pool: &PgPool,
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

    let post_id: Option<Uuid> = sqlx::query_scalar("SELECT id FROM posts WHERE slug = $1")
        .bind(post_slug)
        .fetch_optional(pool)
        .await?;
    let Some(post_id) = post_id else {
        return Ok(None);
    };

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
    sqlx::query(
        r#"
        INSERT INTO post_comments (
            id, post_id, root_comment_id, reply_to_comment_id,
            author_name, author_type, password_hash,
            visibility, status, body
        ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7,
            $8, 'active'::post_comment_status, $9
        )
        "#,
    )
    .bind(comment_id)
    .bind(post_id)
    .bind(root_comment_id)
    .bind(reply_to_comment_id)
    .bind(&author_name)
    .bind(author_type)
    .bind(&password_hash)
    .bind(payload.visibility)
    .bind(body)
    .execute(pool)
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
    pool: &PgPool,
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

    sqlx::query(
        r#"
        UPDATE post_comments
        SET
            body = COALESCE($1, body),
            visibility = COALESCE($2, visibility),
            last_edited_at = NOW(),
            updated_at = NOW()
        WHERE id = $3
        "#,
    )
    .bind(&new_body)
    .bind(new_visibility)
    .bind(comment_id)
    .execute(pool)
    .await?;

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
    pool: &PgPool,
    comment_id: Uuid,
    payload: PostCommentDelete,
    is_admin: bool,
) -> Result<Option<PostCommentRead>, AppError> {
    let row = match fetch_comment_row(pool, comment_id).await? {
        Some(r) => r,
        None => return Ok(None),
    };
    authorize_owner(&row, payload.password.as_deref(), is_admin)?;

    sqlx::query(
        r#"
        UPDATE post_comments
        SET status = 'deleted'::post_comment_status,
            body = $1,
            deleted_at = NOW(),
            last_edited_at = NOW(),
            updated_at = NOW()
        WHERE id = $2
        "#,
    )
    .bind(DELETED_PLACEHOLDER)
    .bind(comment_id)
    .execute(pool)
    .await?;

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
    pool: &PgPool,
    limit: i64,
    offset: i64,
    post_slug: Option<&str>,
) -> Result<AdminCommentFeed, sqlx::Error> {
    let normalized_slug: Option<String> = post_slug
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let total_count: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)::int8
        FROM post_comments c
        JOIN posts p ON p.id = c.post_id
        WHERE ($1::text IS NULL OR p.slug = $1)
        "#,
    )
    .bind(&normalized_slug)
    .fetch_one(pool)
    .await?;

    #[derive(FromRow)]
    struct AdminRow {
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
        post_slug: String,
        post_title: String,
    }

    let rows: Vec<AdminRow> = sqlx::query_as(
        r#"
        SELECT
            c.id, c.post_id, c.root_comment_id, c.reply_to_comment_id,
            c.author_name, c.author_type, c.password_hash,
            c.visibility, c.status, c.body, c.created_at, c.updated_at,
            p.slug AS post_slug, p.title AS post_title
        FROM post_comments c
        JOIN posts p ON p.id = c.post_id
        WHERE ($1::text IS NULL OR p.slug = $1)
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT $2 OFFSET $3
        "#,
    )
    .bind(&normalized_slug)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await?;

    // Fetch reply targets for the items in this page so reply_to_author_name
    // can be filled without an N+1 round-trip.
    let reply_target_ids: Vec<Uuid> = rows
        .iter()
        .filter_map(|r| r.reply_to_comment_id)
        .collect();
    let reply_targets: HashMap<Uuid, CommentRow> = if reply_target_ids.is_empty() {
        HashMap::new()
    } else {
        let target_rows: Vec<CommentRow> = sqlx::query_as(
            r#"
            SELECT id, post_id, root_comment_id, reply_to_comment_id,
                   author_name, author_type, password_hash,
                   visibility, status, body, created_at, updated_at
            FROM post_comments
            WHERE id = ANY($1::uuid[])
            "#,
        )
        .bind(&reply_target_ids)
        .fetch_all(pool)
        .await?;
        target_rows.into_iter().map(|r| (r.id, r)).collect()
    };

    let items: Vec<AdminCommentFeedItem> = rows
        .into_iter()
        .map(|r| {
            let reply_to = r.reply_to_comment_id.and_then(|id| reply_targets.get(&id));
            let comment = CommentRow {
                id: r.id,
                post_id: r.post_id,
                root_comment_id: r.root_comment_id,
                reply_to_comment_id: r.reply_to_comment_id,
                author_name: r.author_name,
                author_type: r.author_type,
                password_hash: r.password_hash,
                visibility: r.visibility,
                status: r.status,
                body: r.body,
                created_at: r.created_at,
                updated_at: r.updated_at,
            };
            let read = to_read(&comment, reply_to, true);
            to_admin_item(
                read,
                r.post_slug,
                r.post_title,
                comment.root_comment_id.is_some(),
            )
        })
        .collect();

    Ok(AdminCommentFeed { total_count, items })
}

// ── helpers ─────────────────────────────────────────────────────────────────

async fn fetch_comment_row(
    pool: &PgPool,
    comment_id: Uuid,
) -> Result<Option<CommentRow>, sqlx::Error> {
    sqlx::query_as::<_, CommentRow>(
        r#"
        SELECT id, post_id, root_comment_id, reply_to_comment_id,
               author_name, author_type, password_hash,
               visibility, status, body, created_at, updated_at
        FROM post_comments
        WHERE id = $1
        "#,
    )
    .bind(comment_id)
    .fetch_optional(pool)
    .await
}

async fn resolve_reply_target(
    pool: &PgPool,
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
