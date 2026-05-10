use sea_orm::entity::prelude::*;

use super::enums::{DbPostLocale, DbPostTranslationSourceKind, DbPostTranslationStatus};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "series")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub cover_image_url: Option<String>,
    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
    pub list_order_index: Option<i32>,
    pub locale: DbPostLocale,
    pub translation_group_id: Uuid,
    pub source_series_id: Option<Uuid>,
    pub translation_status: DbPostTranslationStatus,
    pub translation_source_kind: DbPostTranslationSourceKind,
    pub translated_from_hash: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter)]
pub enum Relation {
    SeriesPost,
}

impl RelationTrait for Relation {
    fn def(&self) -> RelationDef {
        match self {
            Self::SeriesPost => Entity::has_many(super::series_post::Entity).into(),
        }
    }
}

impl Related<super::series_post::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::SeriesPost.def()
    }
}

impl Related<super::post::Entity> for Entity {
    fn to() -> RelationDef {
        super::series_post::Relation::Post.def()
    }

    fn via() -> Option<RelationDef> {
        Some(super::series_post::Relation::Series.def().rev())
    }
}

impl ActiveModelBehavior for ActiveModel {}
