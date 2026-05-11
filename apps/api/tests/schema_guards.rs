use std::{fs, path::Path};

use sea_orm::ActiveEnum;
use sea_orm_migration::MigratorTrait;
use traceoflight_api::entities::enums::{DbPostTranslationSourceKind, DbPostTranslationStatus};
use traceoflight_api::migration::Migrator;

fn read_repo_file(relative: &str) -> String {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join(relative);
    fs::read_to_string(&path).unwrap_or_else(|err| panic!("read {}: {err}", path.display()))
}

#[test]
fn translation_writer_literals_match_database_enum_values() {
    let worker = read_repo_file("src/translation/worker.rs");
    let factory = read_repo_file("tests/common/factories.rs");
    let combined = format!("{worker}\n{factory}");

    assert!(
        !combined.contains("'translated'::post_translation_status"),
        "post_translation_status enum has no translated value; use synced"
    );
    assert!(
        !combined.contains("'auto'::post_translation_source_kind"),
        "post_translation_source_kind enum has no auto value; use machine"
    );
    assert_eq!(DbPostTranslationStatus::Synced.to_value(), "synced");
    assert_eq!(DbPostTranslationSourceKind::Machine.to_value(), "machine");
}

#[test]
fn schema_is_managed_by_seaorm_migrations() {
    assert!(
        !Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("migrations")
            .exists(),
        "SQL migration directory should be removed after moving schema management to SeaORM"
    );
    let migrations = Migrator::migrations();
    assert_eq!(migrations.len(), 1);
    assert_eq!(migrations[0].name(), "m20260507000000_initial_schema");
}

#[test]
fn backend_write_routes_have_operational_info_log_events() {
    let route_files = [
        "src/admin_auth.rs",
        "src/main.rs",
        "src/routes/admin.rs",
        "src/routes/backup.rs",
        "src/routes/comments.rs",
        "src/routes/media.rs",
        "src/routes/pdf.rs",
        "src/routes/posts.rs",
        "src/routes/projects.rs",
        "src/routes/series.rs",
        "src/routes/site_profile.rs",
        "src/routes/tags.rs",
        "src/translation/mod.rs",
    ];
    let combined = route_files
        .iter()
        .map(|path| read_repo_file(path))
        .collect::<Vec<_>>()
        .join("\n");

    for event in [
        "admin.login_succeeded",
        "admin.login_failed",
        "admin.login_throttled",
        "admin.token_rotated",
        "admin.token_refresh_stale",
        "admin.token_refresh_failed",
        "admin.token_reuse_detected",
        "admin.logout_acknowledged",
        "admin.credentials_updated",
        "api.startup_config",
        "db.migrations_applied",
        "redis.connected",
        "redis.not_configured",
        "indexnow.configured",
        "import.backup_downloaded",
        "import.backup_loaded",
        "comment.created",
        "comment.updated",
        "comment.deleted",
        "media.upload_url_issued",
        "media.registered",
        "media.upload_proxy_completed",
        "pdf.uploaded",
        "pdf.deleted",
        "post.created",
        "post.updated",
        "post.deleted",
        "post.retranslation_requested",
        "project.order_replaced",
        "series.created",
        "series.updated",
        "series.deleted",
        "series.order_replaced",
        "series.posts_replaced",
        "site_profile.updated",
        "tag.created",
        "tag.updated",
        "tag.deleted",
        "translation.enqueue_failed",
        "translation.enqueue_skipped",
        "translation.enqueue_succeeded",
    ] {
        assert!(
            combined.contains(event),
            "missing operational info log event: {event}"
        );
    }
}

#[test]
fn backend_production_runtime_defaults_emit_json_logs() {
    let env_example = read_repo_file(".env.api.example");
    let dockerfile = read_repo_file("Dockerfile");

    assert!(
        env_example.contains("APP_ENV=production"),
        "api env example should document the production runtime profile"
    );
    assert!(
        env_example.contains("LOG_FORMAT=json"),
        "production api env example should emit machine-parseable JSON logs"
    );
    assert!(
        dockerfile.contains("ENV LOG_FORMAT=json"),
        "api container should default to JSON logs when no env file is mounted"
    );
}

#[test]
fn backend_debug_logs_cover_read_paths_and_background_decisions() {
    let source_files = [
        "src/routes/admin.rs",
        "src/routes/backup.rs",
        "src/routes/comments.rs",
        "src/routes/media.rs",
        "src/routes/pdf.rs",
        "src/routes/posts.rs",
        "src/routes/projects.rs",
        "src/routes/series.rs",
        "src/routes/site_profile.rs",
        "src/routes/tags.rs",
        "src/translation/worker.rs",
        "src/series_projection.rs",
        "src/cleanup.rs",
    ];
    let combined = source_files
        .iter()
        .map(|path| read_repo_file(path))
        .collect::<Vec<_>>()
        .join("\n");

    for event in [
        "post.list_requested",
        "post.list_returned",
        "post.detail_requested",
        "post.detail_returned",
        "post.summary_requested",
        "post.summary_returned",
        "post.redirect_resolved",
        "project.list_requested",
        "project.list_returned",
        "project.detail_requested",
        "project.detail_returned",
        "project.redirect_resolved",
        "series.list_requested",
        "series.list_returned",
        "series.detail_requested",
        "series.detail_returned",
        "series.redirect_resolved",
        "comment.thread_requested",
        "comment.thread_returned",
        "comment.admin_feed_requested",
        "comment.admin_feed_returned",
        "tag.list_requested",
        "tag.list_returned",
        "site_profile.get_requested",
        "site_profile.get_returned",
        "media.upload_url_requested",
        "media.upload_url_returned",
        "media.register_requested",
        "media.register_returned",
        "media.upload_proxy_requested",
        "media.upload_proxy_returned",
        "pdf.status_requested",
        "pdf.status_returned",
        "pdf.download_requested",
        "pdf.download_ready",
        "pdf.upload_requested",
        "pdf.delete_requested",
        "pdf.delete_returned",
        "import.backup_download_requested",
        "import.backup_download_ready",
        "import.backup_load_requested",
        "import.backup_load_returned",
        "admin.revision_requested",
        "admin.revision_returned",
        "translation.job_received",
        "translation.post_skipped",
        "translation.post_upserted",
        "translation.series_skipped",
        "translation.series_upserted",
        "series_projection.refresh_requested",
        "series_projection.rebuild_started",
        "cleanup.expired_drafts_purged",
        "cleanup.orphan_media_scan_completed",
        "cleanup.slug_redirect_scan_completed",
    ] {
        assert!(combined.contains(event), "missing debug log event: {event}");
    }

    for block in combined.split("debug!(").skip(1) {
        let statement = block.split(");").next().unwrap_or(block);
        assert!(
            !statement.contains("body_markdown") && !statement.contains("password ="),
            "debug logs should not include markdown bodies or passwords"
        );
    }
}
