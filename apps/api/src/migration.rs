use sea_orm_migration::prelude::{sea_query::extension::postgres::Type, *};

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![Box::new(M20260507000000InitialSchema)]
    }
}

struct M20260507000000InitialSchema;

impl MigrationName for M20260507000000InitialSchema {
    fn name(&self) -> &str {
        "m20260507000000_initial_schema"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for M20260507000000InitialSchema {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Existing live DBs already have the initial schema from the SQL/Alembic
        // era. Treat that schema as the baseline and let SeaORM record this
        // migration after removing known legacy objects.
        if manager.has_table("posts").await? {
            cleanup_legacy_schema(manager).await?;
            return Ok(());
        }

        create_enum_types(manager).await?;
        create_tables(manager).await?;
        create_indexes(manager).await?;
        cleanup_legacy_schema(manager).await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        for table in [
            PostSlugRedirects::Table.into_iden(),
            SeriesSlugRedirects::Table.into_iden(),
            PostComments::Table.into_iden(),
            PostTags::Table.into_iden(),
            SeriesPosts::Table.into_iden(),
            ProjectProfiles::Table.into_iden(),
            MediaAssets::Table.into_iden(),
            Posts::Table.into_iden(),
            Series::Table.into_iden(),
            Tags::Table.into_iden(),
            SiteProfiles::Table.into_iden(),
            AdminCredentials::Table.into_iden(),
        ] {
            manager
                .drop_table(Table::drop().table(table).if_exists().cascade().to_owned())
                .await?;
        }

        for pg_type in [
            PgType::PostVisibility,
            PgType::PostTranslationStatus,
            PgType::PostTranslationSourceKind,
            PgType::PostTopMediaKind,
            PgType::PostStatus,
            PgType::PostLocale,
            PgType::PostContentKind,
            PgType::PostCommentVisibility,
            PgType::PostCommentStatus,
            PgType::PostCommentAuthorType,
            PgType::AssetKind,
        ] {
            manager
                .drop_type(Type::drop().if_exists().name(pg_type).to_owned())
                .await?;
        }

        Ok(())
    }
}

async fn cleanup_legacy_schema(manager: &SchemaManager<'_>) -> Result<(), DbErr> {
    manager
        .drop_index(
            Index::drop()
                .if_exists()
                .name("ix_project_profiles_post_id")
                .table(ProjectProfiles::Table)
                .to_owned(),
        )
        .await?;

    manager
        .drop_table(
            Table::drop()
                .if_exists()
                .table(AlembicVersion::Table)
                .cascade()
                .to_owned(),
        )
        .await?;

    Ok(())
}

async fn create_enum_types(manager: &SchemaManager<'_>) -> Result<(), DbErr> {
    for (name, values) in [
        (PgType::AssetKind, &["image", "video", "file"][..]),
        (PgType::PostCommentAuthorType, &["guest", "admin"][..]),
        (PgType::PostCommentStatus, &["active", "deleted"][..]),
        (PgType::PostCommentVisibility, &["public", "private"][..]),
        (PgType::PostContentKind, &["blog", "project"][..]),
        (PgType::PostLocale, &["ko", "en", "ja", "zh"][..]),
        (PgType::PostStatus, &["draft", "published", "archived"][..]),
        (PgType::PostTopMediaKind, &["image", "youtube", "video"][..]),
        (
            PgType::PostTranslationSourceKind,
            &["manual", "machine"][..],
        ),
        (
            PgType::PostTranslationStatus,
            &["source", "synced", "stale", "failed"][..],
        ),
        (PgType::PostVisibility, &["public", "private"][..]),
    ] {
        manager
            .create_type(
                Type::create()
                    .as_enum(name)
                    .values(values.iter().copied().map(Alias::new))
                    .to_owned(),
            )
            .await?;
    }

    Ok(())
}

async fn create_tables(manager: &SchemaManager<'_>) -> Result<(), DbErr> {
    create_admin_credentials(manager).await?;
    create_site_profiles(manager).await?;
    create_tags(manager).await?;
    create_posts(manager).await?;
    create_series(manager).await?;
    create_media_assets(manager).await?;
    create_post_comments(manager).await?;
    create_post_slug_redirects(manager).await?;
    create_project_profiles(manager).await?;
    create_post_tags(manager).await?;
    create_series_posts(manager).await?;
    create_series_slug_redirects(manager).await?;
    Ok(())
}

async fn create_admin_credentials(manager: &SchemaManager<'_>) -> Result<(), DbErr> {
    manager
        .create_table(
            Table::create()
                .if_not_exists()
                .table(AdminCredentials::Table)
                .col(varchar_pk(AdminCredentials::Key, 40))
                .col(varchar_not_null(AdminCredentials::LoginId, 120))
                .col(varchar_not_null(AdminCredentials::PasswordHash, 255))
                .col(integer_not_null_default(
                    AdminCredentials::CredentialRevision,
                    1,
                ))
                .col(timestamptz_not_null_default(AdminCredentials::CreatedAt))
                .col(timestamptz_not_null_default(AdminCredentials::UpdatedAt))
                .to_owned(),
        )
        .await
}

async fn create_site_profiles(manager: &SchemaManager<'_>) -> Result<(), DbErr> {
    manager
        .create_table(
            Table::create()
                .if_not_exists()
                .table(SiteProfiles::Table)
                .col(varchar_pk(SiteProfiles::Key, 40))
                .col(varchar_not_null(SiteProfiles::Email, 255))
                .col(varchar_not_null(SiteProfiles::GithubUrl, 500))
                .col(timestamptz_not_null_default(SiteProfiles::CreatedAt))
                .col(timestamptz_not_null_default(SiteProfiles::UpdatedAt))
                .to_owned(),
        )
        .await
}

async fn create_tags(manager: &SchemaManager<'_>) -> Result<(), DbErr> {
    manager
        .create_table(
            Table::create()
                .if_not_exists()
                .table(Tags::Table)
                .col(uuid_pk(Tags::Id))
                .col(varchar_not_null(Tags::Slug, 80))
                .col(varchar_not_null(Tags::Label, 80))
                .col(timestamptz_not_null_default(Tags::CreatedAt))
                .col(timestamptz_not_null_default(Tags::UpdatedAt))
                .to_owned(),
        )
        .await
}

async fn create_posts(manager: &SchemaManager<'_>) -> Result<(), DbErr> {
    manager
        .create_table(
            Table::create()
                .if_not_exists()
                .table(Posts::Table)
                .col(uuid_pk(Posts::Id))
                .col(varchar_not_null(Posts::Slug, 160))
                .col(varchar_not_null(Posts::Title, 200))
                .col(varchar_nullable(Posts::Excerpt, 400))
                .col(text_not_null(Posts::BodyMarkdown))
                .col(varchar_nullable(Posts::CoverImageUrl, 500))
                .col(enum_not_null_default(
                    Posts::Status,
                    PgType::PostStatus,
                    "draft",
                ))
                .col(timestamptz_nullable(Posts::PublishedAt))
                .col(timestamptz_not_null_default(Posts::CreatedAt))
                .col(timestamptz_not_null_default(Posts::UpdatedAt))
                .col(enum_not_null(Posts::Visibility, PgType::PostVisibility))
                .col(varchar_nullable(Posts::SeriesTitle, 200))
                .col(enum_not_null(Posts::ContentKind, PgType::PostContentKind))
                .col(enum_not_null(Posts::TopMediaKind, PgType::PostTopMediaKind))
                .col(varchar_nullable(Posts::TopMediaImageUrl, 500))
                .col(varchar_nullable(Posts::TopMediaYoutubeUrl, 500))
                .col(varchar_nullable(Posts::TopMediaVideoUrl, 500))
                .col(integer_nullable(Posts::ProjectOrderIndex))
                .col(enum_not_null(Posts::Locale, PgType::PostLocale))
                .col(uuid_not_null(Posts::TranslationGroupId))
                .col(uuid_nullable(Posts::SourcePostId))
                .col(enum_not_null(
                    Posts::TranslationStatus,
                    PgType::PostTranslationStatus,
                ))
                .col(enum_not_null(
                    Posts::TranslationSourceKind,
                    PgType::PostTranslationSourceKind,
                ))
                .col(varchar_nullable(Posts::TranslatedFromHash, 64))
                .foreign_key(
                    ForeignKey::create()
                        .name("fk_posts_source_post_id_posts")
                        .from(Posts::Table, Posts::SourcePostId)
                        .to(Posts::Table, Posts::Id)
                        .on_delete(ForeignKeyAction::SetNull),
                )
                .to_owned(),
        )
        .await
}

async fn create_series(manager: &SchemaManager<'_>) -> Result<(), DbErr> {
    manager
        .create_table(
            Table::create()
                .if_not_exists()
                .table(Series::Table)
                .col(uuid_pk(Series::Id))
                .col(varchar_not_null(Series::Slug, 160))
                .col(varchar_not_null(Series::Title, 200))
                .col(text_not_null(Series::Description))
                .col(varchar_nullable(Series::CoverImageUrl, 500))
                .col(timestamptz_not_null_default(Series::CreatedAt))
                .col(timestamptz_not_null_default(Series::UpdatedAt))
                .col(integer_nullable(Series::ListOrderIndex))
                .col(enum_not_null(Series::Locale, PgType::PostLocale))
                .col(uuid_not_null(Series::TranslationGroupId))
                .col(uuid_nullable(Series::SourceSeriesId))
                .col(enum_not_null(
                    Series::TranslationStatus,
                    PgType::PostTranslationStatus,
                ))
                .col(enum_not_null(
                    Series::TranslationSourceKind,
                    PgType::PostTranslationSourceKind,
                ))
                .col(varchar_nullable(Series::TranslatedFromHash, 64))
                .foreign_key(
                    ForeignKey::create()
                        .name("fk_series_source_series_id_series")
                        .from(Series::Table, Series::SourceSeriesId)
                        .to(Series::Table, Series::Id)
                        .on_delete(ForeignKeyAction::SetNull),
                )
                .to_owned(),
        )
        .await
}

async fn create_media_assets(manager: &SchemaManager<'_>) -> Result<(), DbErr> {
    manager
        .create_table(
            Table::create()
                .if_not_exists()
                .table(MediaAssets::Table)
                .col(uuid_pk(MediaAssets::Id))
                .col(enum_not_null(MediaAssets::Kind, PgType::AssetKind))
                .col(varchar_not_null(MediaAssets::Bucket, 100))
                .col(varchar_not_null(MediaAssets::ObjectKey, 512))
                .col(varchar_not_null(MediaAssets::OriginalFilename, 255))
                .col(varchar_not_null(MediaAssets::MimeType, 120))
                .col(big_integer_not_null_default(MediaAssets::SizeBytes, 0))
                .col(integer_nullable(MediaAssets::Width))
                .col(integer_nullable(MediaAssets::Height))
                .col(integer_nullable(MediaAssets::DurationSeconds))
                .col(uuid_nullable(MediaAssets::OwnerPostId))
                .col(timestamptz_not_null_default(MediaAssets::CreatedAt))
                .col(timestamptz_not_null_default(MediaAssets::UpdatedAt))
                .foreign_key(
                    ForeignKey::create()
                        .name("media_assets_owner_post_id_fkey")
                        .from(MediaAssets::Table, MediaAssets::OwnerPostId)
                        .to(Posts::Table, Posts::Id)
                        .on_delete(ForeignKeyAction::SetNull),
                )
                .to_owned(),
        )
        .await
}

async fn create_post_comments(manager: &SchemaManager<'_>) -> Result<(), DbErr> {
    manager
        .create_table(
            Table::create()
                .if_not_exists()
                .table(PostComments::Table)
                .col(uuid_not_null(PostComments::PostId))
                .col(uuid_nullable(PostComments::RootCommentId))
                .col(uuid_nullable(PostComments::ReplyToCommentId))
                .col(varchar_not_null(PostComments::AuthorName, 80))
                .col(enum_not_null(
                    PostComments::AuthorType,
                    PgType::PostCommentAuthorType,
                ))
                .col(varchar_nullable(PostComments::PasswordHash, 255))
                .col(enum_not_null(
                    PostComments::Visibility,
                    PgType::PostCommentVisibility,
                ))
                .col(enum_not_null(
                    PostComments::Status,
                    PgType::PostCommentStatus,
                ))
                .col(text_not_null(PostComments::Body))
                .col(timestamptz_nullable(PostComments::DeletedAt))
                .col(timestamptz_nullable(PostComments::LastEditedAt))
                .col(varchar_nullable(PostComments::RequestIpHash, 128))
                .col(varchar_nullable(PostComments::UserAgentHash, 128))
                .col(timestamptz_not_null_default(PostComments::CreatedAt))
                .col(timestamptz_not_null_default(PostComments::UpdatedAt))
                .col(uuid_pk(PostComments::Id))
                .foreign_key(
                    ForeignKey::create()
                        .name("post_comments_post_id_fkey")
                        .from(PostComments::Table, PostComments::PostId)
                        .to(Posts::Table, Posts::Id)
                        .on_delete(ForeignKeyAction::Cascade),
                )
                .foreign_key(
                    ForeignKey::create()
                        .name("post_comments_root_comment_id_fkey")
                        .from(PostComments::Table, PostComments::RootCommentId)
                        .to(PostComments::Table, PostComments::Id)
                        .on_delete(ForeignKeyAction::Cascade),
                )
                .foreign_key(
                    ForeignKey::create()
                        .name("post_comments_reply_to_comment_id_fkey")
                        .from(PostComments::Table, PostComments::ReplyToCommentId)
                        .to(PostComments::Table, PostComments::Id)
                        .on_delete(ForeignKeyAction::Cascade),
                )
                .to_owned(),
        )
        .await
}

async fn create_post_slug_redirects(manager: &SchemaManager<'_>) -> Result<(), DbErr> {
    manager
        .create_table(
            Table::create()
                .if_not_exists()
                .table(PostSlugRedirects::Table)
                .col(uuid_pk(PostSlugRedirects::Id))
                .col(enum_not_null(PostSlugRedirects::Locale, PgType::PostLocale))
                .col(varchar_not_null(PostSlugRedirects::OldSlug, 160))
                .col(uuid_not_null(PostSlugRedirects::TargetPostId))
                .col(timestamptz_not_null_default(PostSlugRedirects::CreatedAt))
                .col(timestamptz_nullable(PostSlugRedirects::LastHitAt))
                .col(integer_not_null_default(PostSlugRedirects::HitCount, 0))
                .foreign_key(
                    ForeignKey::create()
                        .name("fk_post_slug_redirects_target_post_id")
                        .from(PostSlugRedirects::Table, PostSlugRedirects::TargetPostId)
                        .to(Posts::Table, Posts::Id)
                        .on_delete(ForeignKeyAction::Cascade),
                )
                .to_owned(),
        )
        .await
}

async fn create_project_profiles(manager: &SchemaManager<'_>) -> Result<(), DbErr> {
    manager
        .create_table(
            Table::create()
                .if_not_exists()
                .table(ProjectProfiles::Table)
                .col(uuid_pk(ProjectProfiles::Id))
                .col(uuid_not_null(ProjectProfiles::PostId))
                .col(varchar_not_null(ProjectProfiles::PeriodLabel, 120))
                .col(varchar_not_null(ProjectProfiles::RoleSummary, 240))
                .col(varchar_nullable(ProjectProfiles::CardImageUrl, 500))
                .col(jsonb_not_null_default(ProjectProfiles::HighlightsJson))
                .col(jsonb_not_null_default(ProjectProfiles::ResourceLinksJson))
                .col(timestamptz_not_null_default(ProjectProfiles::CreatedAt))
                .col(timestamptz_not_null_default(ProjectProfiles::UpdatedAt))
                .col(text_nullable(ProjectProfiles::ProjectIntro))
                .foreign_key(
                    ForeignKey::create()
                        .name("project_profiles_post_id_fkey")
                        .from(ProjectProfiles::Table, ProjectProfiles::PostId)
                        .to(Posts::Table, Posts::Id)
                        .on_delete(ForeignKeyAction::Cascade),
                )
                .to_owned(),
        )
        .await
}

async fn create_post_tags(manager: &SchemaManager<'_>) -> Result<(), DbErr> {
    manager
        .create_table(
            Table::create()
                .if_not_exists()
                .table(PostTags::Table)
                .col(uuid_not_null(PostTags::PostId))
                .col(uuid_not_null(PostTags::TagId))
                .primary_key(
                    Index::create()
                        .name("post_tags_pkey")
                        .col(PostTags::PostId)
                        .col(PostTags::TagId),
                )
                .foreign_key(
                    ForeignKey::create()
                        .name("post_tags_post_id_fkey")
                        .from(PostTags::Table, PostTags::PostId)
                        .to(Posts::Table, Posts::Id)
                        .on_delete(ForeignKeyAction::Cascade),
                )
                .foreign_key(
                    ForeignKey::create()
                        .name("post_tags_tag_id_fkey")
                        .from(PostTags::Table, PostTags::TagId)
                        .to(Tags::Table, Tags::Id),
                )
                .to_owned(),
        )
        .await
}

async fn create_series_posts(manager: &SchemaManager<'_>) -> Result<(), DbErr> {
    manager
        .create_table(
            Table::create()
                .if_not_exists()
                .table(SeriesPosts::Table)
                .col(uuid_pk(SeriesPosts::Id))
                .col(uuid_not_null(SeriesPosts::SeriesId))
                .col(uuid_not_null(SeriesPosts::PostId))
                .col(integer_not_null(SeriesPosts::OrderIndex))
                .col(timestamptz_not_null_default(SeriesPosts::CreatedAt))
                .col(timestamptz_not_null_default(SeriesPosts::UpdatedAt))
                .foreign_key(
                    ForeignKey::create()
                        .name("series_posts_series_id_fkey")
                        .from(SeriesPosts::Table, SeriesPosts::SeriesId)
                        .to(Series::Table, Series::Id)
                        .on_delete(ForeignKeyAction::Cascade),
                )
                .foreign_key(
                    ForeignKey::create()
                        .name("series_posts_post_id_fkey")
                        .from(SeriesPosts::Table, SeriesPosts::PostId)
                        .to(Posts::Table, Posts::Id)
                        .on_delete(ForeignKeyAction::Cascade),
                )
                .to_owned(),
        )
        .await
}

async fn create_series_slug_redirects(manager: &SchemaManager<'_>) -> Result<(), DbErr> {
    manager
        .create_table(
            Table::create()
                .if_not_exists()
                .table(SeriesSlugRedirects::Table)
                .col(uuid_pk(SeriesSlugRedirects::Id))
                .col(enum_not_null(
                    SeriesSlugRedirects::Locale,
                    PgType::PostLocale,
                ))
                .col(varchar_not_null(SeriesSlugRedirects::OldSlug, 160))
                .col(uuid_not_null(SeriesSlugRedirects::TargetSeriesId))
                .col(timestamptz_not_null_default(SeriesSlugRedirects::CreatedAt))
                .col(timestamptz_nullable(SeriesSlugRedirects::LastHitAt))
                .col(integer_not_null_default(SeriesSlugRedirects::HitCount, 0))
                .foreign_key(
                    ForeignKey::create()
                        .name("fk_series_slug_redirects_target_series_id")
                        .from(
                            SeriesSlugRedirects::Table,
                            SeriesSlugRedirects::TargetSeriesId,
                        )
                        .to(Series::Table, Series::Id)
                        .on_delete(ForeignKeyAction::Cascade),
                )
                .to_owned(),
        )
        .await
}

async fn create_indexes(manager: &SchemaManager<'_>) -> Result<(), DbErr> {
    create_unique_index1(
        manager,
        "admin_credentials_login_id_key",
        AdminCredentials::Table,
        AdminCredentials::LoginId,
    )
    .await?;
    create_index1(
        manager,
        "ix_media_assets_kind",
        MediaAssets::Table,
        MediaAssets::Kind,
    )
    .await?;
    create_unique_index1(
        manager,
        "ix_media_assets_object_key",
        MediaAssets::Table,
        MediaAssets::ObjectKey,
    )
    .await?;
    create_index1(
        manager,
        "ix_post_comments_post_id",
        PostComments::Table,
        PostComments::PostId,
    )
    .await?;
    create_index1(
        manager,
        "ix_post_comments_reply_to_comment_id",
        PostComments::Table,
        PostComments::ReplyToCommentId,
    )
    .await?;
    create_index1(
        manager,
        "ix_post_comments_root_comment_id",
        PostComments::Table,
        PostComments::RootCommentId,
    )
    .await?;
    create_index1(
        manager,
        "ix_post_comments_status",
        PostComments::Table,
        PostComments::Status,
    )
    .await?;
    create_index1(
        manager,
        "ix_post_comments_visibility",
        PostComments::Table,
        PostComments::Visibility,
    )
    .await?;
    create_unique_index2(
        manager,
        "uq_post_slug_redirects_locale_old_slug",
        PostSlugRedirects::Table,
        PostSlugRedirects::Locale,
        PostSlugRedirects::OldSlug,
    )
    .await?;
    create_index1(
        manager,
        "ix_post_slug_redirects_target_post_id",
        PostSlugRedirects::Table,
        PostSlugRedirects::TargetPostId,
    )
    .await?;
    create_index1(
        manager,
        "ix_post_tags_tag_id",
        PostTags::Table,
        PostTags::TagId,
    )
    .await?;
    create_unique_index2(
        manager,
        "uq_posts_slug_locale",
        Posts::Table,
        Posts::Slug,
        Posts::Locale,
    )
    .await?;
    create_index1(
        manager,
        "ix_posts_content_kind",
        Posts::Table,
        Posts::ContentKind,
    )
    .await?;
    create_index1(manager, "ix_posts_locale", Posts::Table, Posts::Locale).await?;
    create_index1(
        manager,
        "ix_posts_project_order_index",
        Posts::Table,
        Posts::ProjectOrderIndex,
    )
    .await?;
    create_index1(
        manager,
        "ix_posts_series_title",
        Posts::Table,
        Posts::SeriesTitle,
    )
    .await?;
    create_index1(
        manager,
        "ix_posts_source_post_id",
        Posts::Table,
        Posts::SourcePostId,
    )
    .await?;
    create_index1(manager, "ix_posts_status", Posts::Table, Posts::Status).await?;
    create_index1(
        manager,
        "ix_posts_translation_group_id",
        Posts::Table,
        Posts::TranslationGroupId,
    )
    .await?;
    create_index1(
        manager,
        "ix_posts_visibility",
        Posts::Table,
        Posts::Visibility,
    )
    .await?;
    create_unique_index1(
        manager,
        "uq_project_profiles_post_id",
        ProjectProfiles::Table,
        ProjectProfiles::PostId,
    )
    .await?;
    create_unique_index2(
        manager,
        "uq_series_slug_locale",
        Series::Table,
        Series::Slug,
        Series::Locale,
    )
    .await?;
    create_index1(
        manager,
        "ix_series_list_order_index",
        Series::Table,
        Series::ListOrderIndex,
    )
    .await?;
    create_index1(manager, "ix_series_locale", Series::Table, Series::Locale).await?;
    create_index1(
        manager,
        "ix_series_source_series_id",
        Series::Table,
        Series::SourceSeriesId,
    )
    .await?;
    create_index1(
        manager,
        "ix_series_translation_group_id",
        Series::Table,
        Series::TranslationGroupId,
    )
    .await?;
    create_unique_index1(
        manager,
        "uq_series_posts_post_id",
        SeriesPosts::Table,
        SeriesPosts::PostId,
    )
    .await?;
    create_unique_index2(
        manager,
        "uq_series_posts_series_order",
        SeriesPosts::Table,
        SeriesPosts::SeriesId,
        SeriesPosts::OrderIndex,
    )
    .await?;
    create_index1(
        manager,
        "ix_series_posts_series_id",
        SeriesPosts::Table,
        SeriesPosts::SeriesId,
    )
    .await?;
    create_unique_index2(
        manager,
        "uq_series_slug_redirects_locale_old_slug",
        SeriesSlugRedirects::Table,
        SeriesSlugRedirects::Locale,
        SeriesSlugRedirects::OldSlug,
    )
    .await?;
    create_index1(
        manager,
        "ix_series_slug_redirects_target_series_id",
        SeriesSlugRedirects::Table,
        SeriesSlugRedirects::TargetSeriesId,
    )
    .await?;
    create_unique_index1(manager, "ix_tags_slug", Tags::Table, Tags::Slug).await?;

    Ok(())
}

async fn create_index1<T, C>(
    manager: &SchemaManager<'_>,
    name: &str,
    table: T,
    column: C,
) -> Result<(), DbErr>
where
    T: IntoTableRef,
    C: IntoIden,
{
    manager
        .create_index(
            Index::create()
                .if_not_exists()
                .name(name)
                .table(table)
                .col(column)
                .to_owned(),
        )
        .await
}

async fn create_unique_index1<T, C>(
    manager: &SchemaManager<'_>,
    name: &str,
    table: T,
    column: C,
) -> Result<(), DbErr>
where
    T: IntoTableRef,
    C: IntoIden,
{
    manager
        .create_index(
            Index::create()
                .if_not_exists()
                .unique()
                .name(name)
                .table(table)
                .col(column)
                .to_owned(),
        )
        .await
}

async fn create_unique_index2<T, C1, C2>(
    manager: &SchemaManager<'_>,
    name: &str,
    table: T,
    first: C1,
    second: C2,
) -> Result<(), DbErr>
where
    T: IntoTableRef,
    C1: IntoIden,
    C2: IntoIden,
{
    manager
        .create_index(
            Index::create()
                .if_not_exists()
                .unique()
                .name(name)
                .table(table)
                .col(first)
                .col(second)
                .to_owned(),
        )
        .await
}

fn uuid_pk<C>(name: C) -> ColumnDef
where
    C: IntoIden,
{
    let mut col = ColumnDef::new(name);
    col.uuid().not_null().primary_key();
    col
}

fn varchar_pk<C>(name: C, length: u32) -> ColumnDef
where
    C: IntoIden,
{
    let mut col = ColumnDef::new(name);
    col.string_len(length).not_null().primary_key();
    col
}

fn uuid_not_null<C>(name: C) -> ColumnDef
where
    C: IntoIden,
{
    let mut col = ColumnDef::new(name);
    col.uuid().not_null();
    col
}

fn uuid_nullable<C>(name: C) -> ColumnDef
where
    C: IntoIden,
{
    let mut col = ColumnDef::new(name);
    col.uuid();
    col
}

fn varchar_not_null<C>(name: C, length: u32) -> ColumnDef
where
    C: IntoIden,
{
    let mut col = ColumnDef::new(name);
    col.string_len(length).not_null();
    col
}

fn varchar_nullable<C>(name: C, length: u32) -> ColumnDef
where
    C: IntoIden,
{
    let mut col = ColumnDef::new(name);
    col.string_len(length);
    col
}

fn text_not_null<C>(name: C) -> ColumnDef
where
    C: IntoIden,
{
    let mut col = ColumnDef::new(name);
    col.text().not_null();
    col
}

fn text_nullable<C>(name: C) -> ColumnDef
where
    C: IntoIden,
{
    let mut col = ColumnDef::new(name);
    col.text();
    col
}

fn integer_not_null<C>(name: C) -> ColumnDef
where
    C: IntoIden,
{
    let mut col = ColumnDef::new(name);
    col.integer().not_null();
    col
}

fn integer_nullable<C>(name: C) -> ColumnDef
where
    C: IntoIden,
{
    let mut col = ColumnDef::new(name);
    col.integer();
    col
}

fn integer_not_null_default<C>(name: C, default: i32) -> ColumnDef
where
    C: IntoIden,
{
    let mut col = ColumnDef::new(name);
    col.integer().not_null().default(default);
    col
}

fn big_integer_not_null_default<C>(name: C, default: i64) -> ColumnDef
where
    C: IntoIden,
{
    let mut col = ColumnDef::new(name);
    col.big_integer().not_null().default(default);
    col
}

fn timestamptz_not_null_default<C>(name: C) -> ColumnDef
where
    C: IntoIden,
{
    let mut col = ColumnDef::new(name);
    col.timestamp_with_time_zone()
        .not_null()
        .default(Expr::current_timestamp());
    col
}

fn timestamptz_nullable<C>(name: C) -> ColumnDef
where
    C: IntoIden,
{
    let mut col = ColumnDef::new(name);
    col.timestamp_with_time_zone();
    col
}

fn jsonb_not_null_default<C>(name: C) -> ColumnDef
where
    C: IntoIden,
{
    let mut col = ColumnDef::new(name);
    col.json_binary()
        .not_null()
        .default(Expr::cust("'[]'::jsonb"));
    col
}

fn enum_not_null<C>(name: C, pg_type: PgType) -> ColumnDef
where
    C: IntoIden,
{
    let mut col = ColumnDef::new(name);
    col.custom(pg_type).not_null();
    col
}

fn enum_not_null_default<C>(name: C, pg_type: PgType, default: &str) -> ColumnDef
where
    C: IntoIden,
{
    let mut col = enum_not_null(name, pg_type);
    col.default(default);
    col
}

#[derive(Copy, Clone, DeriveIden)]
enum PgType {
    #[sea_orm(iden = "asset_kind")]
    AssetKind,
    #[sea_orm(iden = "post_comment_author_type")]
    PostCommentAuthorType,
    #[sea_orm(iden = "post_comment_status")]
    PostCommentStatus,
    #[sea_orm(iden = "post_comment_visibility")]
    PostCommentVisibility,
    #[sea_orm(iden = "post_content_kind")]
    PostContentKind,
    #[sea_orm(iden = "post_locale")]
    PostLocale,
    #[sea_orm(iden = "post_status")]
    PostStatus,
    #[sea_orm(iden = "post_top_media_kind")]
    PostTopMediaKind,
    #[sea_orm(iden = "post_translation_source_kind")]
    PostTranslationSourceKind,
    #[sea_orm(iden = "post_translation_status")]
    PostTranslationStatus,
    #[sea_orm(iden = "post_visibility")]
    PostVisibility,
}

#[derive(DeriveIden)]
enum AdminCredentials {
    #[sea_orm(iden = "admin_credentials")]
    Table,
    Key,
    LoginId,
    PasswordHash,
    CredentialRevision,
    CreatedAt,
    UpdatedAt,
}

#[derive(DeriveIden)]
enum AlembicVersion {
    #[sea_orm(iden = "alembic_version")]
    Table,
}

#[derive(DeriveIden)]
enum MediaAssets {
    #[sea_orm(iden = "media_assets")]
    Table,
    Id,
    Kind,
    Bucket,
    ObjectKey,
    OriginalFilename,
    MimeType,
    SizeBytes,
    Width,
    Height,
    DurationSeconds,
    OwnerPostId,
    CreatedAt,
    UpdatedAt,
}

#[derive(DeriveIden)]
enum PostComments {
    #[sea_orm(iden = "post_comments")]
    Table,
    Id,
    PostId,
    RootCommentId,
    ReplyToCommentId,
    AuthorName,
    AuthorType,
    PasswordHash,
    Visibility,
    Status,
    Body,
    DeletedAt,
    LastEditedAt,
    RequestIpHash,
    UserAgentHash,
    CreatedAt,
    UpdatedAt,
}

#[derive(DeriveIden)]
enum PostSlugRedirects {
    #[sea_orm(iden = "post_slug_redirects")]
    Table,
    Id,
    Locale,
    OldSlug,
    TargetPostId,
    CreatedAt,
    LastHitAt,
    HitCount,
}

#[derive(DeriveIden)]
enum PostTags {
    #[sea_orm(iden = "post_tags")]
    Table,
    PostId,
    TagId,
}

#[derive(DeriveIden)]
enum Posts {
    #[sea_orm(iden = "posts")]
    Table,
    Id,
    Slug,
    Title,
    Excerpt,
    BodyMarkdown,
    CoverImageUrl,
    Status,
    PublishedAt,
    CreatedAt,
    UpdatedAt,
    Visibility,
    SeriesTitle,
    ContentKind,
    TopMediaKind,
    TopMediaImageUrl,
    TopMediaYoutubeUrl,
    TopMediaVideoUrl,
    ProjectOrderIndex,
    Locale,
    TranslationGroupId,
    SourcePostId,
    TranslationStatus,
    TranslationSourceKind,
    TranslatedFromHash,
}

#[derive(DeriveIden)]
enum ProjectProfiles {
    #[sea_orm(iden = "project_profiles")]
    Table,
    Id,
    PostId,
    PeriodLabel,
    RoleSummary,
    CardImageUrl,
    HighlightsJson,
    ResourceLinksJson,
    CreatedAt,
    UpdatedAt,
    ProjectIntro,
}

#[derive(DeriveIden)]
enum Series {
    #[sea_orm(iden = "series")]
    Table,
    Id,
    Slug,
    Title,
    Description,
    CoverImageUrl,
    CreatedAt,
    UpdatedAt,
    ListOrderIndex,
    Locale,
    TranslationGroupId,
    SourceSeriesId,
    TranslationStatus,
    TranslationSourceKind,
    TranslatedFromHash,
}

#[derive(DeriveIden)]
enum SeriesPosts {
    #[sea_orm(iden = "series_posts")]
    Table,
    Id,
    SeriesId,
    PostId,
    OrderIndex,
    CreatedAt,
    UpdatedAt,
}

#[derive(DeriveIden)]
enum SeriesSlugRedirects {
    #[sea_orm(iden = "series_slug_redirects")]
    Table,
    Id,
    Locale,
    OldSlug,
    TargetSeriesId,
    CreatedAt,
    LastHitAt,
    HitCount,
}

#[derive(DeriveIden)]
enum SiteProfiles {
    #[sea_orm(iden = "site_profiles")]
    Table,
    Key,
    Email,
    GithubUrl,
    CreatedAt,
    UpdatedAt,
}

#[derive(DeriveIden)]
enum Tags {
    #[sea_orm(iden = "tags")]
    Table,
    Id,
    Slug,
    Label,
    CreatedAt,
    UpdatedAt,
}
