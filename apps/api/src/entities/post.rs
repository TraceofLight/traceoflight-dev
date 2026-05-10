use sea_orm::entity::prelude::*;

use super::enums::{
    DbPostContentKind, DbPostLocale, DbPostStatus, DbPostTopMediaKind, DbPostTranslationSourceKind,
    DbPostTranslationStatus, DbPostVisibility,
};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "posts")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub slug: String,
    pub title: String,
    pub excerpt: Option<String>,
    pub body_markdown: String,
    pub cover_image_url: Option<String>,
    pub status: DbPostStatus,
    pub published_at: Option<DateTimeUtc>,
    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
    pub visibility: DbPostVisibility,
    pub series_title: Option<String>,
    pub content_kind: DbPostContentKind,
    pub top_media_kind: DbPostTopMediaKind,
    pub top_media_image_url: Option<String>,
    pub top_media_youtube_url: Option<String>,
    pub top_media_video_url: Option<String>,
    pub project_order_index: Option<i32>,
    pub locale: DbPostLocale,
    pub translation_group_id: Uuid,
    pub source_post_id: Option<Uuid>,
    pub translation_status: DbPostTranslationStatus,
    pub translation_source_kind: DbPostTranslationSourceKind,
    pub translated_from_hash: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter)]
pub enum Relation {
    PostComment,
    PostTag,
    ProjectProfile,
    SeriesPost,
}

impl RelationTrait for Relation {
    fn def(&self) -> RelationDef {
        match self {
            Self::PostComment => Entity::has_many(super::post_comment::Entity).into(),
            Self::PostTag => Entity::has_many(super::post_tag::Entity).into(),
            Self::ProjectProfile => Entity::has_one(super::project_profile::Entity).into(),
            Self::SeriesPost => Entity::has_one(super::series_post::Entity).into(),
        }
    }
}

impl Related<super::post_comment::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::PostComment.def()
    }
}

impl Related<super::post_tag::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::PostTag.def()
    }
}

impl Related<super::project_profile::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::ProjectProfile.def()
    }
}

impl Related<super::series_post::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::SeriesPost.def()
    }
}

impl Related<super::tag::Entity> for Entity {
    fn to() -> RelationDef {
        super::post_tag::Relation::Tag.def()
    }

    fn via() -> Option<RelationDef> {
        Some(super::post_tag::Relation::Post.def().rev())
    }
}

impl Related<super::series::Entity> for Entity {
    fn to() -> RelationDef {
        super::series_post::Relation::Series.def()
    }

    fn via() -> Option<RelationDef> {
        Some(super::series_post::Relation::Post.def().rev())
    }
}

impl ActiveModelBehavior for ActiveModel {}
