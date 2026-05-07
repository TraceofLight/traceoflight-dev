//! Read-only post queries: single fetch, listing, and admin summaries.

use std::collections::HashMap;

use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use super::model::{
    ListPostsParams, ListSummariesParams, PostContentKind, PostFilter, PostLocale, PostRead,
    PostSeriesContext, PostSortMode, PostStatus, PostSummaryListRead, PostSummaryRead,
    PostTagFilterRead, PostTopMediaKind, PostVisibility, PostVisibilityCountsRead,
    ProjectProfileRead, ProjectResourceLink, TagMatch, TagRead,
};
use super::utils::{format_reading_label, normalize_tag_slugs};

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
