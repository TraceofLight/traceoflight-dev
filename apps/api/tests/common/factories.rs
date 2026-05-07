use sqlx::PgPool;
use uuid::Uuid;

use traceoflight_api::posts::{
    PostContentKind, PostLocale, PostStatus, PostTopMediaKind, PostVisibility,
};

/// Minimal post identity returned by `PostFactory::create`.
pub struct CreatedPost {
    pub id: Uuid,
    pub slug: String,
    pub title: String,
}

/// Builder for inserting a post directly into the database, bypassing the
/// HTTP layer. Used to set up state for tests that exercise read endpoints.
pub struct PostFactory {
    title: String,
    slug: Option<String>,
    locale: PostLocale,
    status: PostStatus,
    visibility: PostVisibility,
    content_kind: PostContentKind,
    top_media_kind: PostTopMediaKind,
    body_markdown: String,
}

impl Default for PostFactory {
    fn default() -> Self {
        Self {
            title: format!("Test Post {}", Uuid::new_v4()),
            slug: None,
            locale: PostLocale::Ko,
            status: PostStatus::Published,
            visibility: PostVisibility::Public,
            content_kind: PostContentKind::Blog,
            top_media_kind: PostTopMediaKind::Image,
            body_markdown: String::new(),
        }
    }
}

impl PostFactory {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn title(mut self, v: impl Into<String>) -> Self {
        self.title = v.into();
        self
    }

    pub fn slug(mut self, v: impl Into<String>) -> Self {
        self.slug = Some(v.into());
        self
    }

    pub fn locale(mut self, v: PostLocale) -> Self {
        self.locale = v;
        self
    }

    pub fn draft(mut self) -> Self {
        self.status = PostStatus::Draft;
        self
    }

    pub fn private(mut self) -> Self {
        self.visibility = PostVisibility::Private;
        self
    }

    pub fn body(mut self, v: impl Into<String>) -> Self {
        self.body_markdown = v.into();
        self
    }

    /// Insert directly into `posts`. Skips business-logic hooks
    /// (reading-time, slug-redirect bookkeeping); callers needing those
    /// must drive the production endpoint instead.
    pub async fn create(self, pool: &PgPool) -> CreatedPost {
        let id = Uuid::new_v4();
        let translation_group_id = Uuid::new_v4();
        let derived_slug = self
            .slug
            .clone()
            .unwrap_or_else(|| slug_from_title(&self.title));

        sqlx::query(
            r#"
            INSERT INTO posts (
                id, slug, title, body_markdown,
                status, visibility, content_kind, top_media_kind, locale,
                translation_group_id, translation_status, translation_source_kind,
                published_at, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4,
                $5, $6, $7, $8, $9,
                $10, 'source'::public.post_translation_status,
                'manual'::public.post_translation_source_kind,
                NOW(), NOW(), NOW()
            )
            "#,
        )
        .bind(id)
        .bind(&derived_slug)
        .bind(&self.title)
        .bind(&self.body_markdown)
        .bind(self.status)
        .bind(self.visibility)
        .bind(self.content_kind)
        .bind(self.top_media_kind)
        .bind(self.locale)
        .bind(translation_group_id)
        .execute(pool)
        .await
        .expect("PostFactory::create insert");

        CreatedPost {
            id,
            slug: derived_slug,
            title: self.title,
        }
    }
}

fn slug_from_title(title: &str) -> String {
    let mut out = String::with_capacity(title.len());
    let mut last_dash = false;
    for c in title.trim().to_lowercase().chars() {
        if c.is_alphanumeric() {
            out.push(c);
            last_dash = false;
        } else if !last_dash {
            out.push('-');
            last_dash = true;
        }
    }
    out.trim_matches('-').to_string()
}
