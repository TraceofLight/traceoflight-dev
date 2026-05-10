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
