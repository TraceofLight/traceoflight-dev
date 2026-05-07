//! Public DTOs and enums for the post content surface.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::serializers::{serialize_dt_us, serialize_dt_us_opt};

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
