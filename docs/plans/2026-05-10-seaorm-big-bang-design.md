# SeaORM Big Bang Conversion Design

## Goal

Replace the API runtime data layer from direct `sqlx` query calls to SeaORM entities, repositories, migrations, and `DatabaseConnection`, while preserving existing endpoint behavior.

## Scope

This is a big-bang branch-only conversion. The branch may keep `sqlx` only where it remains the least risky support tool for migration/test bootstrap during the first pass, but runtime CRUD/read paths should use SeaORM APIs. SeaORM raw `Statement` is reserved for query shapes that are not naturally represented as object relations or ActiveModel writes.

In scope:

- Add SeaORM dependencies and entity modules for all existing public tables.
- Change `AppState.pool` from `sqlx::PgPool` to `sea_orm::DatabaseConnection`.
- Convert runtime modules: posts, projects, series, comments, tags, media, site profile, admin auth, imports, cleanup, translation worker, and health checks.
- Move schema source-of-truth to SeaORM migrations.
- Preserve current API response shapes, error semantics, and tests.

Out of scope for the first branch:

- Redesigning the database schema.
- Solving the series projection normalization problem.

## Architecture

SeaORM entities live under `apps/api/src/entities/`, one module per table plus a shared enum module for ActiveEnum mappings. Existing DTOs remain in their current modules so the public API shape stays stable. Each domain module owns its repository-style functions and maps SeaORM models into existing DTOs.

Complex queries should prefer SeaORM query builder when it stays readable. Object graph loading should be expressed through `Related<T>` declarations and `LoaderTrait` (`load_one`, `load_many`) so anti-N+1 batching remains visible as ORM relationships instead of manual bulk join helpers. Backup/restore should use entities and `ActiveModel` writes because it is table-shaped data movement. SeaORM raw `Statement` is still acceptable for aggregate facets or dynamic filters where the SQL itself is the clearest representation.

## Testing

Existing unit and integration tests are the behavior contract. Add compile-time guard tests for the entity layer and run integration tests through the same SeaORM migrator used by the app. Before declaring the branch usable, run:

- `cargo test --lib`
- `cargo test --test schema_guards`
- `cargo test --no-run`
- DB-backed integration tests when local Docker Postgres is available

## Risks

- SeaORM enum mapping must match PostgreSQL enum names exactly.
- Raw SQL parameter binding differs from `sqlx`; central helpers should keep this mechanical.
- Transaction APIs differ and can make a big-bang compile pass noisy.
- Import/restore and translation worker touch many tables and are the highest-risk write paths.
