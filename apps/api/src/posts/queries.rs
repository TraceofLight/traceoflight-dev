//! Read-only post queries: single fetch, listing, and admin summaries.

use std::collections::HashMap;

use chrono::{DateTime, Utc};
use sea_orm::{
    ColumnTrait, Condition, DatabaseConnection, DbErr, EntityTrait, FromQueryResult, LoaderTrait,
    PaginatorTrait, QueryFilter, QueryOrder, QuerySelect, Select,
    sea_query::{Expr, NullOrdering, Order, extension::postgres::PgExpr},
};
use uuid::Uuid;

use crate::entities::{
    enums::{
        DbPostContentKind, DbPostLocale, DbPostStatus, DbPostTranslationSourceKind,
        DbPostTranslationStatus, DbPostVisibility,
    },
    post, post_comment, post_tag, project_profile, series, series_post, tag,
};

use super::model::{
    ListPostsParams, ListSummariesParams, PostContentKind, PostFilter, PostLocale, PostRead,
    PostSeriesContext, PostSortMode, PostStatus, PostSummaryListRead, PostSummaryRead,
    PostTagFilterRead, PostTopMediaKind, PostTranslationStatus, PostVisibility,
    PostVisibilityCountsRead, ProjectProfileRead, ProjectResourceLink, TagMatch, TagRead,
};
use super::utils::{format_reading_label, normalize_tag_slugs};

pub async fn get_post_by_slug(
    pool: &DatabaseConnection,
    slug: &str,
    filter: PostFilter,
) -> Result<Option<PostRead>, DbErr> {
    let mut query = post::Entity::find().filter(post::Column::Slug.eq(slug));
    if let Some(status) = filter.status {
        query = query.filter(post::Column::Status.eq(DbPostStatus::from(status)));
    }
    if let Some(visibility) = filter.visibility {
        query = query.filter(post::Column::Visibility.eq(DbPostVisibility::from(visibility)));
    }
    if let Some(content_kind) = filter.content_kind {
        query = query.filter(post::Column::ContentKind.eq(DbPostContentKind::from(content_kind)));
    }
    if let Some(locale) = filter.locale {
        query = query.filter(post::Column::Locale.eq(DbPostLocale::from(locale)));
    }

    let Some(post_model) = query.one(pool).await? else {
        return Ok(None);
    };
    let row = post_row_from_model(post_model.clone());
    let mut tags_by_post = fetch_tags_bulk(pool, std::slice::from_ref(&post_model)).await?;
    let mut comments_by_post = count_comments_bulk(pool, std::slice::from_ref(&post_model)).await?;
    let mut profiles_by_post = if matches!(row.content_kind, PostContentKind::Project) {
        fetch_project_profiles_bulk(pool, std::slice::from_ref(&post_model)).await?
    } else {
        HashMap::new()
    };
    // Caller asking exactly for published+public is the anonymous read path;
    // any other filter combination is a trusted caller and the series-listing
    // visibility filter is dropped accordingly.
    let public_only = matches!(filter.status, Some(PostStatus::Published))
        && matches!(filter.visibility, Some(PostVisibility::Public));
    let mut series_by_post =
        attach_series_context_bulk(pool, std::slice::from_ref(&post_model), public_only).await?;

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
        tags: tags_by_post.remove(&row.id).unwrap_or_default(),
        comment_count: comments_by_post.remove(&row.id).unwrap_or(0),
        created_at: row.created_at,
        updated_at: row.updated_at,
        body_markdown: row.body_markdown,
        locale: row.locale,
        translation_group_id: row.translation_group_id,
        source_post_id: row.source_post_id,
        translation_status: PostTranslationStatus::from(row.translation_status),
        series_context: series_by_post.remove(&row.id),
        project_profile: profiles_by_post.remove(&row.id),
    }))
}

#[derive(Debug, FromQueryResult)]
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
    translation_status: DbPostTranslationStatus,
    translation_source_kind: DbPostTranslationSourceKind,
    translated_from_hash: Option<String>,
    content_kind: PostContentKind,
    status: PostStatus,
    visibility: PostVisibility,
    published_at: Option<DateTime<Utc>>,
    project_order_index: Option<i32>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

fn post_model_from_row(row: &PostRow) -> post::Model {
    post::Model {
        id: row.id,
        slug: row.slug.clone(),
        title: row.title.clone(),
        excerpt: row.excerpt.clone(),
        body_markdown: row.body_markdown.clone(),
        cover_image_url: row.cover_image_url.clone(),
        status: row.status.into(),
        published_at: row.published_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        visibility: row.visibility.into(),
        series_title: row.series_title.clone(),
        content_kind: row.content_kind.into(),
        top_media_kind: row.top_media_kind.into(),
        top_media_image_url: row.top_media_image_url.clone(),
        top_media_youtube_url: row.top_media_youtube_url.clone(),
        top_media_video_url: row.top_media_video_url.clone(),
        project_order_index: row.project_order_index,
        locale: row.locale.into(),
        translation_group_id: row.translation_group_id,
        source_post_id: row.source_post_id,
        translation_status: row.translation_status,
        translation_source_kind: row.translation_source_kind,
        translated_from_hash: row.translated_from_hash.clone(),
    }
}

fn post_row_from_model(model: post::Model) -> PostRow {
    PostRow {
        id: model.id,
        slug: model.slug,
        title: model.title,
        excerpt: model.excerpt,
        body_markdown: model.body_markdown,
        cover_image_url: model.cover_image_url,
        top_media_kind: PostTopMediaKind::from(model.top_media_kind),
        top_media_image_url: model.top_media_image_url,
        top_media_youtube_url: model.top_media_youtube_url,
        top_media_video_url: model.top_media_video_url,
        series_title: model.series_title,
        locale: PostLocale::from(model.locale),
        translation_group_id: model.translation_group_id,
        source_post_id: model.source_post_id,
        translation_status: model.translation_status,
        translation_source_kind: model.translation_source_kind,
        translated_from_hash: model.translated_from_hash,
        content_kind: PostContentKind::from(model.content_kind),
        status: PostStatus::from(model.status),
        visibility: PostVisibility::from(model.visibility),
        published_at: model.published_at,
        project_order_index: model.project_order_index,
        created_at: model.created_at,
        updated_at: model.updated_at,
    }
}

async fn fetch_tags_bulk(
    pool: &DatabaseConnection,
    posts: &[post::Model],
) -> Result<HashMap<Uuid, Vec<TagRead>>, DbErr> {
    if posts.is_empty() {
        return Ok(HashMap::new());
    }

    let loaded = posts
        .load_many(tag::Entity::find().order_by_asc(tag::Column::Slug), pool)
        .await?;

    let mut map: HashMap<Uuid, Vec<TagRead>> = HashMap::new();
    for (post, tags) in posts.iter().zip(loaded) {
        map.insert(
            post.id,
            tags.into_iter()
                .map(|tag| TagRead {
                    slug: tag.slug,
                    label: tag.label,
                })
                .collect(),
        );
    }
    Ok(map)
}

#[derive(Debug, FromQueryResult)]
struct CommentCountRow {
    post_id: Uuid,
    cnt: i64,
}

async fn count_comments_bulk(
    pool: &DatabaseConnection,
    posts: &[post::Model],
) -> Result<HashMap<Uuid, i64>, DbErr> {
    if posts.is_empty() {
        return Ok(HashMap::new());
    }

    let post_ids = posts.iter().map(|post| post.id).collect::<Vec<_>>();
    let rows: Vec<CommentCountRow> = post_comment::Entity::find()
        .select_only()
        .column(post_comment::Column::PostId)
        .column_as(post_comment::Column::Id.count(), "cnt")
        .filter(post_comment::Column::PostId.is_in(post_ids))
        .group_by(post_comment::Column::PostId)
        .into_model()
        .all(pool)
        .await?;

    Ok(rows.into_iter().map(|r| (r.post_id, r.cnt)).collect())
}

async fn fetch_project_profiles_bulk(
    pool: &DatabaseConnection,
    posts: &[post::Model],
) -> Result<HashMap<Uuid, ProjectProfileRead>, DbErr> {
    if posts.is_empty() {
        return Ok(HashMap::new());
    }

    let loaded = posts.load_one(project_profile::Entity, pool).await?;
    let mut map = HashMap::new();
    for (post, profile) in posts.iter().zip(loaded) {
        if let Some(profile) = profile {
            map.insert(post.id, project_profile_read(profile));
        }
    }
    Ok(map)
}

fn project_profile_read(profile: project_profile::Model) -> ProjectProfileRead {
    let highlights: Vec<String> =
        serde_json::from_value(profile.highlights_json).unwrap_or_default();
    let resource_links: Vec<ProjectResourceLink> =
        serde_json::from_value(profile.resource_links_json).unwrap_or_default();

    ProjectProfileRead {
        period_label: profile.period_label,
        role_summary: profile.role_summary,
        project_intro: profile.project_intro,
        card_image_url: profile.card_image_url.unwrap_or_default(),
        highlights_json: highlights,
        resource_links_json: resource_links,
    }
}

/// Build series prev/next metadata through SeaORM relation loaders. This keeps
/// the anti-N+1 behavior without spelling the post/series joins by hand.
async fn attach_series_context_bulk(
    pool: &DatabaseConnection,
    posts: &[post::Model],
    public_only: bool,
) -> Result<HashMap<Uuid, PostSeriesContext>, DbErr> {
    if posts.is_empty() {
        return Ok(HashMap::new());
    }

    let mappings = posts.load_one(series_post::Entity, pool).await?;
    let mapping_models = mappings
        .iter()
        .filter_map(|mapping| mapping.clone())
        .collect::<Vec<_>>();

    if mapping_models.is_empty() {
        return Ok(HashMap::new());
    }

    let loaded_series = mapping_models.load_one(series::Entity, pool).await?;
    let mut series_by_id = HashMap::new();
    let mut unique_series = Vec::new();
    for series in loaded_series.into_iter().flatten() {
        if series_by_id.insert(series.id, series.clone()).is_none() {
            unique_series.push(series);
        }
    }

    let ordered_mappings = unique_series
        .load_many(
            series_post::Entity::find().order_by_asc(series_post::Column::OrderIndex),
            pool,
        )
        .await?;
    let listing_mappings = ordered_mappings
        .iter()
        .flatten()
        .cloned()
        .collect::<Vec<_>>();
    let listing_posts = listing_mappings.load_one(post::Entity, pool).await?;

    let mut by_series: HashMap<Uuid, Vec<(series_post::Model, post::Model)>> = HashMap::new();
    for (mapping, post) in listing_mappings.into_iter().zip(listing_posts) {
        if let Some(post) = post {
            by_series
                .entry(mapping.series_id)
                .or_default()
                .push((mapping, post));
        }
    }

    let mut result = HashMap::new();
    for (post, mapping) in posts.iter().zip(mappings) {
        let Some(mapping) = mapping else {
            continue;
        };
        let Some(series) = series_by_id.get(&mapping.series_id) else {
            continue;
        };
        let Some(listing) = by_series.get(&mapping.series_id) else {
            continue;
        };

        let filtered: Vec<&(series_post::Model, post::Model)> = if public_only {
            listing
                .iter()
                .filter(|(_, post)| {
                    matches!(post.status, DbPostStatus::Published)
                        && matches!(post.visibility, DbPostVisibility::Public)
                })
                .collect()
        } else {
            listing.iter().collect()
        };

        let Some(idx) = filtered
            .iter()
            .position(|(_, listing_post)| listing_post.slug == post.slug)
        else {
            continue;
        };
        let prev = idx.checked_sub(1).and_then(|i| filtered.get(i).copied());
        let next = filtered.get(idx + 1).copied();

        result.insert(
            post.id,
            PostSeriesContext {
                series_slug: series.slug.clone(),
                series_title: series.title.clone(),
                order_index: mapping.order_index,
                total_posts: filtered.len() as i64,
                prev_post_slug: prev.map(|(_, post)| post.slug.clone()),
                prev_post_title: prev.map(|(_, post)| post.title.clone()),
                next_post_slug: next.map(|(_, post)| post.slug.clone()),
                next_post_title: next.map(|(_, post)| post.title.clone()),
            },
        );
    }
    Ok(result)
}

async fn post_ids_matching_tags(
    pool: &DatabaseConnection,
    normalized_tags: &[String],
    is_all_match: bool,
) -> Result<Option<Vec<Uuid>>, DbErr> {
    if normalized_tags.is_empty() {
        return Ok(None);
    }

    let tags = tag::Entity::find()
        .filter(tag::Column::Slug.is_in(normalized_tags.iter().cloned()))
        .all(pool)
        .await?;
    if tags.is_empty() || (is_all_match && tags.len() != normalized_tags.len()) {
        return Ok(Some(Vec::new()));
    }

    let tag_ids: Vec<Uuid> = tags.iter().map(|tag| tag.id).collect();
    let links = post_tag::Entity::find()
        .filter(post_tag::Column::TagId.is_in(tag_ids))
        .all(pool)
        .await?;

    if is_all_match {
        let mut counts: HashMap<Uuid, usize> = HashMap::new();
        for link in links {
            *counts.entry(link.post_id).or_insert(0) += 1;
        }
        Ok(Some(
            counts
                .into_iter()
                .filter_map(|(post_id, count)| (count == normalized_tags.len()).then_some(post_id))
                .collect(),
        ))
    } else {
        let mut post_ids = links
            .into_iter()
            .map(|link| link.post_id)
            .collect::<Vec<_>>();
        post_ids.sort_unstable();
        post_ids.dedup();
        Ok(Some(post_ids))
    }
}

pub async fn list_posts(
    pool: &DatabaseConnection,
    params: &ListPostsParams,
) -> Result<Vec<PostRead>, DbErr> {
    let normalized_tags = normalize_tag_slugs(&params.tags);
    let is_all_match = matches!(params.tag_match, TagMatch::All);
    let matching_post_ids = post_ids_matching_tags(pool, &normalized_tags, is_all_match).await?;
    if matches!(matching_post_ids.as_deref(), Some([])) {
        return Ok(Vec::new());
    }

    let mut query = post::Entity::find();
    if let Some(status) = params.status {
        query = query.filter(post::Column::Status.eq(DbPostStatus::from(status)));
    }
    if let Some(visibility) = params.visibility {
        query = query.filter(post::Column::Visibility.eq(DbPostVisibility::from(visibility)));
    }
    if let Some(content_kind) = params.content_kind {
        query = query.filter(post::Column::ContentKind.eq(DbPostContentKind::from(content_kind)));
    }
    if let Some(locale) = params.locale {
        query = query.filter(post::Column::Locale.eq(DbPostLocale::from(locale)));
    }
    if let Some(post_ids) = matching_post_ids {
        query = query.filter(post::Column::Id.is_in(post_ids));
    }

    if matches!(params.content_kind, Some(PostContentKind::Project)) {
        query = query.order_by_with_nulls(
            post::Column::ProjectOrderIndex,
            Order::Asc,
            NullOrdering::Last,
        );
    }
    query = match params.status {
        Some(PostStatus::Published) => query
            .order_by_with_nulls(post::Column::PublishedAt, Order::Desc, NullOrdering::Last)
            .order_by_desc(post::Column::CreatedAt)
            .order_by_desc(post::Column::Slug),
        _ => query
            .order_by_desc(post::Column::CreatedAt)
            .order_by_desc(post::Column::Slug),
    };

    let rows: Vec<PostRow> = query
        .limit(params.limit as u64)
        .offset(params.offset as u64)
        .all(pool)
        .await?
        .into_iter()
        .map(post_row_from_model)
        .collect();

    if rows.is_empty() {
        return Ok(Vec::new());
    }

    let post_models = rows.iter().map(post_model_from_row).collect::<Vec<_>>();
    let mut tags_by_post = fetch_tags_bulk(pool, &post_models).await?;
    let comments_by_post = count_comments_bulk(pool, &post_models).await?;
    let mut profiles_by_post = fetch_project_profiles_bulk(pool, &post_models).await?;

    let public_only = matches!(params.status, Some(PostStatus::Published))
        && matches!(params.visibility, Some(PostVisibility::Public));
    let mut series_by_post = attach_series_context_bulk(pool, &post_models, public_only).await?;

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
            translation_status: PostTranslationStatus::from(row.translation_status),
            series_context: series_by_post.remove(&id),
            project_profile: profiles_by_post.remove(&id),
        });
    }
    Ok(out)
}

#[derive(Debug, Clone, Copy)]
struct PostQueryFilters<'a> {
    status: Option<PostStatus>,
    visibility: Option<PostVisibility>,
    content_kind: Option<PostContentKind>,
    locale: Option<PostLocale>,
    matching_post_ids: Option<&'a [Uuid]>,
    search: Option<&'a str>,
}

fn filtered_post_query(filters: PostQueryFilters<'_>) -> Select<post::Entity> {
    let mut query = post::Entity::find();
    if let Some(status) = filters.status {
        query = query.filter(post::Column::Status.eq(DbPostStatus::from(status)));
    }
    if let Some(visibility) = filters.visibility {
        query = query.filter(post::Column::Visibility.eq(DbPostVisibility::from(visibility)));
    }
    if let Some(content_kind) = filters.content_kind {
        query = query.filter(post::Column::ContentKind.eq(DbPostContentKind::from(content_kind)));
    }
    if let Some(locale) = filters.locale {
        query = query.filter(post::Column::Locale.eq(DbPostLocale::from(locale)));
    }
    if let Some(post_ids) = filters.matching_post_ids {
        query = query.filter(post::Column::Id.is_in(post_ids.iter().copied()));
    }
    if let Some(search) = filters.search {
        let pattern = format!("%{search}%");
        query = query.filter(
            Condition::any()
                .add(Expr::col(post::Column::Title).ilike(pattern.clone()))
                .add(Expr::col(post::Column::Excerpt).ilike(pattern)),
        );
    }
    query
}

fn apply_summary_ordering(
    mut query: Select<post::Entity>,
    content_kind: Option<PostContentKind>,
    sort: PostSortMode,
    status: Option<PostStatus>,
) -> Select<post::Entity> {
    if matches!(content_kind, Some(PostContentKind::Project)) {
        query = query.order_by_with_nulls(
            post::Column::ProjectOrderIndex,
            Order::Asc,
            NullOrdering::Last,
        );
    }

    match sort {
        PostSortMode::Oldest => query
            .order_by_with_nulls(post::Column::PublishedAt, Order::Asc, NullOrdering::Last)
            .order_by_asc(post::Column::CreatedAt)
            .order_by_asc(post::Column::Slug),
        PostSortMode::Title => query
            .order_by_asc(post::Column::Title)
            .order_by_with_nulls(post::Column::PublishedAt, Order::Desc, NullOrdering::Last)
            .order_by_desc(post::Column::CreatedAt)
            .order_by_asc(post::Column::Slug),
        PostSortMode::Latest => match status {
            Some(PostStatus::Published) => query
                .order_by_with_nulls(post::Column::PublishedAt, Order::Desc, NullOrdering::Last)
                .order_by_desc(post::Column::CreatedAt)
                .order_by_desc(post::Column::Slug),
            _ => query
                .order_by_desc(post::Column::CreatedAt)
                .order_by_desc(post::Column::Slug),
        },
    }
}

pub async fn list_post_summaries(
    pool: &DatabaseConnection,
    params: &ListSummariesParams,
    wpm: u32,
) -> Result<PostSummaryListRead, DbErr> {
    let normalized_tags = normalize_tag_slugs(&params.tags);
    let is_all_match = matches!(params.tag_match, TagMatch::All);
    let normalized_query = params
        .query
        .as_ref()
        .map(|q| q.trim().to_string())
        .filter(|q| !q.is_empty());
    let matching_post_ids = post_ids_matching_tags(pool, &normalized_tags, is_all_match).await?;
    let tag_filter_empty = matches!(matching_post_ids.as_deref(), Some([]));

    let filters = PostQueryFilters {
        status: params.status,
        visibility: params.visibility,
        content_kind: params.content_kind,
        locale: params.locale,
        matching_post_ids: matching_post_ids.as_deref(),
        search: normalized_query.as_deref(),
    };

    let (rows, total_count) = if tag_filter_empty {
        (Vec::new(), 0)
    } else {
        let total_count = filtered_post_query(filters).count(pool).await? as i64;
        let rows = apply_summary_ordering(
            filtered_post_query(filters),
            params.content_kind,
            params.sort,
            params.status,
        )
        .limit(params.limit as u64)
        .offset(params.offset as u64)
        .all(pool)
        .await?
        .into_iter()
        .map(post_row_from_model)
        .collect::<Vec<_>>();
        (rows, total_count)
    };

    let post_models = rows.iter().map(post_model_from_row).collect::<Vec<_>>();
    let mut tags_by_post = fetch_tags_bulk(pool, &post_models).await?;
    let comments_by_post = count_comments_bulk(pool, &post_models).await?;

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
    pool: &DatabaseConnection,
    status: Option<PostStatus>,
    visibility: Option<PostVisibility>,
    content_kind: Option<PostContentKind>,
    locale: Option<PostLocale>,
    query: Option<&str>,
) -> Result<Vec<PostTagFilterRead>, DbErr> {
    let posts = filtered_post_query(PostQueryFilters {
        status,
        visibility,
        content_kind,
        locale,
        matching_post_ids: None,
        search: query,
    })
    .all(pool)
    .await?;
    let tags_by_post = fetch_tags_bulk(pool, &posts).await?;

    let mut counts: HashMap<String, i64> = HashMap::new();
    for tags in tags_by_post.values() {
        for tag in tags {
            *counts.entry(tag.slug.clone()).or_insert(0) += 1;
        }
    }

    let mut out = counts
        .into_iter()
        .map(|(slug, count)| PostTagFilterRead { slug, count })
        .collect::<Vec<_>>();
    out.sort_by(|a, b| a.slug.cmp(&b.slug));
    Ok(out)
}

/// Visibility tally split into public/private/all. Trusted callers (with
/// `include_private_visibility_counts`) see both counts; anonymous callers are
/// pinned to public-only so the private counter stays 0 and the totals
/// reflect what they would actually see.
async fn fetch_visibility_counts(
    pool: &DatabaseConnection,
    params: &ListSummariesParams,
    normalized_tags: &[String],
    is_all_match: bool,
    query: Option<&str>,
) -> Result<PostVisibilityCountsRead, DbErr> {
    let scoped_visibility = if params.include_private_visibility_counts {
        None
    } else {
        Some(PostVisibility::Public)
    };

    let matching_post_ids = post_ids_matching_tags(pool, normalized_tags, is_all_match).await?;
    if matches!(matching_post_ids.as_deref(), Some([])) {
        return Ok(PostVisibilityCountsRead::default());
    }

    let mut counts = PostVisibilityCountsRead::default();
    counts.public = filtered_post_query(PostQueryFilters {
        status: params.status,
        visibility: Some(PostVisibility::Public),
        content_kind: params.content_kind,
        locale: params.locale,
        matching_post_ids: matching_post_ids.as_deref(),
        search: query,
    })
    .count(pool)
    .await? as i64;

    if scoped_visibility.is_none() {
        counts.private = filtered_post_query(PostQueryFilters {
            status: params.status,
            visibility: Some(PostVisibility::Private),
            content_kind: params.content_kind,
            locale: params.locale,
            matching_post_ids: matching_post_ids.as_deref(),
            search: query,
        })
        .count(pool)
        .await? as i64;
    }
    counts.all = counts.public + counts.private;
    Ok(counts)
}
