use std::{fs, path::Path};

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
    assert!(combined.contains("'synced'::post_translation_status"));
    assert!(combined.contains("'machine'::post_translation_source_kind"));
}

#[test]
fn migrations_drop_legacy_alembic_table_and_duplicate_project_profile_index() {
    let migrations_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("migrations");
    let mut combined = String::new();
    for entry in fs::read_dir(&migrations_dir)
        .unwrap_or_else(|err| panic!("read {}: {err}", migrations_dir.display()))
    {
        let path = entry.expect("migration entry").path();
        if path.extension().and_then(|ext| ext.to_str()) == Some("sql") {
            combined.push_str(
                &fs::read_to_string(&path)
                    .unwrap_or_else(|err| panic!("read {}: {err}", path.display())),
            );
            combined.push('\n');
        }
    }

    let normalized = combined.to_lowercase();
    assert!(normalized.contains("drop table if exists public.alembic_version"));
    assert!(normalized.contains("drop index if exists public.ix_project_profiles_post_id"));
}
