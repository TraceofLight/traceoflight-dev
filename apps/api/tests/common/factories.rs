use chrono::Utc;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, DatabaseConnection};
use uuid::Uuid;

use traceoflight_api::{
    entities::{
        enums::{
            DbPostContentKind, DbPostLocale, DbPostStatus, DbPostTopMediaKind,
            DbPostTranslationSourceKind, DbPostTranslationStatus, DbPostVisibility,
        },
        post,
    },
    posts::{PostContentKind, PostLocale, PostStatus, PostTopMediaKind, PostVisibility},
};

/// Minimal post identity returned by `PostFactory::create`.
pub struct CreatedPost {
    pub id: Uuid,
    pub slug: String,
    pub title: String,
    pub translation_group_id: Uuid,
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
    translation_group_id: Option<Uuid>,
    source_post_id: Option<Uuid>,
    translated_from_hash: Option<String>,
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
            translation_group_id: None,
            source_post_id: None,
            translated_from_hash: None,
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

    pub fn translation_group_id(mut self, v: Uuid) -> Self {
        self.translation_group_id = Some(v);
        self
    }

    pub fn source_post_id(mut self, v: Uuid) -> Self {
        self.source_post_id = Some(v);
        self
    }

    pub fn translated_from_hash(mut self, v: impl Into<String>) -> Self {
        self.translated_from_hash = Some(v.into());
        self
    }

    /// Insert directly into `posts`. Skips business-logic hooks
    /// (reading-time, slug-redirect bookkeeping); callers needing those
    /// must drive the production endpoint instead.
    pub async fn create(self, db: &DatabaseConnection) -> CreatedPost {
        let id = Uuid::new_v4();
        let translation_group_id = self.translation_group_id.unwrap_or_else(Uuid::new_v4);
        let derived_slug = self
            .slug
            .clone()
            .unwrap_or_else(|| slug_from_title(&self.title));
        let translation_status = if self.source_post_id.is_some() {
            DbPostTranslationStatus::Synced
        } else {
            DbPostTranslationStatus::Source
        };
        let translation_source_kind = if self.source_post_id.is_some() {
            DbPostTranslationSourceKind::Machine
        } else {
            DbPostTranslationSourceKind::Manual
        };
        let now = Utc::now();

        post::ActiveModel {
            id: Set(id),
            slug: Set(derived_slug.clone()),
            title: Set(self.title.clone()),
            body_markdown: Set(self.body_markdown),
            status: Set(DbPostStatus::from(self.status)),
            visibility: Set(DbPostVisibility::from(self.visibility)),
            content_kind: Set(DbPostContentKind::from(self.content_kind)),
            top_media_kind: Set(DbPostTopMediaKind::from(self.top_media_kind)),
            locale: Set(DbPostLocale::from(self.locale)),
            translation_group_id: Set(translation_group_id),
            source_post_id: Set(self.source_post_id),
            translation_status: Set(translation_status),
            translation_source_kind: Set(translation_source_kind),
            translated_from_hash: Set(self.translated_from_hash),
            published_at: Set(Some(now)),
            created_at: Set(now),
            updated_at: Set(now),
            ..Default::default()
        }
        .insert(db)
        .await
        .expect("PostFactory::create insert");

        CreatedPost {
            id,
            slug: derived_slug,
            title: self.title,
            translation_group_id,
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
