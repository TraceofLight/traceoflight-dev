use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use utoipa::ToSchema;
use uuid::Uuid;

/// Match Pydantic v2's default datetime serialization: ISO-8601 with 6-digit
/// microsecond precision and `Z` suffix, regardless of the source value's
/// fractional precision. Required so byte-level contract diff against FastAPI
/// stays clean.
fn serialize_dt_us<S: serde::Serializer>(dt: &DateTime<Utc>, ser: S) -> Result<S::Ok, S::Error> {
    ser.serialize_str(&dt.format("%Y-%m-%dT%H:%M:%S%.6fZ").to_string())
}

fn serialize_dt_us_opt<S: serde::Serializer>(
    opt: &Option<DateTime<Utc>>,
    ser: S,
) -> Result<S::Ok, S::Error> {
    match opt {
        Some(dt) => serialize_dt_us(dt, ser),
        None => ser.serialize_none(),
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, sqlx::Type, ToSchema, PartialEq, Eq)]
#[sqlx(type_name = "post_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum PostStatus {
    Draft,
    Published,
    Archived,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, sqlx::Type, ToSchema, PartialEq, Eq)]
#[sqlx(type_name = "post_visibility", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum PostVisibility {
    Public,
    Private,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, sqlx::Type, ToSchema, PartialEq, Eq)]
#[sqlx(type_name = "post_content_kind", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum PostContentKind {
    Blog,
    Project,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, sqlx::Type, ToSchema, PartialEq, Eq)]
#[sqlx(type_name = "post_locale", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum PostLocale {
    Ko,
    En,
    Ja,
    Zh,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, sqlx::Type, ToSchema, PartialEq, Eq)]
#[sqlx(type_name = "post_top_media_kind", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum PostTopMediaKind {
    Image,
    Youtube,
    Video,
}

#[derive(Debug, Serialize, FromRow, ToSchema)]
pub struct TagRead {
    pub slug: String,
    pub label: String,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct ProjectResourceLink {
    pub label: String,
    pub href: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ProjectProfileRead {
    pub period_label: String,
    pub role_summary: String,
    pub project_intro: Option<String>,
    pub card_image_url: String,
    pub highlights_json: Vec<String>,
    pub resource_links_json: Vec<ProjectResourceLink>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct PostRead {
    pub id: Uuid,
    pub slug: String,
    pub title: String,
    pub excerpt: Option<String>,
    pub cover_image_url: Option<String>,
    pub top_media_kind: PostTopMediaKind,
    pub top_media_image_url: Option<String>,
    pub top_media_youtube_url: Option<String>,
    pub top_media_video_url: Option<String>,
    pub series_title: Option<String>,
    pub content_kind: PostContentKind,
    pub status: PostStatus,
    pub visibility: PostVisibility,
    #[serde(serialize_with = "serialize_dt_us_opt")]
    pub published_at: Option<DateTime<Utc>>,
    pub tags: Vec<TagRead>,
    pub comment_count: i64,
    #[serde(serialize_with = "serialize_dt_us")]
    pub created_at: DateTime<Utc>,
    #[serde(serialize_with = "serialize_dt_us")]
    pub updated_at: DateTime<Utc>,
    pub body_markdown: String,
    pub locale: PostLocale,
    pub translation_group_id: Uuid,
    pub source_post_id: Option<Uuid>,
    /// Series projection used by detail navigation. Not yet ported from
    /// FastAPI; always serialized as null for now (see plan: Step 2 defers).
    #[schema(value_type = Object, nullable)]
    pub series_context: Option<serde_json::Value>,
    pub project_profile: Option<ProjectProfileRead>,
}

#[derive(Debug, FromRow)]
struct PostRow {
    id: Uuid,
    slug: String,
    title: String,
    excerpt: Option<String>,
    body_markdown: String,
    cover_image_url: Option<String>,
    top_media_kind: PostTopMediaKind,
    top_media_image_url: Option<String>,
    top_media_youtube_url: Option<String>,
    top_media_video_url: Option<String>,
    series_title: Option<String>,
    locale: PostLocale,
    translation_group_id: Uuid,
    source_post_id: Option<Uuid>,
    content_kind: PostContentKind,
    status: PostStatus,
    visibility: PostVisibility,
    published_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(Debug, Default, Clone, Copy)]
pub struct PostFilter {
    pub status: Option<PostStatus>,
    pub visibility: Option<PostVisibility>,
    pub content_kind: Option<PostContentKind>,
    pub locale: Option<PostLocale>,
}

pub async fn get_post_by_slug(
    pool: &PgPool,
    slug: &str,
    filter: PostFilter,
) -> Result<Option<PostRead>, sqlx::Error> {
    let row = sqlx::query_as::<_, PostRow>(
        r#"
        SELECT
            id, slug, title, excerpt, body_markdown,
            cover_image_url, top_media_kind, top_media_image_url,
            top_media_youtube_url, top_media_video_url, series_title,
            locale, translation_group_id, source_post_id,
            content_kind, status, visibility, published_at,
            created_at, updated_at
        FROM posts
        WHERE slug = $1
          AND ($2::post_status      IS NULL OR status      = $2)
          AND ($3::post_visibility  IS NULL OR visibility  = $3)
          AND ($4::post_content_kind IS NULL OR content_kind = $4)
          AND ($5::post_locale      IS NULL OR locale      = $5)
        LIMIT 1
        "#,
    )
    .bind(slug)
    .bind(filter.status)
    .bind(filter.visibility)
    .bind(filter.content_kind)
    .bind(filter.locale)
    .fetch_optional(pool)
    .await?;

    let Some(row) = row else { return Ok(None) };

    let tags = fetch_tags_for_post(pool, row.id).await?;
    let comment_count = count_comments(pool, row.id).await?;
    let project_profile = if matches!(row.content_kind, PostContentKind::Project) {
        fetch_project_profile(pool, row.id).await?
    } else {
        None
    };

    Ok(Some(PostRead {
        id: row.id,
        slug: row.slug,
        title: row.title,
        excerpt: row.excerpt,
        cover_image_url: row.cover_image_url,
        top_media_kind: row.top_media_kind,
        top_media_image_url: row.top_media_image_url,
        top_media_youtube_url: row.top_media_youtube_url,
        top_media_video_url: row.top_media_video_url,
        series_title: row.series_title,
        content_kind: row.content_kind,
        status: row.status,
        visibility: row.visibility,
        published_at: row.published_at,
        tags,
        comment_count,
        created_at: row.created_at,
        updated_at: row.updated_at,
        body_markdown: row.body_markdown,
        locale: row.locale,
        translation_group_id: row.translation_group_id,
        source_post_id: row.source_post_id,
        series_context: None,
        project_profile,
    }))
}

async fn fetch_tags_for_post(pool: &PgPool, post_id: Uuid) -> Result<Vec<TagRead>, sqlx::Error> {
    sqlx::query_as::<_, TagRead>(
        r#"
        SELECT t.slug, t.label
        FROM tags t
        JOIN post_tags pt ON pt.tag_id = t.id
        WHERE pt.post_id = $1
        ORDER BY t.slug ASC
        "#,
    )
    .bind(post_id)
    .fetch_all(pool)
    .await
}

async fn count_comments(pool: &PgPool, post_id: Uuid) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar::<_, i64>(
        r#"SELECT COUNT(*) FROM post_comments WHERE post_id = $1"#,
    )
    .bind(post_id)
    .fetch_one(pool)
    .await
}

#[derive(Debug, FromRow)]
struct ProjectProfileRow {
    period_label: String,
    role_summary: String,
    project_intro: Option<String>,
    card_image_url: String,
    highlights_json: serde_json::Value,
    resource_links_json: serde_json::Value,
}

async fn fetch_project_profile(
    pool: &PgPool,
    post_id: Uuid,
) -> Result<Option<ProjectProfileRead>, sqlx::Error> {
    let row = sqlx::query_as::<_, ProjectProfileRow>(
        r#"
        SELECT period_label, role_summary, project_intro, card_image_url,
               highlights_json, resource_links_json
        FROM project_profiles
        WHERE post_id = $1
        LIMIT 1
        "#,
    )
    .bind(post_id)
    .fetch_optional(pool)
    .await?;

    let Some(row) = row else { return Ok(None) };

    let highlights: Vec<String> = serde_json::from_value(row.highlights_json).unwrap_or_default();
    let resource_links: Vec<ProjectResourceLink> =
        serde_json::from_value(row.resource_links_json).unwrap_or_default();

    Ok(Some(ProjectProfileRead {
        period_label: row.period_label,
        role_summary: row.role_summary,
        project_intro: row.project_intro,
        card_image_url: row.card_image_url,
        highlights_json: highlights,
        resource_links_json: resource_links,
    }))
}
