use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::error::AppError;
use crate::posts::{
    get_post_by_slug, list_posts, serialize_dt_us, serialize_dt_us_opt, ListPostsParams,
    PostContentKind, PostFilter, PostLocale, PostRead, PostSeriesContext, PostStatus,
    PostTopMediaKind, PostVisibility, ProjectProfileRead, TagRead,
};
use crate::series::SeriesPostRead;

/// Same wire shape as `PostRead` plus a required `project_profile` and the
/// `related_series_posts` aggregation. Field order is kept identical to
/// `PostRead` so list responses stay byte-stable when projects share the
/// same archive surface.
#[derive(Debug, Serialize, ToSchema)]
pub struct ProjectRead {
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
    pub project_profile: ProjectProfileRead,
    pub related_series_posts: Vec<SeriesPostRead>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct ProjectsOrderReplace {
    /// Ordered project slug list for the projects archive layout. Empty list
    /// is a no-op.
    #[serde(default)]
    pub project_slugs: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct ListProjectsParams {
    pub limit: i64,
    pub offset: i64,
    pub include_private: bool,
    pub locale: Option<PostLocale>,
}

pub async fn list_projects(
    pool: &PgPool,
    params: ListProjectsParams,
) -> Result<Vec<ProjectRead>, AppError> {
    let (status, visibility) = visibility_for(params.include_private);
    let posts = list_posts(
        pool,
        &ListPostsParams {
            limit: params.limit,
            offset: params.offset,
            status,
            visibility,
            content_kind: Some(PostContentKind::Project),
            locale: params.locale,
            tags: Vec::new(),
            tag_match: crate::posts::TagMatch::Any,
        },
    )
    .await?;
    let mut out = Vec::with_capacity(posts.len());
    for post in posts {
        out.push(post_to_project(post, Vec::new())?);
    }
    Ok(out)
}

pub async fn get_project_by_slug(
    pool: &PgPool,
    slug: &str,
    include_private: bool,
    locale: Option<PostLocale>,
) -> Result<Option<ProjectRead>, AppError> {
    let (status, visibility) = visibility_for(include_private);
    let post = get_post_by_slug(
        pool,
        slug,
        PostFilter {
            status,
            visibility,
            content_kind: Some(PostContentKind::Project),
            locale,
        },
    )
    .await?;
    let Some(post) = post else { return Ok(None) };

    let related = match post.series_title.as_deref() {
        Some(series_title) => {
            let series_slug = slugify_series_title(series_title);
            fetch_related_series_posts(
                pool,
                &series_slug,
                post.locale,
                post.id,
                include_private,
            )
            .await?
        }
        None => Vec::new(),
    };

    Ok(Some(post_to_project(post, related)?))
}

pub async fn resolve_project_redirect(
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
          AND p.content_kind = 'project'::post_content_kind
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

/// Apply the supplied slug order as `project_order_index` (1-based) to every
/// matching project post and return the freshly ordered project list.
/// Returns `AppError::BadRequest` when any slug doesn't resolve to a project,
/// keeping the index unchanged in that case (transactional).
pub async fn replace_project_order(
    pool: &PgPool,
    raw_slugs: Vec<String>,
) -> Result<Vec<ProjectRead>, AppError> {
    let normalized = normalize_slug_list(&raw_slugs);
    if normalized.is_empty() {
        return Ok(Vec::new());
    }

    let mut tx = pool.begin().await?;

    #[derive(FromRow)]
    struct ExistingRow {
        slug: String,
    }
    let existing: Vec<ExistingRow> = sqlx::query_as(
        r#"
        SELECT slug FROM posts
        WHERE slug = ANY($1::text[]) AND content_kind = 'project'::post_content_kind
        "#,
    )
    .bind(&normalized)
    .fetch_all(&mut *tx)
    .await?;
    let known: std::collections::HashSet<String> =
        existing.into_iter().map(|r| r.slug).collect();
    let missing: Vec<String> = normalized
        .iter()
        .filter(|s| !known.contains(*s))
        .cloned()
        .collect();
    if !missing.is_empty() {
        return Err(AppError::BadRequest(format!(
            "unknown project slugs: {}",
            missing.join(", ")
        )));
    }

    for (index, slug) in normalized.iter().enumerate() {
        sqlx::query(
            r#"
            UPDATE posts
               SET project_order_index = $1,
                   updated_at = NOW()
             WHERE content_kind = 'project'::post_content_kind
               AND translation_group_id = (
                   SELECT translation_group_id FROM posts
                    WHERE slug = $2
                      AND content_kind = 'project'::post_content_kind
                    LIMIT 1
               )
            "#,
        )
        .bind((index as i64) + 1)
        .bind(slug)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    list_projects(
        pool,
        ListProjectsParams {
            limit: normalized.len().max(1) as i64,
            offset: 0,
            include_private: false,
            locale: None,
        },
    )
    .await
}

fn visibility_for(include_private: bool) -> (Option<PostStatus>, Option<PostVisibility>) {
    if include_private {
        (None, None)
    } else {
        (Some(PostStatus::Published), Some(PostVisibility::Public))
    }
}

fn post_to_project(
    post: PostRead,
    related_series_posts: Vec<SeriesPostRead>,
) -> Result<ProjectRead, AppError> {
    let project_profile = post.project_profile.ok_or_else(|| {
        AppError::Internal(anyhow::anyhow!(
            "project post {} missing project_profile",
            post.slug
        ))
    })?;
    Ok(ProjectRead {
        id: post.id,
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        cover_image_url: post.cover_image_url,
        top_media_kind: post.top_media_kind,
        top_media_image_url: post.top_media_image_url,
        top_media_youtube_url: post.top_media_youtube_url,
        top_media_video_url: post.top_media_video_url,
        series_title: post.series_title,
        content_kind: post.content_kind,
        status: post.status,
        visibility: post.visibility,
        published_at: post.published_at,
        tags: post.tags,
        comment_count: post.comment_count,
        created_at: post.created_at,
        updated_at: post.updated_at,
        body_markdown: post.body_markdown,
        locale: post.locale,
        translation_group_id: post.translation_group_id,
        source_post_id: post.source_post_id,
        series_context: post.series_context,
        project_profile,
        related_series_posts,
    })
}

/// Convert a free-form series title into the slug used in the `series` table:
/// alphanumerics survive, every other character collapses to a single dash,
/// surrounding dashes are stripped, and an empty result falls back to
/// `"series"`. Note: case is preserved (no lowercase).
fn slugify_series_title(title: &str) -> String {
    let mut out = String::with_capacity(title.len());
    let mut last_dash = false;
    for ch in title.trim().chars() {
        if ch.is_alphanumeric() {
            out.push(ch);
            last_dash = false;
        } else if !last_dash {
            out.push('-');
            last_dash = true;
        }
    }
    let trimmed = out.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "series".into()
    } else {
        trimmed
    }
}

fn normalize_slug_list(raw: &[String]) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for r in raw {
        let s = r.trim().to_lowercase();
        if s.is_empty() || !seen.insert(s.clone()) {
            continue;
        }
        out.push(s);
    }
    out
}

async fn fetch_related_series_posts(
    pool: &PgPool,
    series_slug: &str,
    locale: PostLocale,
    exclude_post_id: Uuid,
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
        JOIN series s ON s.id = sp.series_id
        JOIN posts  p ON p.id = sp.post_id
        WHERE s.slug = $1
          AND s.locale = $2
          AND p.id <> $3
          AND ($4::boolean OR (
              p.status = 'published'::post_status
              AND p.visibility = 'public'::post_visibility
          ))
        ORDER BY sp.order_index ASC
        "#,
    )
    .bind(series_slug)
    .bind(locale)
    .bind(exclude_post_id)
    .bind(include_private)
    .fetch_all(pool)
    .await
}
