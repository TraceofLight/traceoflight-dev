//! Write paths for posts: create, update, delete, and slug-redirect resolve.

use chrono::Utc;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, DatabaseConnection, DatabaseTransaction,
    DbErr, EntityTrait, QueryFilter, TransactionTrait,
};
use uuid::Uuid;

use crate::db;
use crate::entities::{
    enums::{
        DbPostContentKind, DbPostLocale, DbPostStatus, DbPostTopMediaKind,
        DbPostTranslationSourceKind, DbPostTranslationStatus, DbPostVisibility,
    },
    post, post_slug_redirect, post_tag, project_profile, tag,
};
use crate::error::AppError;

use super::model::{
    PostContentKind, PostCreate, PostFilter, PostLocale, PostRead, PostStatus, PostVisibility,
    ProjectProfilePayload,
};
use super::queries::get_post_by_slug;
use super::utils::normalize_tag_slugs;

fn normalize_optional_text(value: &Option<String>) -> Option<String> {
    value
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Map database errors into application errors. Postgres unique-constraint
/// violation surfaces as a 409 Conflict; everything else falls through.
fn map_create_error(err: DbErr) -> AppError {
    if db::unique_violation(&err) {
        return AppError::Conflict("post slug already exists".into());
    }
    AppError::Database(err)
}

const TRANSLATED_POST_MUTATION_FORBIDDEN: &str = "translated posts cannot be modified directly";

fn ensure_source_post_mutation(
    locale: PostLocale,
    source_post_id: Option<Uuid>,
) -> Result<(), AppError> {
    if !matches!(locale, PostLocale::Ko) || source_post_id.is_some() {
        return Err(AppError::Forbidden(
            TRANSLATED_POST_MUTATION_FORBIDDEN.into(),
        ));
    }
    Ok(())
}

/// Create a post and its M2M / project-profile relations in a single
/// transaction. Returns the freshly-rehydrated [`PostRead`] so the response
/// shape matches `GET /posts/{slug}`.
pub async fn create_post(
    pool: &DatabaseConnection,
    payload: PostCreate,
) -> Result<PostRead, AppError> {
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

    let tx = pool.begin().await?;

    post::ActiveModel {
        id: Set(post_id),
        slug: Set(slug.clone()),
        title: Set(payload.title.clone()),
        excerpt: Set(payload.excerpt.clone()),
        body_markdown: Set(payload.body_markdown.clone()),
        cover_image_url: Set(payload.cover_image_url.clone()),
        top_media_kind: Set(DbPostTopMediaKind::from(payload.top_media_kind)),
        top_media_image_url: Set(payload.top_media_image_url.clone()),
        top_media_youtube_url: Set(payload.top_media_youtube_url.clone()),
        top_media_video_url: Set(payload.top_media_video_url.clone()),
        series_title: Set(series_title.clone()),
        locale: Set(DbPostLocale::from(locale)),
        translation_group_id: Set(translation_group_id),
        source_post_id: Set(payload.source_post_id),
        translation_status: Set(DbPostTranslationStatus::Source),
        translation_source_kind: Set(DbPostTranslationSourceKind::Manual),
        content_kind: Set(DbPostContentKind::from(payload.content_kind)),
        status: Set(DbPostStatus::from(payload.status)),
        visibility: Set(DbPostVisibility::from(payload.visibility)),
        published_at: Set(published_at),
        ..Default::default()
    }
    .insert(&tx)
    .await
    .map_err(map_create_error)?;

    // The newly-claimed slug supersedes any redirect that pointed at it as the
    // old slug (otherwise we'd have ambiguity: same slug both alive and as a
    // redirect target).
    delete_post_redirect(&tx, locale, &slug).await?;

    if matches!(payload.content_kind, PostContentKind::Project) {
        if let Some(profile) = &payload.project_profile {
            insert_project_profile(&tx, post_id, profile).await?;
        }
    }

    if !normalized_tag_slugs.is_empty() {
        replace_post_tags(&tx, post_id, &normalized_tag_slugs).await?;
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

/// Look up a stored slug redirect and the canonical target. The lookup is
/// gated on the target being a currently-published, currently-public blog
/// post — drafts, private posts, projects, and any in-flight `archived` row
/// are not exposed here. On hit the redirect's counter and timestamp are
/// bumped before returning.
pub async fn resolve_post_redirect(
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
        .filter(post::Column::ContentKind.eq(DbPostContentKind::Blog))
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

/// Delete a post and all of its translations (every row in the same
/// `translation_group_id`). Status/visibility filters apply only to the
/// initial slug lookup — once a logical post is targeted, all locale rows
/// in its group are removed atomically. Related rows in `post_tags`,
/// `project_profiles`, `series_posts`, and `post_comments` are cleaned up
/// by `ON DELETE CASCADE` FKs.
pub async fn delete_post_by_slug(
    pool: &DatabaseConnection,
    slug: &str,
    status: Option<PostStatus>,
    visibility: Option<PostVisibility>,
) -> Result<bool, AppError> {
    let mut query = post::Entity::find().filter(post::Column::Slug.eq(slug));
    if let Some(status) = status {
        query = query.filter(post::Column::Status.eq(DbPostStatus::from(status)));
    }
    if let Some(visibility) = visibility {
        query = query.filter(post::Column::Visibility.eq(DbPostVisibility::from(visibility)));
    }
    let target = query.one(pool).await?;
    let Some(target) = target else {
        return Ok(false);
    };

    ensure_source_post_mutation(PostLocale::from(target.locale), target.source_post_id)?;

    let result = post::Entity::delete_many()
        .filter(post::Column::TranslationGroupId.eq(target.translation_group_id))
        .exec(pool)
        .await?;
    Ok(result.rows_affected > 0)
}

/// Apply a [`PostCreate`] payload to the existing row identified by
/// `current_slug`. Returns `Ok(None)` when no row matches (→ 404). On a
/// successful slug change, the previous slug is recorded as a redirect so
/// inbound traffic to the old URL keeps resolving.
pub async fn update_post_by_slug(
    pool: &DatabaseConnection,
    current_slug: &str,
    payload: PostCreate,
) -> Result<Option<PostRead>, AppError> {
    let existing = post::Entity::find()
        .filter(post::Column::Slug.eq(current_slug))
        .one(pool)
        .await?;
    let Some(existing) = existing else {
        return Ok(None);
    };
    let existing_locale = PostLocale::from(existing.locale);
    let existing_status = PostStatus::from(existing.status);
    ensure_source_post_mutation(existing_locale, existing.source_post_id)?;
    ensure_source_post_mutation(payload.locale, payload.source_post_id)?;

    let series_title = normalize_optional_text(&payload.series_title);
    let translation_group_id = payload
        .translation_group_id
        .unwrap_or(existing.translation_group_id);
    let source_post_id = payload.source_post_id.or(existing.source_post_id);

    // published_at carry-over rules:
    //   - both old and new state are Published: keep the original publish ts
    //   - new state is Published with no explicit ts: stamp now
    //   - any other shape: take whatever the payload supplied (incl. None)
    let published_at = match (existing_status, payload.status, payload.published_at) {
        (PostStatus::Published, PostStatus::Published, _) => existing.published_at,
        (_, PostStatus::Published, None) => Some(Utc::now()),
        (_, _, supplied) => supplied,
    };

    let normalized_tag_slugs = normalize_tag_slugs(&payload.tags);
    let new_slug = payload.slug.clone();
    let locale = payload.locale;

    let tx = pool.begin().await?;

    let mut active: post::ActiveModel = existing.clone().into();
    active.slug = Set(new_slug.clone());
    active.title = Set(payload.title.clone());
    active.excerpt = Set(payload.excerpt.clone());
    active.body_markdown = Set(payload.body_markdown.clone());
    active.cover_image_url = Set(payload.cover_image_url.clone());
    active.top_media_kind = Set(DbPostTopMediaKind::from(payload.top_media_kind));
    active.top_media_image_url = Set(payload.top_media_image_url.clone());
    active.top_media_youtube_url = Set(payload.top_media_youtube_url.clone());
    active.top_media_video_url = Set(payload.top_media_video_url.clone());
    active.series_title = Set(series_title.clone());
    active.locale = Set(DbPostLocale::from(locale));
    active.translation_group_id = Set(translation_group_id);
    active.source_post_id = Set(source_post_id);
    active.content_kind = Set(DbPostContentKind::from(payload.content_kind));
    active.status = Set(DbPostStatus::from(payload.status));
    active.visibility = Set(DbPostVisibility::from(payload.visibility));
    active.published_at = Set(published_at);
    active.updated_at = Set(Utc::now());
    active.update(&tx).await.map_err(map_create_error)?;

    if existing.slug != new_slug {
        record_post_rename(&tx, &existing.slug, &new_slug, locale, existing.id).await?;
    }

    if matches!(payload.content_kind, PostContentKind::Project) {
        if let Some(profile) = &payload.project_profile {
            upsert_project_profile(&tx, existing.id, profile).await?;
        }
    } else {
        project_profile::Entity::delete_many()
            .filter(project_profile::Column::PostId.eq(existing.id))
            .exec(&tx)
            .await?;
    }

    post_tag::Entity::delete_many()
        .filter(post_tag::Column::PostId.eq(existing.id))
        .exec(&tx)
        .await?;
    if !normalized_tag_slugs.is_empty() {
        replace_post_tags(&tx, existing.id, &normalized_tag_slugs).await?;
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

/// Prepare a single translated sibling for retranslation. Returns the source
/// `ko` post id that should be queued for the requested target locale.
pub async fn prepare_post_retranslation(
    pool: &DatabaseConnection,
    slug: &str,
    target_locale: PostLocale,
) -> Result<Uuid, AppError> {
    if matches!(target_locale, PostLocale::Ko) {
        return Err(AppError::Forbidden(
            "source posts cannot be retranslated".into(),
        ));
    }

    let target = post::Entity::find()
        .filter(post::Column::Slug.eq(slug))
        .filter(post::Column::Locale.eq(DbPostLocale::from(target_locale)))
        .one(pool)
        .await?
        .ok_or(AppError::NotFound("post not found"))?;

    let source_id = target.source_post_id.ok_or_else(|| {
        AppError::Forbidden("only auto-translated posts can be retranslated".into())
    })?;

    let source = post::Entity::find_by_id(source_id)
        .one(pool)
        .await?
        .ok_or(AppError::NotFound("source post not found"))?;

    if !matches!(PostLocale::from(source.locale), PostLocale::Ko) || source.source_post_id.is_some()
    {
        return Err(AppError::Forbidden("invalid translation source".into()));
    }

    let mut active: post::ActiveModel = target.into();
    active.translated_from_hash = Set(None);
    active.translation_status = Set(DbPostTranslationStatus::Stale);
    active.updated_at = Set(Utc::now());
    active.update(pool).await?;

    Ok(source.id)
}

async fn record_post_rename(
    tx: &DatabaseTransaction,
    old_slug: &str,
    new_slug: &str,
    locale: PostLocale,
    target_post_id: Uuid,
) -> Result<(), DbErr> {
    delete_post_redirect(tx, locale, old_slug).await?;
    post_slug_redirect::ActiveModel {
        id: Set(Uuid::new_v4()),
        locale: Set(DbPostLocale::from(locale)),
        old_slug: Set(old_slug.to_string()),
        target_post_id: Set(target_post_id),
        hit_count: Set(0),
        ..Default::default()
    }
    .insert(tx)
    .await?;
    delete_post_redirect(tx, locale, new_slug).await?;
    Ok(())
}

async fn delete_post_redirect(
    tx: &DatabaseTransaction,
    locale: PostLocale,
    old_slug: &str,
) -> Result<(), DbErr> {
    post_slug_redirect::Entity::delete_many()
        .filter(post_slug_redirect::Column::Locale.eq(DbPostLocale::from(locale)))
        .filter(post_slug_redirect::Column::OldSlug.eq(old_slug))
        .exec(tx)
        .await?;
    Ok(())
}

async fn upsert_project_profile(
    tx: &DatabaseTransaction,
    post_id: Uuid,
    profile: &ProjectProfilePayload,
) -> Result<(), DbErr> {
    let project_intro = profile
        .project_intro
        .as_deref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let highlights_json =
        serde_json::to_value(&profile.highlights).unwrap_or(serde_json::json!([]));
    let resource_links_json =
        serde_json::to_value(&profile.resource_links).unwrap_or(serde_json::json!([]));

    let existing = project_profile::Entity::find()
        .filter(project_profile::Column::PostId.eq(post_id))
        .one(tx)
        .await?;

    match existing {
        Some(existing) => {
            let mut active: project_profile::ActiveModel = existing.into();
            active.period_label = Set(profile.period_label.clone());
            active.role_summary = Set(profile.role_summary.clone());
            active.project_intro = Set(project_intro);
            active.card_image_url = Set(Some(profile.card_image_url.clone()));
            active.highlights_json = Set(highlights_json);
            active.resource_links_json = Set(resource_links_json);
            active.updated_at = Set(Utc::now());
            active.update(tx).await?;
        }
        None => {
            insert_project_profile(tx, post_id, profile).await?;
        }
    }
    Ok(())
}

async fn insert_project_profile(
    tx: &DatabaseTransaction,
    post_id: Uuid,
    profile: &ProjectProfilePayload,
) -> Result<(), DbErr> {
    let project_intro = profile
        .project_intro
        .as_deref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let highlights_json =
        serde_json::to_value(&profile.highlights).unwrap_or(serde_json::json!([]));
    let resource_links_json =
        serde_json::to_value(&profile.resource_links).unwrap_or(serde_json::json!([]));

    project_profile::ActiveModel {
        id: Set(Uuid::new_v4()),
        post_id: Set(post_id),
        period_label: Set(profile.period_label.clone()),
        role_summary: Set(profile.role_summary.clone()),
        project_intro: Set(project_intro),
        card_image_url: Set(Some(profile.card_image_url.clone())),
        highlights_json: Set(highlights_json),
        resource_links_json: Set(resource_links_json),
        ..Default::default()
    }
    .insert(tx)
    .await?;
    Ok(())
}

async fn replace_post_tags(
    tx: &DatabaseTransaction,
    post_id: Uuid,
    normalized_tag_slugs: &[String],
) -> Result<(), DbErr> {
    let existing_tags = tag::Entity::find()
        .filter(tag::Column::Slug.is_in(normalized_tag_slugs.iter().cloned()))
        .all(tx)
        .await?;
    let existing_slugs: std::collections::HashSet<String> =
        existing_tags.iter().map(|t| t.slug.clone()).collect();

    for slug in normalized_tag_slugs {
        if existing_slugs.contains(slug) {
            continue;
        }
        let insert_result = tag::ActiveModel {
            id: Set(Uuid::new_v4()),
            slug: Set(slug.clone()),
            label: Set(slug.clone()),
            ..Default::default()
        }
        .insert(tx)
        .await;
        if let Err(err) = insert_result {
            if !db::unique_violation(&err) {
                return Err(err);
            }
        }
    }

    let tags = tag::Entity::find()
        .filter(tag::Column::Slug.is_in(normalized_tag_slugs.iter().cloned()))
        .all(tx)
        .await?;
    for tag in tags {
        post_tag::ActiveModel {
            post_id: Set(post_id),
            tag_id: Set(tag.id),
        }
        .insert(tx)
        .await?;
    }
    Ok(())
}
