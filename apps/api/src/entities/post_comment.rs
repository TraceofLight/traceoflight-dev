use sea_orm::entity::prelude::*;

use super::enums::{DbCommentAuthorType, DbCommentStatus, DbCommentVisibility};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "post_comments")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub post_id: Uuid,
    pub root_comment_id: Option<Uuid>,
    pub reply_to_comment_id: Option<Uuid>,
    pub author_name: String,
    pub author_type: DbCommentAuthorType,
    pub password_hash: Option<String>,
    pub visibility: DbCommentVisibility,
    pub status: DbCommentStatus,
    pub body: String,
    pub deleted_at: Option<DateTimeUtc>,
    pub last_edited_at: Option<DateTimeUtc>,
    pub request_ip_hash: Option<String>,
    pub user_agent_hash: Option<String>,
    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::post::Entity",
        from = "Column::PostId",
        to = "super::post::Column::Id",
        on_delete = "Cascade"
    )]
    Post,
}

impl Related<super::post::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Post.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
