# SeaORM Big Bang Conversion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert TraceOfLight API runtime database access from `sqlx` to SeaORM in an isolated branch.

**Architecture:** Use SeaORM entities, SeaORM migrations, and `DatabaseConnection` in app state while keeping API DTOs stable. Convert modules one by one, using SeaORM relations/loaders and ActiveModel writes as the default.

**Tech Stack:** Rust 2024, Axum, PostgreSQL, SeaORM, SeaORM migrations, existing integration tests.

---

### Task 1: Add SeaORM Dependency And Entity Skeleton

**Files:**
- Modify: `apps/api/Cargo.toml`
- Create: `apps/api/src/entities/mod.rs`
- Create: `apps/api/src/entities/enums.rs`
- Create one entity file per table in `apps/api/src/entities/`
- Modify: `apps/api/src/lib.rs`

**Steps:**

1. Add `sea-orm` with PostgreSQL, SQLx runtime, chrono, uuid, json, macros features.
2. Define ActiveEnum mappings for existing PostgreSQL enums.
3. Define entities for `posts`, `tags`, `post_tags`, `project_profiles`, `series`, `series_posts`, `post_comments`, redirects, media assets, site profiles, admin credentials.
4. Add `pub mod entities;`.
5. Run `cargo check` and fix entity compile issues.

### Task 2: Switch AppState And Connection Bootstrap

**Files:**
- Modify: `apps/api/src/main.rs`
- Modify: `apps/api/src/lib.rs`
- Modify: `apps/api/src/routes/infra.rs`
- Modify: `apps/api/tests/common/app.rs`

**Steps:**

1. Change runtime connection to SeaORM `DatabaseConnection`.
2. Apply schema through `migration::Migrator`.
3. Update `AppState` and health/readiness code.
4. Adapt test app bootstrap.
5. Run `cargo check`.

### Task 3: Convert Simple Modules

**Files:**
- Modify: `apps/api/src/site_profile.rs`
- Modify: `apps/api/src/tags.rs`
- Modify: `apps/api/src/media.rs`
- Modify: `apps/api/src/admin_auth.rs`

**Steps:**

1. Convert single-table CRUD/read paths to SeaORM entity APIs.
2. Preserve conflict/error mapping.
3. Run focused unit tests and `cargo check`.

### Task 4: Convert Posts And Projects

**Files:**
- Modify: `apps/api/src/posts/queries.rs`
- Modify: `apps/api/src/posts/service.rs`
- Modify: `apps/api/src/projects.rs`

**Steps:**

1. Convert post create/update/delete/retranslation writes.
2. Convert post detail and list reads, using SeaORM relation loaders for tags, comments, project profiles, and series context.
3. Convert project list/detail/order.
4. Run `cargo test --test posts --no-run` and fix compile errors.

### Task 5: Convert Series And Comments

**Files:**
- Modify: `apps/api/src/series.rs`
- Modify: `apps/api/src/series_projection.rs`
- Modify: `apps/api/src/comments.rs`

**Steps:**

1. Convert series CRUD/order/member replacement.
2. Convert projection rebuild using SeaORM transactions.
3. Convert comment thread/admin feed/write paths.
4. Run `cargo check` and relevant integration test compile.

### Task 6: Convert Background And Import Paths

**Files:**
- Modify: `apps/api/src/cleanup.rs`
- Modify: `apps/api/src/imports/codec.rs`
- Modify: `apps/api/src/imports/restore.rs`
- Modify: `apps/api/src/translation/worker.rs`

**Steps:**

1. Convert cleanup queries.
2. Convert backup load/dump and restore writes through SeaORM entities and ActiveModel.
3. Convert translation worker reads/upserts.
4. Run `cargo check`.

### Task 7: Remove Runtime SQLx Dependence

**Files:**
- Modify all remaining `apps/api/src/**/*.rs`
- Modify tests if needed

**Steps:**

1. Search for `sqlx::query`, `PgPool`, `Transaction<'_, Postgres>`.
2. Remove or isolate remaining runtime uses.
3. Decide whether `sqlx` remains only for migration/test support.
4. Run `cargo test --no-run`.

### Task 8: Verify Against Local Restored DB

**Files:**
- No code changes unless failures reveal issues.

**Steps:**

1. Pull current remote dump to local only if Docker Postgres is available.
2. Restore into a local test DB.
3. Run DB-backed integration tests and selected endpoint smoke checks.
4. Run `cargo test --lib`, `cargo test --test schema_guards`, `cargo test --no-run`.
5. Commit final branch state.
