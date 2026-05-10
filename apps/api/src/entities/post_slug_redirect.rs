use sea_orm::entity::prelude::*;

use super::enums::DbPostLocale;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "post_slug_redirects")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub locale: DbPostLocale,
    pub old_slug: String,
    pub target_post_id: Uuid,
    pub created_at: DateTimeUtc,
    pub last_hit_at: Option<DateTimeUtc>,
    pub hit_count: i32,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
