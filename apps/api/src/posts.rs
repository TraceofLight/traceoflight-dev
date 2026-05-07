use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::error::AppError;

/// Always render datetimes with 6-digit microsecond precision and `Z` suffix,
/// independent of the stored value's fractional precision. Keeps the JSON
/// representation stable byte-for-byte across rows.
pub fn serialize_dt_us<S: serde::Serializer>(
    dt: &DateTime<Utc>,
    ser: S,
) -> Result<S::Ok, S::Error> {
    ser.serialize_str(&dt.format("%Y-%m-%dT%H:%M:%S%.6fZ").to_string())
}

pub fn serialize_dt_us_opt<S: serde::Serializer>(
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

impl PostLocale {
    pub fn as_str(&self) -> &'static str {
        match self {
            PostLocale::Ko => "ko",
            PostLocale::En => "en",
            PostLocale::Ja => "ja",
            PostLocale::Zh => "zh",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, sqlx::Type, ToSchema, PartialEq, Eq)]
#[sqlx(type_name = "post_top_media_kind", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum PostTopMediaKind {
    Image,
    Youtube,
    Video,
}

#[derive(Debug, Clone, Serialize, FromRow, ToSchema)]
pub struct TagRead {
    pub slug: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct PostSeriesContext {
    pub series_slug: String,
    pub series_title: String,
    pub order_index: i32,
    pub total_posts: i64,
    pub prev_post_slug: Option<String>,
    pub prev_post_title: Option<String>,
    pub next_post_slug: Option<String>,
    pub next_post_title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ProjectResourceLink {
    pub label: String,
    pub href: String,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
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
    pub series_context: Option<PostSeriesContext>,
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

#[derive(Debug, Deserialize, ToSchema)]
pub struct ProjectProfilePayload {
    pub period_label: String,
    pub role_summary: String,
    pub project_intro: Option<String>,
    pub card_image_url: String,
    #[serde(default)]
    pub highlights: Vec<String>,
    #[serde(default)]
    pub resource_links: Vec<ProjectResourceLink>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct PostCreate {
    pub slug: String,
    pub title: String,
    pub excerpt: Option<String>,
    pub body_markdown: String,
    pub cover_image_url: Option<String>,
    #[serde(default = "default_top_media_kind")]
    pub top_media_kind: PostTopMediaKind,
    pub top_media_image_url: Option<String>,
    pub top_media_youtube_url: Option<String>,
    pub top_media_video_url: Option<String>,
    pub series_title: Option<String>,
    #[serde(default = "default_content_kind")]
    pub content_kind: PostContentKind,
    #[serde(default = "default_status")]
    pub status: PostStatus,
    #[serde(default = "default_visibility")]
    pub visibility: PostVisibility,
    pub published_at: Option<DateTime<Utc>>,
    #[serde(default = "default_locale")]
    pub locale: PostLocale,
    pub translation_group_id: Option<Uuid>,
    pub source_post_id: Option<Uuid>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub project_profile: Option<ProjectProfilePayload>,
}

fn default_top_media_kind() -> PostTopMediaKind {
    PostTopMediaKind::Image
}
fn default_content_kind() -> PostContentKind {
    PostContentKind::Blog
}
fn default_status() -> PostStatus {
    PostStatus::Draft
}
fn default_visibility() -> PostVisibility {
    PostVisibility::Public
}
fn default_locale() -> PostLocale {
    PostLocale::Ko
}

#[derive(Debug, Default, Clone, Copy)]
pub struct PostFilter {
    pub status: Option<PostStatus>,
    pub visibility: Option<PostVisibility>,
    pub content_kind: Option<PostContentKind>,
    pub locale: Option<PostLocale>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, ToSchema, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TagMatch {
    Any,
    All,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, ToSchema, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum PostSortMode {
    #[default]
    Latest,
    Oldest,
    Title,
}

impl Default for TagMatch {
    fn default() -> Self {
        Self::Any
    }
}

#[derive(Debug, Clone)]
pub struct ListPostsParams {
    pub limit: i64,
    pub offset: i64,
    pub status: Option<PostStatus>,
    pub visibility: Option<PostVisibility>,
    pub content_kind: Option<PostContentKind>,
    pub locale: Option<PostLocale>,
    pub tags: Vec<String>,
    pub tag_match: TagMatch,
}

impl Default for ListPostsParams {
    fn default() -> Self {
        Self {
            limit: 20,
            offset: 0,
            status: None,
            visibility: None,
            content_kind: None,
            locale: None,
            tags: Vec::new(),
            tag_match: TagMatch::Any,
        }
    }
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
    // Caller asking exactly for published+public is the anonymous read path;
    // any other filter combination is a trusted caller and the series-listing
    // visibility filter is dropped accordingly.
    let public_only = matches!(filter.status, Some(PostStatus::Published))
        && matches!(filter.visibility, Some(PostVisibility::Public));
    let series_context = attach_series_context(pool, row.id, &row.slug, public_only).await?;

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
        series_context,
        project_profile,
    }))
}

#[derive(Debug, FromRow)]
struct SeriesMappingRow {
    series_id: Uuid,
    series_slug: String,
    series_title: String,
    order_index: i32,
}

#[derive(Debug, FromRow)]
struct SeriesPostListingRow {
    slug: String,
    title: String,
    status: PostStatus,
    visibility: PostVisibility,
}

/// Build the in-series prev/next/total projection for a single post. Two
/// queries: (1) post → owning series mapping, (2) the ordered post listing
/// for that series. prev/next/total_posts is then computed in memory after
/// the optional public_only filter is applied.
async fn attach_series_context(
    pool: &PgPool,
    post_id: Uuid,
    post_slug: &str,
    public_only: bool,
) -> Result<Option<PostSeriesContext>, sqlx::Error> {
    let mapping = sqlx::query_as::<_, SeriesMappingRow>(
        r#"
        SELECT s.id AS series_id, s.slug AS series_slug, s.title AS series_title,
               sp.order_index
        FROM series_posts sp
        JOIN series s ON s.id = sp.series_id
        WHERE sp.post_id = $1
        LIMIT 1
        "#,
    )
    .bind(post_id)
    .fetch_optional(pool)
    .await?;

    let Some(mapping) = mapping else {
        return Ok(None);
    };

    let listing = sqlx::query_as::<_, SeriesPostListingRow>(
        r#"
        SELECT p.slug, p.title, p.status, p.visibility
        FROM series_posts sp
        JOIN posts p ON p.id = sp.post_id
        WHERE sp.series_id = $1
        ORDER BY sp.order_index ASC
        "#,
    )
    .bind(mapping.series_id)
    .fetch_all(pool)
    .await?;

    let filtered: Vec<&SeriesPostListingRow> = if public_only {
        listing
            .iter()
            .filter(|r| {
                matches!(r.status, PostStatus::Published)
                    && matches!(r.visibility, PostVisibility::Public)
            })
            .collect()
    } else {
        listing.iter().collect()
    };

    let Some(current_idx) = filtered.iter().position(|r| r.slug == post_slug) else {
        return Ok(None);
    };

    let prev = current_idx
        .checked_sub(1)
        .and_then(|i| filtered.get(i).copied());
    let next = filtered.get(current_idx + 1).copied();

    Ok(Some(PostSeriesContext {
        series_slug: mapping.series_slug,
        series_title: mapping.series_title,
        order_index: mapping.order_index,
        total_posts: filtered.len() as i64,
        prev_post_slug: prev.map(|r| r.slug.clone()),
        prev_post_title: prev.map(|r| r.title.clone()),
        next_post_slug: next.map(|r| r.slug.clone()),
        next_post_title: next.map(|r| r.title.clone()),
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
    sqlx::query_scalar::<_, i64>(r#"SELECT COUNT(*) FROM post_comments WHERE post_id = $1"#)
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

// ── Delete endpoint ─────────────────────────────────────────────────────────

/// Delete a post and all of its translations (every row in the same
/// `translation_group_id`). Status/visibility filters apply only to the
/// initial slug lookup — once a logical post is targeted, all locale rows
/// in its group are removed atomically. Related rows in `post_tags`,
/// `project_profiles`, `series_posts`, and `post_comments` are cleaned up
/// by `ON DELETE CASCADE` FKs.
pub async fn delete_post_by_slug(
    pool: &PgPool,
    slug: &str,
    status: Option<PostStatus>,
    visibility: Option<PostVisibility>,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query(
        r#"
        DELETE FROM posts
        WHERE translation_group_id = (
            SELECT translation_group_id FROM posts
             WHERE slug = $1
               AND ($2::post_status     IS NULL OR status     = $2)
               AND ($3::post_visibility IS NULL OR visibility = $3)
             LIMIT 1
        )
        "#,
    )
    .bind(slug)
    .bind(status)
    .bind(visibility)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

// ── List endpoint ───────────────────────────────────────────────────────────

/// Canonical tag-slug shape used by both filtering and storage:
/// trim → lowercase → underscores and whitespace become dashes → drop non-
/// alphanumerics → collapse multi-dash → strip surrounding dashes.
pub fn normalize_tag_slug(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut last_dash = false;
    for c in value.trim().to_lowercase().chars() {
        let mapped = if c == '_' || c.is_whitespace() {
            '-'
        } else if c.is_alphanumeric() || c == '-' {
            c
        } else {
            continue;
        };
        if mapped == '-' {
            if !last_dash {
                out.push('-');
                last_dash = true;
            }
        } else {
            out.push(mapped);
            last_dash = false;
        }
    }
    out.trim_matches('-').to_string()
}

fn normalize_tag_slugs(raw: &[String]) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for r in raw {
        let slug = normalize_tag_slug(r);
        if slug.is_empty() || !seen.insert(slug.clone()) {
            continue;
        }
        out.push(slug);
    }
    out
}

#[derive(Debug, FromRow)]
struct TagBulkRow {
    post_id: Uuid,
    slug: String,
    label: String,
}

async fn fetch_tags_bulk(
    pool: &PgPool,
    post_ids: &[Uuid],
) -> Result<HashMap<Uuid, Vec<TagRead>>, sqlx::Error> {
    if post_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let rows = sqlx::query_as::<_, TagBulkRow>(
        r#"
        SELECT pt.post_id, t.slug, t.label
        FROM post_tags pt
        JOIN tags t ON t.id = pt.tag_id
        WHERE pt.post_id = ANY($1)
        ORDER BY pt.post_id, t.slug ASC
        "#,
    )
    .bind(post_ids)
    .fetch_all(pool)
    .await?;

    let mut map: HashMap<Uuid, Vec<TagRead>> = HashMap::new();
    for r in rows {
        map.entry(r.post_id).or_default().push(TagRead {
            slug: r.slug,
            label: r.label,
        });
    }
    Ok(map)
}

#[derive(Debug, FromRow)]
struct CommentCountRow {
    post_id: Uuid,
    cnt: i64,
}

async fn count_comments_bulk(
    pool: &PgPool,
    post_ids: &[Uuid],
) -> Result<HashMap<Uuid, i64>, sqlx::Error> {
    if post_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let rows = sqlx::query_as::<_, CommentCountRow>(
        r#"
        SELECT post_id, COUNT(*)::int8 AS cnt
        FROM post_comments
        WHERE post_id = ANY($1)
        GROUP BY post_id
        "#,
    )
    .bind(post_ids)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(|r| (r.post_id, r.cnt)).collect())
}

#[derive(Debug, FromRow)]
struct ProjectProfileBulkRow {
    post_id: Uuid,
    period_label: String,
    role_summary: String,
    project_intro: Option<String>,
    card_image_url: String,
    highlights_json: serde_json::Value,
    resource_links_json: serde_json::Value,
}

async fn fetch_project_profiles_bulk(
    pool: &PgPool,
    post_ids: &[Uuid],
) -> Result<HashMap<Uuid, ProjectProfileRead>, sqlx::Error> {
    if post_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let rows = sqlx::query_as::<_, ProjectProfileBulkRow>(
        r#"
        SELECT post_id, period_label, role_summary, project_intro, card_image_url,
               highlights_json, resource_links_json
        FROM project_profiles
        WHERE post_id = ANY($1)
        "#,
    )
    .bind(post_ids)
    .fetch_all(pool)
    .await?;

    let mut map = HashMap::new();
    for r in rows {
        let highlights: Vec<String> = serde_json::from_value(r.highlights_json).unwrap_or_default();
        let resource_links: Vec<ProjectResourceLink> =
            serde_json::from_value(r.resource_links_json).unwrap_or_default();
        map.insert(
            r.post_id,
            ProjectProfileRead {
                period_label: r.period_label,
                role_summary: r.role_summary,
                project_intro: r.project_intro,
                card_image_url: r.card_image_url,
                highlights_json: highlights,
                resource_links_json: resource_links,
            },
        );
    }
    Ok(map)
}

#[derive(Debug, FromRow)]
struct SeriesMappingBulkRow {
    post_id: Uuid,
    series_id: Uuid,
    series_slug: String,
    series_title: String,
    order_index: i32,
}

#[derive(Debug, FromRow)]
struct SeriesListingBulkRow {
    series_id: Uuid,
    slug: String,
    title: String,
    status: PostStatus,
    visibility: PostVisibility,
}

/// Bulk variant of the single-post series-context attach. Issues two queries
/// regardless of input size: the post→series mapping batch and the ordered
/// post listings for every involved series. prev/next/total is then computed
/// in memory per post.
async fn attach_series_context_bulk(
    pool: &PgPool,
    posts: &[PostRow],
    public_only: bool,
) -> Result<HashMap<Uuid, PostSeriesContext>, sqlx::Error> {
    if posts.is_empty() {
        return Ok(HashMap::new());
    }
    let post_ids: Vec<Uuid> = posts.iter().map(|p| p.id).collect();

    let mappings = sqlx::query_as::<_, SeriesMappingBulkRow>(
        r#"
        SELECT sp.post_id, s.id AS series_id, s.slug AS series_slug,
               s.title AS series_title, sp.order_index
        FROM series_posts sp
        JOIN series s ON s.id = sp.series_id
        WHERE sp.post_id = ANY($1)
        "#,
    )
    .bind(&post_ids)
    .fetch_all(pool)
    .await?;

    if mappings.is_empty() {
        return Ok(HashMap::new());
    }

    let mut by_post: HashMap<Uuid, SeriesMappingBulkRow> = HashMap::new();
    let mut series_ids: Vec<Uuid> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for m in mappings {
        if seen.insert(m.series_id) {
            series_ids.push(m.series_id);
        }
        by_post.insert(m.post_id, m);
    }

    let listings = sqlx::query_as::<_, SeriesListingBulkRow>(
        r#"
        SELECT sp.series_id, p.slug, p.title, p.status, p.visibility
        FROM series_posts sp
        JOIN posts p ON p.id = sp.post_id
        WHERE sp.series_id = ANY($1)
        ORDER BY sp.series_id, sp.order_index ASC
        "#,
    )
    .bind(&series_ids)
    .fetch_all(pool)
    .await?;

    let mut by_series: HashMap<Uuid, Vec<SeriesListingBulkRow>> = HashMap::new();
    for l in listings {
        by_series.entry(l.series_id).or_default().push(l);
    }

    let mut result = HashMap::new();
    for post in posts {
        let Some(mapping) = by_post.get(&post.id) else {
            continue;
        };
        let Some(listing) = by_series.get(&mapping.series_id) else {
            continue;
        };

        let filtered: Vec<&SeriesListingBulkRow> = if public_only {
            listing
                .iter()
                .filter(|r| {
                    matches!(r.status, PostStatus::Published)
                        && matches!(r.visibility, PostVisibility::Public)
                })
                .collect()
        } else {
            listing.iter().collect()
        };

        let Some(idx) = filtered.iter().position(|r| r.slug == post.slug) else {
            continue;
        };
        let prev = idx.checked_sub(1).and_then(|i| filtered.get(i).copied());
        let next = filtered.get(idx + 1).copied();

        result.insert(
            post.id,
            PostSeriesContext {
                series_slug: mapping.series_slug.clone(),
                series_title: mapping.series_title.clone(),
                order_index: mapping.order_index,
                total_posts: filtered.len() as i64,
                prev_post_slug: prev.map(|r| r.slug.clone()),
                prev_post_title: prev.map(|r| r.title.clone()),
                next_post_slug: next.map(|r| r.slug.clone()),
                next_post_title: next.map(|r| r.title.clone()),
            },
        );
    }
    Ok(result)
}

pub async fn list_posts(
    pool: &PgPool,
    params: &ListPostsParams,
) -> Result<Vec<PostRead>, sqlx::Error> {
    let normalized_tags = normalize_tag_slugs(&params.tags);
    let is_all_match = matches!(params.tag_match, TagMatch::All);
    let project_prefix = if matches!(params.content_kind, Some(PostContentKind::Project)) {
        "project_order_index ASC NULLS LAST,"
    } else {
        ""
    };

    // Listing order:
    //   - status=published → published_at DESC NULLS LAST, created_at DESC, slug DESC
    //   - otherwise (None / draft / archived) → created_at DESC, slug DESC
    // Project content kind always prepends `project_order_index ASC NULLS LAST`.
    let main_ordering = match params.status {
        Some(PostStatus::Published) => "published_at DESC NULLS LAST, created_at DESC, slug DESC",
        _ => "created_at DESC, slug DESC",
    };

    let sql = format!(
        r#"
        SELECT
            id, slug, title, excerpt, body_markdown,
            cover_image_url, top_media_kind, top_media_image_url,
            top_media_youtube_url, top_media_video_url, series_title,
            locale, translation_group_id, source_post_id,
            content_kind, status, visibility, published_at,
            created_at, updated_at
        FROM posts
        WHERE ($1::post_status      IS NULL OR status      = $1)
          AND ($2::post_visibility  IS NULL OR visibility  = $2)
          AND ($3::post_content_kind IS NULL OR content_kind = $3)
          AND ($4::post_locale      IS NULL OR locale      = $4)
          AND (
              array_length($7::text[], 1) IS NULL
              OR id IN (
                  SELECT pt.post_id
                  FROM post_tags pt
                  JOIN tags t ON t.id = pt.tag_id
                  WHERE t.slug = ANY($7::text[])
                  GROUP BY pt.post_id
                  HAVING (NOT $8::boolean OR COUNT(DISTINCT t.slug) = cardinality($7::text[]))
              )
          )
        ORDER BY {project_prefix} {main_ordering}
        LIMIT $5 OFFSET $6
        "#
    );

    let rows = sqlx::query_as::<_, PostRow>(&sql)
        .bind(params.status)
        .bind(params.visibility)
        .bind(params.content_kind)
        .bind(params.locale)
        .bind(params.limit)
        .bind(params.offset)
        .bind(&normalized_tags)
        .bind(is_all_match)
        .fetch_all(pool)
        .await?;

    if rows.is_empty() {
        return Ok(Vec::new());
    }

    let post_ids: Vec<Uuid> = rows.iter().map(|r| r.id).collect();
    let mut tags_by_post = fetch_tags_bulk(pool, &post_ids).await?;
    let comments_by_post = count_comments_bulk(pool, &post_ids).await?;
    let mut profiles_by_post = fetch_project_profiles_bulk(pool, &post_ids).await?;

    let public_only = matches!(params.status, Some(PostStatus::Published))
        && matches!(params.visibility, Some(PostVisibility::Public));
    let mut series_by_post = attach_series_context_bulk(pool, &rows, public_only).await?;

    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        let id = row.id;
        out.push(PostRead {
            id,
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
            tags: tags_by_post.remove(&id).unwrap_or_default(),
            comment_count: comments_by_post.get(&id).copied().unwrap_or(0),
            created_at: row.created_at,
            updated_at: row.updated_at,
            body_markdown: row.body_markdown,
            locale: row.locale,
            translation_group_id: row.translation_group_id,
            source_post_id: row.source_post_id,
            series_context: series_by_post.remove(&id),
            project_profile: profiles_by_post.remove(&id),
        });
    }
    Ok(out)
}

// ── Create endpoint ─────────────────────────────────────────────────────────

fn normalize_optional_text(value: &Option<String>) -> Option<String> {
    value
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Map sqlx errors into application errors. Postgres unique-constraint
/// violation surfaces as a 409 Conflict; everything else falls through.
fn map_create_error(err: sqlx::Error) -> AppError {
    if let Some(db_err) = err.as_database_error() {
        if db_err.code().as_deref() == Some("23505") {
            return AppError::Conflict("post slug already exists".into());
        }
    }
    AppError::Database(err)
}

/// Create a post and its M2M / project-profile relations in a single
/// transaction. Returns the freshly-rehydrated [`PostRead`] so the response
/// shape matches `GET /posts/{slug}`.
pub async fn create_post(pool: &PgPool, payload: PostCreate) -> Result<PostRead, AppError> {
    let post_id = Uuid::new_v4();
    let translation_group_id = payload.translation_group_id.unwrap_or_else(Uuid::new_v4);
    let series_title = normalize_optional_text(&payload.series_title);
    let published_at = match (payload.status, payload.published_at) {
        (PostStatus::Published, None) => Some(Utc::now()),
        (_, ts) => ts,
    };
    let normalized_tag_slugs = normalize_tag_slugs(&payload.tags);
    let locale = payload.locale;
    let slug = payload.slug.clone();

    let mut tx = pool.begin().await?;

    sqlx::query(
        r#"
        INSERT INTO posts (
            id, slug, title, excerpt, body_markdown, cover_image_url,
            top_media_kind, top_media_image_url, top_media_youtube_url, top_media_video_url,
            series_title, locale, translation_group_id, source_post_id,
            translation_status, translation_source_kind,
            content_kind, status, visibility, published_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10,
            $11, $12, $13, $14,
            'source'::post_translation_status, 'manual'::post_translation_source_kind,
            $15, $16, $17, $18
        )
        "#,
    )
    .bind(post_id)
    .bind(&slug)
    .bind(&payload.title)
    .bind(&payload.excerpt)
    .bind(&payload.body_markdown)
    .bind(&payload.cover_image_url)
    .bind(payload.top_media_kind)
    .bind(&payload.top_media_image_url)
    .bind(&payload.top_media_youtube_url)
    .bind(&payload.top_media_video_url)
    .bind(&series_title)
    .bind(locale)
    .bind(translation_group_id)
    .bind(payload.source_post_id)
    .bind(payload.content_kind)
    .bind(payload.status)
    .bind(payload.visibility)
    .bind(published_at)
    .execute(&mut *tx)
    .await
    .map_err(map_create_error)?;

    // The newly-claimed slug supersedes any redirect that pointed at it as the
    // old slug (otherwise we'd have ambiguity: same slug both alive and as a
    // redirect target).
    sqlx::query("DELETE FROM post_slug_redirects WHERE locale = $1 AND old_slug = $2")
        .bind(locale)
        .bind(&slug)
        .execute(&mut *tx)
        .await?;

    if matches!(payload.content_kind, PostContentKind::Project) {
        if let Some(profile) = &payload.project_profile {
            insert_project_profile(&mut tx, post_id, profile).await?;
        }
    }

    if !normalized_tag_slugs.is_empty() {
        sqlx::query(
            r#"
            INSERT INTO tags (id, slug, label)
            SELECT gen_random_uuid(), s, s FROM unnest($1::text[]) AS s
            ON CONFLICT (slug) DO NOTHING
            "#,
        )
        .bind(&normalized_tag_slugs)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            r#"
            INSERT INTO post_tags (post_id, tag_id)
            SELECT $1, t.id FROM tags t WHERE t.slug = ANY($2::text[])
            "#,
        )
        .bind(post_id)
        .bind(&normalized_tag_slugs)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    let filter = PostFilter {
        status: None,
        visibility: None,
        content_kind: None,
        locale: Some(locale),
    };
    get_post_by_slug(pool, &slug, filter)
        .await?
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("post disappeared after insert")))
}

// ── Redirect resolver ───────────────────────────────────────────────────────

/// Look up a stored slug redirect and the canonical target. The lookup is
/// gated on the target being a currently-published, currently-public blog
/// post — drafts, private posts, projects, and any in-flight `archived` row
/// are not exposed here. On hit the redirect's counter and timestamp are
/// bumped before returning.
pub async fn resolve_post_redirect(
    pool: &PgPool,
    old_slug: &str,
    locale: PostLocale,
) -> Result<Option<String>, sqlx::Error> {
    let row: Option<(Uuid, String)> = sqlx::query_as(
        r#"
        SELECT psr.id, p.slug
        FROM post_slug_redirects psr
        JOIN posts p ON p.id = psr.target_post_id
        WHERE psr.locale = $1
          AND psr.old_slug = $2
          AND p.content_kind = 'blog'::post_content_kind
          AND p.status      = 'published'::post_status
          AND p.visibility  = 'public'::post_visibility
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
        UPDATE post_slug_redirects
        SET hit_count = hit_count + 1, last_hit_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(redirect_id)
    .execute(pool)
    .await?;

    Ok(Some(target_slug))
}

// ── Update endpoint ─────────────────────────────────────────────────────────

#[derive(Debug, FromRow)]
struct ExistingPostRow {
    id: Uuid,
    slug: String,
    status: PostStatus,
    published_at: Option<DateTime<Utc>>,
    translation_group_id: Uuid,
    source_post_id: Option<Uuid>,
}

/// Apply a [`PostCreate`] payload to the existing row identified by
/// `current_slug`. Returns `Ok(None)` when no row matches (→ 404). On a
/// successful slug change, the previous slug is recorded as a redirect so
/// inbound traffic to the old URL keeps resolving.
pub async fn update_post_by_slug(
    pool: &PgPool,
    current_slug: &str,
    payload: PostCreate,
) -> Result<Option<PostRead>, AppError> {
    let existing = sqlx::query_as::<_, ExistingPostRow>(
        r#"
        SELECT id, slug, status, published_at, translation_group_id, source_post_id
        FROM posts WHERE slug = $1 LIMIT 1
        "#,
    )
    .bind(current_slug)
    .fetch_optional(pool)
    .await?;
    let Some(existing) = existing else {
        return Ok(None);
    };

    let series_title = normalize_optional_text(&payload.series_title);
    let translation_group_id = payload
        .translation_group_id
        .unwrap_or(existing.translation_group_id);
    let source_post_id = payload.source_post_id.or(existing.source_post_id);

    // published_at carry-over rules:
    //   - both old and new state are Published: keep the original publish ts
    //   - new state is Published with no explicit ts: stamp now
    //   - any other shape: take whatever the payload supplied (incl. None)
    let published_at = match (existing.status, payload.status, payload.published_at) {
        (PostStatus::Published, PostStatus::Published, _) => existing.published_at,
        (_, PostStatus::Published, None) => Some(Utc::now()),
        (_, _, supplied) => supplied,
    };

    let normalized_tag_slugs = normalize_tag_slugs(&payload.tags);
    let new_slug = payload.slug.clone();
    let locale = payload.locale;

    let mut tx = pool.begin().await?;

    sqlx::query(
        r#"
        UPDATE posts SET
            slug = $1, title = $2, excerpt = $3, body_markdown = $4, cover_image_url = $5,
            top_media_kind = $6, top_media_image_url = $7, top_media_youtube_url = $8,
            top_media_video_url = $9, series_title = $10, locale = $11,
            translation_group_id = $12, source_post_id = $13,
            content_kind = $14, status = $15, visibility = $16, published_at = $17,
            updated_at = NOW()
        WHERE id = $18
        "#,
    )
    .bind(&new_slug)
    .bind(&payload.title)
    .bind(&payload.excerpt)
    .bind(&payload.body_markdown)
    .bind(&payload.cover_image_url)
    .bind(payload.top_media_kind)
    .bind(&payload.top_media_image_url)
    .bind(&payload.top_media_youtube_url)
    .bind(&payload.top_media_video_url)
    .bind(&series_title)
    .bind(locale)
    .bind(translation_group_id)
    .bind(source_post_id)
    .bind(payload.content_kind)
    .bind(payload.status)
    .bind(payload.visibility)
    .bind(published_at)
    .bind(existing.id)
    .execute(&mut *tx)
    .await
    .map_err(map_create_error)?;

    if existing.slug != new_slug {
        record_post_rename(&mut tx, &existing.slug, &new_slug, locale, existing.id).await?;
    }

    if matches!(payload.content_kind, PostContentKind::Project) {
        if let Some(profile) = &payload.project_profile {
            upsert_project_profile(&mut tx, existing.id, profile).await?;
        }
    } else {
        sqlx::query("DELETE FROM project_profiles WHERE post_id = $1")
            .bind(existing.id)
            .execute(&mut *tx)
            .await?;
    }

    sqlx::query("DELETE FROM post_tags WHERE post_id = $1")
        .bind(existing.id)
        .execute(&mut *tx)
        .await?;
    if !normalized_tag_slugs.is_empty() {
        sqlx::query(
            r#"
            INSERT INTO tags (id, slug, label)
            SELECT gen_random_uuid(), s, s FROM unnest($1::text[]) AS s
            ON CONFLICT (slug) DO NOTHING
            "#,
        )
        .bind(&normalized_tag_slugs)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            r#"
            INSERT INTO post_tags (post_id, tag_id)
            SELECT $1, t.id FROM tags t WHERE t.slug = ANY($2::text[])
            "#,
        )
        .bind(existing.id)
        .bind(&normalized_tag_slugs)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    let filter = PostFilter {
        status: None,
        visibility: None,
        content_kind: None,
        locale: Some(locale),
    };
    let post = get_post_by_slug(pool, &new_slug, filter)
        .await?
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("post disappeared after update")))?;
    Ok(Some(post))
}

async fn record_post_rename(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    old_slug: &str,
    new_slug: &str,
    locale: PostLocale,
    target_post_id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM post_slug_redirects WHERE locale = $1 AND old_slug = $2")
        .bind(locale)
        .bind(old_slug)
        .execute(&mut **tx)
        .await?;
    sqlx::query(
        r#"
        INSERT INTO post_slug_redirects (id, locale, old_slug, target_post_id, hit_count)
        VALUES (gen_random_uuid(), $1, $2, $3, 0)
        "#,
    )
    .bind(locale)
    .bind(old_slug)
    .bind(target_post_id)
    .execute(&mut **tx)
    .await?;
    sqlx::query("DELETE FROM post_slug_redirects WHERE locale = $1 AND old_slug = $2")
        .bind(locale)
        .bind(new_slug)
        .execute(&mut **tx)
        .await?;
    Ok(())
}

async fn upsert_project_profile(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    post_id: Uuid,
    profile: &ProjectProfilePayload,
) -> Result<(), sqlx::Error> {
    let project_intro = profile
        .project_intro
        .as_deref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let highlights_json =
        serde_json::to_value(&profile.highlights).unwrap_or(serde_json::json!([]));
    let resource_links_json =
        serde_json::to_value(&profile.resource_links).unwrap_or(serde_json::json!([]));

    sqlx::query(
        r#"
        INSERT INTO project_profiles (
            id, post_id, period_label, role_summary, project_intro, card_image_url,
            highlights_json, resource_links_json
        ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7
        )
        ON CONFLICT (post_id) DO UPDATE SET
            period_label = EXCLUDED.period_label,
            role_summary = EXCLUDED.role_summary,
            project_intro = EXCLUDED.project_intro,
            card_image_url = EXCLUDED.card_image_url,
            highlights_json = EXCLUDED.highlights_json,
            resource_links_json = EXCLUDED.resource_links_json,
            updated_at = NOW()
        "#,
    )
    .bind(post_id)
    .bind(&profile.period_label)
    .bind(&profile.role_summary)
    .bind(&project_intro)
    .bind(&profile.card_image_url)
    .bind(&highlights_json)
    .bind(&resource_links_json)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn insert_project_profile(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    post_id: Uuid,
    profile: &ProjectProfilePayload,
) -> Result<(), sqlx::Error> {
    let project_intro = profile
        .project_intro
        .as_deref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let highlights_json =
        serde_json::to_value(&profile.highlights).unwrap_or(serde_json::json!([]));
    let resource_links_json =
        serde_json::to_value(&profile.resource_links).unwrap_or(serde_json::json!([]));

    sqlx::query(
        r#"
        INSERT INTO project_profiles (
            id, post_id, period_label, role_summary, project_intro, card_image_url,
            highlights_json, resource_links_json
        ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7
        )
        "#,
    )
    .bind(post_id)
    .bind(&profile.period_label)
    .bind(&profile.role_summary)
    .bind(&project_intro)
    .bind(&profile.card_image_url)
    .bind(&highlights_json)
    .bind(&resource_links_json)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

// ── Summary list endpoint ───────────────────────────────────────────────────

#[derive(Debug, Serialize, FromRow, ToSchema)]
pub struct PostTagFilterRead {
    pub slug: String,
    pub count: i64,
}

#[derive(Debug, Default, Serialize, ToSchema)]
pub struct PostVisibilityCountsRead {
    pub all: i64,
    pub public: i64,
    pub private: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct PostSummaryRead {
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
    pub locale: PostLocale,
    pub content_kind: PostContentKind,
    pub status: PostStatus,
    pub visibility: PostVisibility,
    #[serde(serialize_with = "serialize_dt_us_opt")]
    pub published_at: Option<DateTime<Utc>>,
    pub reading_label: String,
    pub tags: Vec<TagRead>,
    pub comment_count: i64,
    #[serde(serialize_with = "serialize_dt_us")]
    pub created_at: DateTime<Utc>,
    #[serde(serialize_with = "serialize_dt_us")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct PostSummaryListRead {
    pub items: Vec<PostSummaryRead>,
    pub total_count: i64,
    pub next_offset: Option<i64>,
    pub has_more: bool,
    pub tag_filters: Vec<PostTagFilterRead>,
    pub visibility_counts: PostVisibilityCountsRead,
}

#[derive(Debug, Clone)]
pub struct ListSummariesParams {
    pub limit: i64,
    pub offset: i64,
    pub status: Option<PostStatus>,
    pub visibility: Option<PostVisibility>,
    pub content_kind: Option<PostContentKind>,
    pub locale: Option<PostLocale>,
    pub tags: Vec<String>,
    pub tag_match: TagMatch,
    pub query: Option<String>,
    pub sort: PostSortMode,
    pub include_private_visibility_counts: bool,
}

#[derive(Debug, FromRow)]
struct SummaryRow {
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
    content_kind: PostContentKind,
    status: PostStatus,
    visibility: PostVisibility,
    published_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

fn summary_ordering(sort: PostSortMode, status: Option<PostStatus>) -> &'static str {
    match sort {
        PostSortMode::Oldest => "published_at ASC NULLS LAST, created_at ASC, slug ASC",
        PostSortMode::Title => "title ASC, published_at DESC NULLS LAST, created_at DESC, slug ASC",
        PostSortMode::Latest => match status {
            Some(PostStatus::Published) => {
                "published_at DESC NULLS LAST, created_at DESC, slug DESC"
            }
            _ => "created_at DESC, slug DESC",
        },
    }
}

/// Filter clause shared by the list, count, tag-facet, and visibility-count
/// queries. Bind layout (1-indexed):
///   $1 status, $2 visibility, $3 content_kind, $4 locale,
///   $5 tags (text[]), $6 is_all_match (bool), $7 query (text)
/// Pass an empty `text[]` to disable the tag filter; pass NULL on $7 to skip
/// search.
const SUMMARY_FILTER_CLAUSE: &str = r#"
    ($1::post_status IS NULL OR status = $1)
    AND ($2::post_visibility IS NULL OR visibility = $2)
    AND ($3::post_content_kind IS NULL OR content_kind = $3)
    AND ($4::post_locale IS NULL OR locale = $4)
    AND (
        array_length($5::text[], 1) IS NULL
        OR id IN (
            SELECT pt.post_id
            FROM post_tags pt
            JOIN tags t ON t.id = pt.tag_id
            WHERE t.slug = ANY($5::text[])
            GROUP BY pt.post_id
            HAVING (NOT $6::boolean OR COUNT(DISTINCT t.slug) = cardinality($5::text[]))
        )
    )
    AND (
        $7::text IS NULL
        OR title    ILIKE '%' || $7 || '%'
        OR excerpt  ILIKE '%' || $7 || '%'
    )
"#;

pub async fn list_post_summaries(
    pool: &PgPool,
    params: &ListSummariesParams,
    wpm: u32,
) -> Result<PostSummaryListRead, sqlx::Error> {
    let normalized_tags = normalize_tag_slugs(&params.tags);
    let is_all_match = matches!(params.tag_match, TagMatch::All);
    let normalized_query = params
        .query
        .as_ref()
        .map(|q| q.trim().to_string())
        .filter(|q| !q.is_empty());
    let project_prefix = if matches!(params.content_kind, Some(PostContentKind::Project)) {
        "project_order_index ASC NULLS LAST,"
    } else {
        ""
    };
    let main_ordering = summary_ordering(params.sort, params.status);

    let list_sql = format!(
        r#"
        SELECT
            id, slug, title, excerpt, body_markdown,
            cover_image_url, top_media_kind, top_media_image_url,
            top_media_youtube_url, top_media_video_url, series_title,
            locale, content_kind, status, visibility, published_at,
            created_at, updated_at
        FROM posts
        WHERE {SUMMARY_FILTER_CLAUSE}
        ORDER BY {project_prefix} {main_ordering}
        LIMIT $8 OFFSET $9
        "#
    );

    let rows = sqlx::query_as::<_, SummaryRow>(&list_sql)
        .bind(params.status)
        .bind(params.visibility)
        .bind(params.content_kind)
        .bind(params.locale)
        .bind(&normalized_tags)
        .bind(is_all_match)
        .bind(&normalized_query)
        .bind(params.limit)
        .bind(params.offset)
        .fetch_all(pool)
        .await?;

    let count_sql = format!("SELECT COUNT(*)::int8 FROM posts WHERE {SUMMARY_FILTER_CLAUSE}");
    let total_count: i64 = sqlx::query_scalar(&count_sql)
        .bind(params.status)
        .bind(params.visibility)
        .bind(params.content_kind)
        .bind(params.locale)
        .bind(&normalized_tags)
        .bind(is_all_match)
        .bind(&normalized_query)
        .fetch_one(pool)
        .await?;

    let post_ids: Vec<Uuid> = rows.iter().map(|r| r.id).collect();
    let mut tags_by_post = fetch_tags_bulk(pool, &post_ids).await?;
    let comments_by_post = count_comments_bulk(pool, &post_ids).await?;

    let used = params.offset.saturating_add(rows.len() as i64);
    let next_offset = if used < total_count { Some(used) } else { None };

    let mut items = Vec::with_capacity(rows.len());
    for row in rows {
        let id = row.id;
        items.push(PostSummaryRead {
            id,
            slug: row.slug,
            title: row.title,
            excerpt: row.excerpt,
            cover_image_url: row.cover_image_url,
            top_media_kind: row.top_media_kind,
            top_media_image_url: row.top_media_image_url,
            top_media_youtube_url: row.top_media_youtube_url,
            top_media_video_url: row.top_media_video_url,
            series_title: row.series_title,
            locale: row.locale,
            content_kind: row.content_kind,
            status: row.status,
            visibility: row.visibility,
            published_at: row.published_at,
            reading_label: format_reading_label(&row.body_markdown, wpm),
            tags: tags_by_post.remove(&id).unwrap_or_default(),
            comment_count: comments_by_post.get(&id).copied().unwrap_or(0),
            created_at: row.created_at,
            updated_at: row.updated_at,
        });
    }

    let tag_filters = fetch_tag_filters(
        pool,
        params.status,
        params.visibility,
        params.content_kind,
        params.locale,
        normalized_query.as_deref(),
    )
    .await?;

    let visibility_counts = fetch_visibility_counts(
        pool,
        params,
        &normalized_tags,
        is_all_match,
        normalized_query.as_deref(),
    )
    .await?;

    Ok(PostSummaryListRead {
        has_more: next_offset.is_some(),
        items,
        total_count,
        next_offset,
        tag_filters,
        visibility_counts,
    })
}

/// Tag-facet count, intentionally ignoring the caller's `tags`/`tag_match`
/// filter so the tag-bar count doesn't collapse to the currently-selected
/// tag. Empty tags array + `false` are still bound to keep the parameter
/// layout identical to the other summary queries.
async fn fetch_tag_filters(
    pool: &PgPool,
    status: Option<PostStatus>,
    visibility: Option<PostVisibility>,
    content_kind: Option<PostContentKind>,
    locale: Option<PostLocale>,
    query: Option<&str>,
) -> Result<Vec<PostTagFilterRead>, sqlx::Error> {
    let empty_tags: Vec<String> = Vec::new();
    let sql = r#"
        SELECT t.slug AS slug, COUNT(DISTINCT posts.id)::int8 AS count
        FROM posts
        JOIN post_tags pt ON pt.post_id = posts.id
        JOIN tags     t  ON t.id      = pt.tag_id
        WHERE
            ($1::post_status IS NULL OR posts.status = $1)
            AND ($2::post_visibility IS NULL OR posts.visibility = $2)
            AND ($3::post_content_kind IS NULL OR posts.content_kind = $3)
            AND ($4::post_locale IS NULL OR posts.locale = $4)
            AND (
                array_length($5::text[], 1) IS NULL
                OR posts.id IN (
                    SELECT pt2.post_id
                    FROM post_tags pt2
                    JOIN tags t2 ON t2.id = pt2.tag_id
                    WHERE t2.slug = ANY($5::text[])
                    GROUP BY pt2.post_id
                    HAVING (NOT $6::boolean OR COUNT(DISTINCT t2.slug) = cardinality($5::text[]))
                )
            )
            AND (
                $7::text IS NULL
                OR posts.title   ILIKE '%' || $7 || '%'
                OR posts.excerpt ILIKE '%' || $7 || '%'
            )
        GROUP BY t.slug
        ORDER BY t.slug ASC
    "#;

    sqlx::query_as::<_, PostTagFilterRead>(sql)
        .bind(status)
        .bind(visibility)
        .bind(content_kind)
        .bind(locale)
        .bind(&empty_tags)
        .bind(false)
        .bind(query.map(str::to_string))
        .fetch_all(pool)
        .await
}

#[derive(Debug, FromRow)]
struct VisibilityCountRow {
    visibility: PostVisibility,
    count: i64,
}

/// Visibility tally split into public/private/all. Trusted callers (with
/// `include_private_visibility_counts`) see both counts; anonymous callers are
/// pinned to public-only so the private counter stays 0 and the totals
/// reflect what they would actually see.
async fn fetch_visibility_counts(
    pool: &PgPool,
    params: &ListSummariesParams,
    normalized_tags: &[String],
    is_all_match: bool,
    query: Option<&str>,
) -> Result<PostVisibilityCountsRead, sqlx::Error> {
    let scoped_visibility = if params.include_private_visibility_counts {
        None
    } else {
        Some(PostVisibility::Public)
    };

    let sql = format!(
        r#"
        SELECT visibility, COUNT(DISTINCT id)::int8 AS count
        FROM posts
        WHERE {SUMMARY_FILTER_CLAUSE}
        GROUP BY visibility
        "#
    );

    let rows = sqlx::query_as::<_, VisibilityCountRow>(&sql)
        .bind(params.status)
        .bind(scoped_visibility)
        .bind(params.content_kind)
        .bind(params.locale)
        .bind(normalized_tags)
        .bind(is_all_match)
        .bind(query.map(str::to_string))
        .fetch_all(pool)
        .await?;

    let mut counts = PostVisibilityCountsRead::default();
    for r in rows {
        match r.visibility {
            PostVisibility::Public => counts.public = r.count,
            PostVisibility::Private => counts.private = r.count,
        }
    }
    counts.all = counts.public + counts.private;
    Ok(counts)
}

// ── Reading-time estimate ───────────────────────────────────────────────────

use std::sync::OnceLock;

fn reading_regex() -> &'static [(regex::Regex, &'static str)] {
    static CELL: OnceLock<Vec<(regex::Regex, &'static str)>> = OnceLock::new();
    CELL.get_or_init(|| {
        vec![
            (regex::Regex::new(r"(?s)```.*?```").unwrap(), " "),
            (regex::Regex::new(r"`[^`]*`").unwrap(), " "),
            (regex::Regex::new(r"!\[[^\]]*\]\([^)]+\)").unwrap(), " "),
            (regex::Regex::new(r"\[([^\]]+)\]\([^)]+\)").unwrap(), " $1 "),
            (regex::Regex::new(r"<[^>]+>").unwrap(), " "),
            (regex::Regex::new(r"[#>*_~=\-]+").unwrap(), " "),
        ]
    })
    .as_slice()
}

fn count_reading_words(markdown: &str) -> usize {
    let mut text = markdown.replace("\r\n", "\n");
    for (re, replacement) in reading_regex() {
        text = re.replace_all(&text, *replacement).into_owned();
    }
    let mut collapsed = String::with_capacity(text.len());
    let mut last_space = false;
    for c in text.chars() {
        if c.is_whitespace() {
            if !last_space {
                collapsed.push(' ');
                last_space = true;
            }
        } else {
            collapsed.push(c);
            last_space = false;
        }
    }
    let trimmed = collapsed.trim();
    if trimmed.is_empty() {
        return 0;
    }
    trimmed.split(' ').filter(|t| !t.is_empty()).count()
}

pub fn format_reading_label(markdown: &str, words_per_minute: u32) -> String {
    let words = count_reading_words(markdown);
    let wpm = words_per_minute.max(1) as usize;
    let minutes = if words == 0 {
        1
    } else {
        ((words + wpm - 1) / wpm).max(1)
    };
    format!("{minutes} min read")
}
