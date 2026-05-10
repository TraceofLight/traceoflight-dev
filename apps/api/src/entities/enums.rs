use sea_orm::entity::prelude::*;

use crate::posts::{PostContentKind, PostLocale, PostStatus, PostTopMediaKind, PostVisibility};

#[derive(Debug, Clone, Copy, PartialEq, Eq, EnumIter, DeriveActiveEnum)]
#[sea_orm(rs_type = "String", db_type = "Enum", enum_name = "asset_kind")]
pub enum DbAssetKind {
    #[sea_orm(string_value = "image")]
    Image,
    #[sea_orm(string_value = "video")]
    Video,
    #[sea_orm(string_value = "file")]
    File,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, EnumIter, DeriveActiveEnum)]
#[sea_orm(
    rs_type = "String",
    db_type = "Enum",
    enum_name = "post_comment_author_type"
)]
pub enum DbCommentAuthorType {
    #[sea_orm(string_value = "guest")]
    Guest,
    #[sea_orm(string_value = "admin")]
    Admin,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, EnumIter, DeriveActiveEnum)]
#[sea_orm(
    rs_type = "String",
    db_type = "Enum",
    enum_name = "post_comment_status"
)]
pub enum DbCommentStatus {
    #[sea_orm(string_value = "active")]
    Active,
    #[sea_orm(string_value = "deleted")]
    Deleted,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, EnumIter, DeriveActiveEnum)]
#[sea_orm(
    rs_type = "String",
    db_type = "Enum",
    enum_name = "post_comment_visibility"
)]
pub enum DbCommentVisibility {
    #[sea_orm(string_value = "public")]
    Public,
    #[sea_orm(string_value = "private")]
    Private,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, EnumIter, DeriveActiveEnum)]
#[sea_orm(rs_type = "String", db_type = "Enum", enum_name = "post_content_kind")]
pub enum DbPostContentKind {
    #[sea_orm(string_value = "blog")]
    Blog,
    #[sea_orm(string_value = "project")]
    Project,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, EnumIter, DeriveActiveEnum)]
#[sea_orm(rs_type = "String", db_type = "Enum", enum_name = "post_locale")]
pub enum DbPostLocale {
    #[sea_orm(string_value = "ko")]
    Ko,
    #[sea_orm(string_value = "en")]
    En,
    #[sea_orm(string_value = "ja")]
    Ja,
    #[sea_orm(string_value = "zh")]
    Zh,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, EnumIter, DeriveActiveEnum)]
#[sea_orm(rs_type = "String", db_type = "Enum", enum_name = "post_status")]
pub enum DbPostStatus {
    #[sea_orm(string_value = "draft")]
    Draft,
    #[sea_orm(string_value = "published")]
    Published,
    #[sea_orm(string_value = "archived")]
    Archived,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, EnumIter, DeriveActiveEnum)]
#[sea_orm(
    rs_type = "String",
    db_type = "Enum",
    enum_name = "post_top_media_kind"
)]
pub enum DbPostTopMediaKind {
    #[sea_orm(string_value = "image")]
    Image,
    #[sea_orm(string_value = "youtube")]
    Youtube,
    #[sea_orm(string_value = "video")]
    Video,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, EnumIter, DeriveActiveEnum)]
#[sea_orm(
    rs_type = "String",
    db_type = "Enum",
    enum_name = "post_translation_source_kind"
)]
pub enum DbPostTranslationSourceKind {
    #[sea_orm(string_value = "manual")]
    Manual,
    #[sea_orm(string_value = "machine")]
    Machine,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, EnumIter, DeriveActiveEnum)]
#[sea_orm(
    rs_type = "String",
    db_type = "Enum",
    enum_name = "post_translation_status"
)]
pub enum DbPostTranslationStatus {
    #[sea_orm(string_value = "source")]
    Source,
    #[sea_orm(string_value = "synced")]
    Synced,
    #[sea_orm(string_value = "stale")]
    Stale,
    #[sea_orm(string_value = "failed")]
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, EnumIter, DeriveActiveEnum)]
#[sea_orm(rs_type = "String", db_type = "Enum", enum_name = "post_visibility")]
pub enum DbPostVisibility {
    #[sea_orm(string_value = "public")]
    Public,
    #[sea_orm(string_value = "private")]
    Private,
}

impl From<PostStatus> for DbPostStatus {
    fn from(value: PostStatus) -> Self {
        match value {
            PostStatus::Draft => Self::Draft,
            PostStatus::Published => Self::Published,
            PostStatus::Archived => Self::Archived,
        }
    }
}

impl From<DbPostStatus> for PostStatus {
    fn from(value: DbPostStatus) -> Self {
        match value {
            DbPostStatus::Draft => Self::Draft,
            DbPostStatus::Published => Self::Published,
            DbPostStatus::Archived => Self::Archived,
        }
    }
}

impl From<PostVisibility> for DbPostVisibility {
    fn from(value: PostVisibility) -> Self {
        match value {
            PostVisibility::Public => Self::Public,
            PostVisibility::Private => Self::Private,
        }
    }
}

impl From<DbPostVisibility> for PostVisibility {
    fn from(value: DbPostVisibility) -> Self {
        match value {
            DbPostVisibility::Public => Self::Public,
            DbPostVisibility::Private => Self::Private,
        }
    }
}

impl From<PostContentKind> for DbPostContentKind {
    fn from(value: PostContentKind) -> Self {
        match value {
            PostContentKind::Blog => Self::Blog,
            PostContentKind::Project => Self::Project,
        }
    }
}

impl From<DbPostContentKind> for PostContentKind {
    fn from(value: DbPostContentKind) -> Self {
        match value {
            DbPostContentKind::Blog => Self::Blog,
            DbPostContentKind::Project => Self::Project,
        }
    }
}

impl From<PostLocale> for DbPostLocale {
    fn from(value: PostLocale) -> Self {
        match value {
            PostLocale::Ko => Self::Ko,
            PostLocale::En => Self::En,
            PostLocale::Ja => Self::Ja,
            PostLocale::Zh => Self::Zh,
        }
    }
}

impl From<DbPostLocale> for PostLocale {
    fn from(value: DbPostLocale) -> Self {
        match value {
            DbPostLocale::Ko => Self::Ko,
            DbPostLocale::En => Self::En,
            DbPostLocale::Ja => Self::Ja,
            DbPostLocale::Zh => Self::Zh,
        }
    }
}

impl From<PostTopMediaKind> for DbPostTopMediaKind {
    fn from(value: PostTopMediaKind) -> Self {
        match value {
            PostTopMediaKind::Image => Self::Image,
            PostTopMediaKind::Youtube => Self::Youtube,
            PostTopMediaKind::Video => Self::Video,
        }
    }
}

impl From<DbPostTopMediaKind> for PostTopMediaKind {
    fn from(value: DbPostTopMediaKind) -> Self {
        match value {
            DbPostTopMediaKind::Image => Self::Image,
            DbPostTopMediaKind::Youtube => Self::Youtube,
            DbPostTopMediaKind::Video => Self::Video,
        }
    }
}
