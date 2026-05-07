//! Write paths for posts: create, update, delete, and slug-redirect resolve.

use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

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
