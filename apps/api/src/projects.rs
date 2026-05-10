//! Project content surface — subset of posts with `content_kind=project`
//! plus the `project_profile` sidecar (period, role, highlights, links).

use chrono::{DateTime, Utc};
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, DatabaseConnection, DbErr, EntityTrait,
    QueryFilter, QueryOrder, TransactionTrait,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::entities::{
    enums::{DbPostContentKind, DbPostLocale, DbPostStatus, DbPostVisibility},
    post, post_slug_redirect, series, series_post,
};
use crate::error::AppError;
use crate::posts::{
    ListPostsParams, PostContentKind, PostFilter, PostLocale, PostRead, PostSeriesContext,
    PostStatus, PostTopMediaKind, PostVisibility, ProjectProfileRead, TagRead, get_post_by_slug,
    list_posts, slugify_series_title,
};
use crate::serializers::{serialize_dt_us, serialize_dt_us_opt};
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
    pool: &DatabaseConnection,
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
    pool: &DatabaseConnection,
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
            fetch_related_series_posts(pool, &series_slug, post.locale, post.id, include_private)
                .await?
        }
        None => Vec::new(),
    };

    Ok(Some(post_to_project(post, related)?))
}

pub async fn resolve_project_redirect(
    pool: &DatabaseConnection,
    old_slug: &str,
    locale: PostLocale,
) -> Result<Option<String>, DbErr> {
    let redirect = post_slug_redirect::Entity::find()
        .filter(post_slug_redirect::Column::Locale.eq(DbPostLocale::from(locale)))
        .filter(post_slug_redirect::Column::OldSlug.eq(old_slug))
        .one(pool)
        .await?;

    let Some(redirect) = redirect else {
        return Ok(None);
    };

    let target = post::Entity::find_by_id(redirect.target_post_id)
        .filter(post::Column::ContentKind.eq(DbPostContentKind::Project))
        .filter(post::Column::Status.eq(DbPostStatus::Published))
        .filter(post::Column::Visibility.eq(DbPostVisibility::Public))
        .one(pool)
        .await?;
    let Some(target) = target else {
        return Ok(None);
    };

    let next_hit_count = redirect.hit_count + 1;
    let mut active: post_slug_redirect::ActiveModel = redirect.into();
    active.hit_count = Set(next_hit_count);
    active.last_hit_at = Set(Some(Utc::now()));
    active.update(pool).await?;

    Ok(Some(target.slug))
}

/// Apply the supplied slug order as `project_order_index` (1-based) to every
/// matching project post and return the freshly ordered project list.
/// Returns `AppError::BadRequest` when any slug doesn't resolve to a project,
/// keeping the index unchanged in that case (transactional).
pub async fn replace_project_order(
    pool: &DatabaseConnection,
    raw_slugs: Vec<String>,
) -> Result<Vec<ProjectRead>, AppError> {
    let normalized = normalize_slug_list(&raw_slugs);
    if normalized.is_empty() {
        return Ok(Vec::new());
    }

    let tx = pool.begin().await?;

    let existing = post::Entity::find()
        .filter(post::Column::Slug.is_in(normalized.iter().cloned()))
        .filter(post::Column::ContentKind.eq(DbPostContentKind::Project))
        .all(&tx)
        .await?;
    let known: std::collections::HashSet<String> = existing.into_iter().map(|r| r.slug).collect();
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
        let Some(anchor) = post::Entity::find()
            .filter(post::Column::Slug.eq(slug))
            .filter(post::Column::ContentKind.eq(DbPostContentKind::Project))
            .one(&tx)
            .await?
        else {
            continue;
        };
        let models = post::Entity::find()
            .filter(post::Column::ContentKind.eq(DbPostContentKind::Project))
            .filter(post::Column::TranslationGroupId.eq(anchor.translation_group_id))
            .all(&tx)
            .await?;
        for model in models {
            let mut active: post::ActiveModel = model.into();
            active.project_order_index = Set(Some((index as i32) + 1));
            active.updated_at = Set(Utc::now());
            active.update(&tx).await?;
        }
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
    pool: &DatabaseConnection,
    series_slug: &str,
    locale: PostLocale,
    exclude_post_id: Uuid,
    include_private: bool,
) -> Result<Vec<SeriesPostRead>, DbErr> {
    let series = series::Entity::find()
        .filter(series::Column::Slug.eq(series_slug))
        .filter(series::Column::Locale.eq(DbPostLocale::from(locale)))
        .one(pool)
        .await?;
    let Some(series) = series else {
        return Ok(Vec::new());
    };

    let links = series_post::Entity::find()
        .filter(series_post::Column::SeriesId.eq(series.id))
        .order_by_asc(series_post::Column::OrderIndex)
        .all(pool)
        .await?;
    let post_ids: Vec<Uuid> = links
        .iter()
        .map(|link| link.post_id)
        .filter(|post_id| *post_id != exclude_post_id)
        .collect();
    if post_ids.is_empty() {
        return Ok(Vec::new());
    }

    let mut post_query = post::Entity::find().filter(post::Column::Id.is_in(post_ids));
    if !include_private {
        post_query = post_query
            .filter(post::Column::Status.eq(DbPostStatus::Published))
            .filter(post::Column::Visibility.eq(DbPostVisibility::Public));
    }
    let posts_by_id: std::collections::HashMap<Uuid, post::Model> = post_query
        .all(pool)
        .await?
        .into_iter()
        .map(|post| (post.id, post))
        .collect();

    Ok(links
        .into_iter()
        .filter(|link| link.post_id != exclude_post_id)
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
