# Rust TDD Setup + CI Test Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pytest-style TDD foundation for the Rust backend (`apps/api/`) using `#[sqlx::test]` against real Postgres, and gate both `Jenkinsfile.backend` and `Jenkinsfile.frontend` on tests passing before build.

**Architecture:** Split `apps/api/` into a `lib` crate (modules + `build_router(state)`) and a thin `bin` crate (bootstrap). Integration tests live in `apps/api/tests/` as a separate crate that imports `traceoflight_api::build_router`. `#[sqlx::test]` clones a template DB per test for parallel-safe isolation. Redis and MinIO use per-test prefix/bucket UUIDs against the same docker-compose services that production uses. CI Jenkinsfiles get one new stage each (`Test Backend` / `Test Frontend`) before the existing build stage.

**Tech Stack:** Rust 2024 edition, axum 0.8, sqlx 0.8 (Postgres) with `#[sqlx::test]` macro, tower 0.5 (`ServiceExt::oneshot`), tokio 1, redis 0.27, rusty-s3 0.7, uuid 1, Jenkins (Groovy declarative), bun + vitest (frontend, already wired). Spec: `docs/plans/rust-tdd-setup-design.md`.

---

## File Map

**`apps/api/` — create:**
- `apps/api/src/lib.rs`
- `apps/api/tests/common/mod.rs`
- `apps/api/tests/common/app.rs`
- `apps/api/tests/common/http.rs`
- `apps/api/tests/common/factories.rs`
- `apps/api/tests/smoke.rs`
- `apps/api/tests/posts.rs`
- `apps/api/scripts/setup-test-db.sh`
- `apps/api/scripts/setup-test-db.ps1`
- `apps/api/.env.test.example`

**`apps/api/` — modify:**
- `apps/api/Cargo.toml` — add `[lib]` + `[[bin]]` + `[dev-dependencies]`.
- `apps/api/src/main.rs` — slim to bootstrap only.
- `apps/api/src/config.rs` — add `redis_key_prefix`.
- `apps/api/src/admin_auth.rs` — `RefreshStore` takes `key_prefix`.
- `apps/api/src/posts.rs` — add `#[cfg(test)] mod tests` block.
- `apps/api/.env.api.example` — document `TEST_DATABASE_URL` and `DATABASE_URL_ADMIN`.

**`infra/jenkins/` — modify:**
- `infra/jenkins/Jenkinsfile.backend` — add `Test Backend` stage.
- `infra/jenkins/Jenkinsfile.frontend` — add `Test Frontend` stage.

---

## Test Conventions

- Unit tests live inside the source file in `#[cfg(test)] mod tests { ... }`. Use only for pure logic with zero external dependencies (slug math, projection, validators).
- Integration tests live in `apps/api/tests/<topic>.rs`. Each `tests/*.rs` file becomes its own test binary; helpers shared across them go in `tests/common/` and are imported with `mod common;`.
- `#[sqlx::test]` reads `DATABASE_URL`, clones the template DB, runs migrations, injects a fresh `PgPool` per test. No transaction-rollback hack, no `tests/conftest`-style global state.
- Run the full suite: `cd apps/api && cargo test --locked`.
- Run a single integration test file: `cargo test --test posts`.
- Run a single test by name: `cargo test --test posts list_posts_returns_empty -- --exact`.
- Tests must be parallel-safe by default (no `--test-threads=1`). Achieve this via per-test UUIDs in Redis key prefixes and MinIO bucket names.

---

## Task 0: Add `redis_key_prefix` setting and `RefreshStore` key prefix

**Goal:** Make Redis key prefix injectable so future integration tests can isolate Redis state per test. Production behavior unchanged (default empty prefix).

**Files:**
- Modify: `apps/api/src/config.rs`
- Modify: `apps/api/src/admin_auth.rs:230-285`
- Modify: `apps/api/src/main.rs:148-158`

**Acceptance Criteria:**
- [ ] `Settings` has `pub redis_key_prefix: String` populated from `REDIS_KEY_PREFIX` env (default `""`)
- [ ] `RefreshStore::new` takes `(conn, key_prefix)`; all key formatters prepend the prefix
- [ ] `cargo build --release` succeeds
- [ ] `cargo run` boots; `curl http://localhost:6655/api/v1/web-service/health` returns `200 ok` (manual)
- [ ] No behavioral change in production: default prefix `""` produces existing `admin:refresh:*` keys

**Verify:** `cd apps/api && cargo build --release 2>&1 | tail -5` → "Finished `release` profile"

**Steps:**

- [ ] **Step 1: Add `redis_key_prefix` field to `Settings`**

In `apps/api/src/config.rs`, add the field to the struct (insert after `pub redis_url: Option<String>,`):

```rust
pub redis_url: Option<String>,
pub redis_key_prefix: String,
pub indexnow: IndexNowSettings,
```

In `Settings::from_env()`, after the `redis_url` block (line 132–135), add:

```rust
let redis_key_prefix = env::var("REDIS_KEY_PREFIX").unwrap_or_default();
```

In the `Ok(Settings { ... })` literal at the bottom, insert `redis_key_prefix,` after `redis_url,`.

- [ ] **Step 2: Parameterize `RefreshStore` keys**

In `apps/api/src/admin_auth.rs`, update the struct (lines 229–232):

```rust
#[derive(Clone)]
pub struct RefreshStore {
    conn: ConnectionManager,
    key_prefix: String,
}
```

Update the impl block (lines 234–285):

```rust
impl RefreshStore {
    pub fn new(conn: ConnectionManager, key_prefix: String) -> Self {
        Self { conn, key_prefix }
    }

    fn state_key(&self, jti: &str) -> String {
        format!("{}admin:refresh:{jti}", self.key_prefix)
    }
    fn family_key(&self, family_id: &str) -> String {
        format!("{}admin:refresh:family:{family_id}:revoked", self.key_prefix)
    }

    pub async fn get_state(&self, jti: &str) -> Result<Option<RefreshState>, AppError> {
        let mut conn = self.conn.clone();
        let raw: Option<String> = conn.get(self.state_key(jti)).await.map_err(redis_to_app)?;
        let Some(raw) = raw else { return Ok(None) };
        let state: RefreshState = serde_json::from_str(&raw)
            .map_err(|err| AppError::Internal(anyhow::anyhow!("invalid refresh state: {err}")))?;
        Ok(Some(state))
    }

    pub async fn set_state(&self, state: &RefreshState) -> Result<(), AppError> {
        let now_seconds = chrono::Utc::now().timestamp();
        let ttl_seconds = (state.expires_at - now_seconds).max(1);
        let json = serde_json::to_string(&state)
            .map_err(|err| AppError::Internal(anyhow::anyhow!("refresh state serialize: {err}")))?;
        let mut conn = self.conn.clone();
        let _: () = conn
            .set_ex(self.state_key(&state.jti), json, ttl_seconds as u64)
            .await
            .map_err(redis_to_app)?;
        Ok(())
    }

    pub async fn revoke_family(&self, family_id: &str, ttl_seconds: i64) -> Result<(), AppError> {
        let mut conn = self.conn.clone();
        let _: () = conn
            .set_ex(self.family_key(family_id), "1", ttl_seconds.max(1) as u64)
            .await
            .map_err(redis_to_app)?;
        Ok(())
    }

    pub async fn is_family_revoked(&self, family_id: &str) -> Result<bool, AppError> {
        let mut conn = self.conn.clone();
        let exists: i64 = conn
            .exists(self.family_key(family_id))
            .await
            .map_err(redis_to_app)?;
        Ok(exists > 0)
    }
}
```

Key changes from current code: the two key formatters take `&self` and prepend `self.key_prefix`; all four call sites use `self.state_key(...)` / `self.family_key(...)` (no longer `Self::...`).

- [ ] **Step 3: Wire prefix through in `main.rs`**

In `apps/api/src/main.rs:155`, change:

```rust
        Some(RefreshStore::new(conn))
```

to:

```rust
        Some(RefreshStore::new(conn, settings.redis_key_prefix.clone()))
```

- [ ] **Step 4: Verify build and runtime**

Run: `cd apps/api && cargo build --release`
Expected: `Finished \`release\` profile`. Warnings about unused fields are OK.

Manual smoke (with docker-compose infra running):
```
cd apps/api && cargo run
# in another terminal:
curl http://localhost:6655/api/v1/web-service/health
# expected: 200 ok
```

- [ ] **Step 5: Commit**

```
git add apps/api/src/config.rs apps/api/src/admin_auth.rs apps/api/src/main.rs
git commit -m "refactor(api): inject redis key prefix into RefreshStore"
```

---

## Task 1: Split `apps/api/` into `lib` + `bin`

**Goal:** Expose `pub fn build_router(state, api_prefix, cors_origins) -> Router` from a library crate so integration tests in `tests/` can build the same router production uses. Production binary remains identical in behavior.

**Files:**
- Modify: `apps/api/Cargo.toml`
- Create: `apps/api/src/lib.rs`
- Modify: `apps/api/src/main.rs` (slim to bootstrap)

**Acceptance Criteria:**
- [ ] `traceoflight_api::build_router(state, api_prefix, cors_origins) -> Router` is the public entry point
- [ ] `traceoflight_api::AppState` is `pub`, all field constructors reachable
- [ ] `apps/api/src/main.rs` is under 100 lines, contains only bootstrap (env load, settings, pool, state assembly, listen)
- [ ] `cargo build --release` succeeds
- [ ] `cargo run` boots and `/api/v1/web-service/health` returns 200 (unchanged behavior)
- [ ] Swagger UI at `/docs` still served (unchanged)

**Verify:** `cd apps/api && cargo build --release 2>&1 | tail -5` → "Finished `release` profile"

**Steps:**

- [ ] **Step 1: Update `Cargo.toml`**

Open `apps/api/Cargo.toml` and add the `[lib]` and `[[bin]]` entries before `[dependencies]`:

```toml
[package]
name = "traceoflight-api"
version = "0.0.1"
edition = "2024"
publish = false

[lib]
name = "traceoflight_api"
path = "src/lib.rs"

[[bin]]
name = "traceoflight-api"
path = "src/main.rs"

[dependencies]
# ... existing dependencies unchanged
```

Note: the `[lib]` name uses underscore (Rust crate name convention); the `[[bin]]` name uses hyphen to keep the existing executable name.

- [ ] **Step 2: Create `apps/api/src/lib.rs`**

Create `apps/api/src/lib.rs` and move into it:
1. All `mod foo;` declarations from `main.rs:1-18`
2. The `use` block from `main.rs:20-92` (preserve verbatim, except remove imports only used by the bootstrap — those stay in `main.rs`)
3. The `AppState` struct + `FromRef<AppState> for AuthContext` impl (`main.rs:94-109`)
4. The `ApiDoc` struct (`main.rs:111-133`)
5. The two probe handlers `health` and `ready` (`main.rs:272-306`)
6. All remaining handler functions and helper structs/enums (`main.rs:308-end`)
7. The `build_cors_layer` and `shutdown_signal` helpers (search for them; they live further down in main.rs)

Add `pub` to:
- `mod foo;` lines that need to be reachable from `main.rs` — easiest: `pub mod admin_auth;` etc. for all 17 modules. (Internal modules can stay non-pub if they aren't used by `main.rs`, but pub keeps refactor simple.)
- `pub struct AppState`
- Every `async fn xxx_handler` (so handlers are reachable from `build_router`)
- Every helper struct/enum used by handlers if not already pub

Then add the public router builder (place near the bottom of `lib.rs`):

```rust
pub fn build_router(state: AppState, api_prefix: &str, cors_origins: &[String]) -> Router {
    let api_routes: OpenApiRouter<AppState> = OpenApiRouter::new()
        .routes(routes!(list_posts_handler, create_post_handler))
        .routes(routes!(list_post_summaries_handler))
        .routes(routes!(resolve_post_redirect_handler))
        .routes(routes!(
            get_post_by_slug_handler,
            update_post_by_slug_handler,
            delete_post_by_slug_handler
        ))
        .routes(routes!(list_tags_handler, create_tag_handler))
        .routes(routes!(update_tag_handler, delete_tag_handler))
        .routes(routes!(list_projects_handler))
        .routes(routes!(replace_project_order_handler))
        .routes(routes!(resolve_project_redirect_handler))
        .routes(routes!(get_project_by_slug_handler))
        .routes(routes!(list_series_handler, create_series_handler))
        .routes(routes!(replace_series_order_handler))
        .routes(routes!(resolve_series_redirect_handler))
        .routes(routes!(
            get_series_by_slug_handler,
            update_series_by_slug_handler,
            delete_series_by_slug_handler
        ))
        .routes(routes!(replace_series_posts_handler))
        .routes(routes!(
            get_site_profile_handler,
            update_site_profile_handler
        ))
        .routes(routes!(
            list_post_comments_handler,
            create_post_comment_handler
        ))
        .routes(routes!(update_comment_handler, delete_comment_handler))
        .routes(routes!(list_admin_comments_handler))
        .routes(routes!(create_upload_url_handler))
        .routes(routes!(register_media_handler))
        .routes(routes!(upload_media_proxy_handler))
        .routes(routes!(admin_login_handler))
        .routes(routes!(admin_refresh_handler))
        .routes(routes!(admin_logout_handler))
        .routes(routes!(admin_get_revision_handler))
        .routes(routes!(admin_update_credentials_handler))
        .routes(routes!(download_posts_backup_handler))
        .routes(routes!(load_posts_backup_handler))
        .routes(routes!(get_portfolio_status_handler))
        .routes(routes!(
            get_portfolio_pdf_handler,
            upload_portfolio_pdf_handler,
            delete_portfolio_pdf_handler
        ))
        .routes(routes!(get_resume_status_handler))
        .routes(routes!(
            get_resume_pdf_handler,
            upload_resume_pdf_handler,
            delete_resume_pdf_handler
        ));

    let api_routes = api_routes.routes(routes!(health)).routes(routes!(ready));

    let (axum_router, openapi) = OpenApiRouter::with_openapi(ApiDoc::openapi())
        .nest(api_prefix, api_routes)
        .split_for_parts();

    let cors = build_cors_layer(cors_origins);

    Router::new()
        .merge(axum_router)
        .merge(SwaggerUi::new("/docs").url("/api-docs/openapi.json", openapi))
        .with_state(state)
        .layer(PropagateRequestIdLayer::new(REQUEST_ID_HEADER.clone()))
        .layer(http_trace_layer())
        .layer(SetRequestIdLayer::new(
            REQUEST_ID_HEADER.clone(),
            UuidRequestId,
        ))
        .layer(cors)
}
```

Note: this is the same router-building code that lives in `main.rs:180-255` today, refactored to take `api_prefix` and `cors_origins` as parameters instead of reading from a captured `settings` variable.

- [ ] **Step 3: Slim `apps/api/src/main.rs` to bootstrap only**

Replace the contents of `apps/api/src/main.rs` with:

```rust
use std::net::SocketAddr;
use std::sync::Arc;

use sqlx::postgres::PgPoolOptions;
use tracing::info;

use traceoflight_api::{
    AdminAuthContext, AppState, AuthContext, CleanupSettings, IndexNowClient, RefreshStore,
    SeriesProjector, Settings, build_router, init_tracing, spawn_draft_cleanup,
    spawn_slug_redirect_cleanup,
};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::from_filename(".env.api");

    let settings = Settings::from_env()?;
    init_tracing(settings.log_format);

    let pool = PgPoolOptions::new()
        .max_connections(settings.database_max_connections)
        .connect_lazy(&settings.database_url)?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    let refresh_store = if let Some(url) = settings.redis_url.as_deref() {
        let client = redis::Client::open(url)
            .map_err(|err| anyhow::anyhow!("redis client init failed: {err}"))?;
        let conn = client
            .get_connection_manager()
            .await
            .map_err(|err| anyhow::anyhow!("redis connect failed: {err}"))?;
        Some(RefreshStore::new(conn, settings.redis_key_prefix.clone()))
    } else {
        None
    };
    let admin_ctx = AdminAuthContext::new(settings.admin.clone(), refresh_store);

    let indexnow = IndexNowClient::new(settings.indexnow.clone());
    let series_projector = SeriesProjector::new();
    series_projector.spawn_loop(pool.clone(), settings.series_projection_debounce_seconds);

    let cleanup_settings = Arc::new(CleanupSettings::from_env());
    let minio_arc = Arc::new(settings.minio.clone());
    spawn_draft_cleanup(pool.clone(), minio_arc.clone(), cleanup_settings.clone());
    spawn_slug_redirect_cleanup(pool.clone(), cleanup_settings.clone());

    let state = AppState {
        pool,
        auth: AuthContext::new(settings.internal_api_secret.clone()),
        reading_words_per_minute: settings.reading_words_per_minute,
        minio: minio_arc.clone(),
        admin: admin_ctx,
        indexnow,
        series_projector,
    };

    let app = build_router(state, &settings.api_prefix, &settings.cors_allow_origins);

    let addr = SocketAddr::from(([0, 0, 0, 0], settings.api_port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    info!(
        port = settings.api_port,
        api_prefix = %settings.api_prefix,
        "api listening on http://{addr}",
    );

    axum::serve(listener, app)
        .with_graceful_shutdown(traceoflight_api::shutdown_signal())
        .await?;

    Ok(())
}
```

Note: imports come from `traceoflight_api::*` rather than `crate::*`. The list of re-exports tells you which items to make `pub` in `lib.rs` (or re-export from lib.rs root via `pub use crate::module::Item;`).

- [ ] **Step 4: Make the lib.rs re-exports work**

For each item the `main.rs` imports from `traceoflight_api::*`, ensure it's reachable. Either:
- The item lives at the crate root in `lib.rs` (e.g., `pub struct AppState` in lib.rs)
- Or add `pub use crate::module::Item;` lines at the top of `lib.rs`

Required `pub use` lines at the top of `lib.rs` (after `mod` declarations):

```rust
pub use crate::admin_auth::{AdminAuthContext, RefreshStore};
pub use crate::auth::AuthContext;
pub use crate::cleanup::{CleanupSettings, spawn_draft_cleanup, spawn_slug_redirect_cleanup};
pub use crate::config::Settings;
pub use crate::indexnow::IndexNowClient;
pub use crate::observability::init_tracing;
pub use crate::series_projection::SeriesProjector;
```

(`AppState` and `build_router` are defined directly at the lib.rs root, so no re-export needed.)

- [ ] **Step 5: Verify build and runtime parity**

```
cd apps/api && cargo build --release 2>&1 | tail -5
```
Expected: `Finished \`release\` profile`. Address any compilation errors:
- Missing `pub` on a handler or helper → add it
- Module path errors (`crate::foo` vs `crate::foo::Bar`) → adjust use paths
- `routes!` not in scope in lib.rs → add `use utoipa_axum::{router::OpenApiRouter, routes};`

Manual runtime verification (with docker-compose infra running):
```
cd apps/api && cargo run
# in another terminal:
curl http://localhost:6655/api/v1/web-service/health
# expected: 200 ok
curl http://localhost:6655/docs
# expected: 200 with Swagger UI HTML
```

- [ ] **Step 6: Commit**

```
git add apps/api/Cargo.toml apps/api/src/lib.rs apps/api/src/main.rs
git commit -m "refactor(api): split into lib + bin, expose build_router for tests"
```

---

## Task 2: Test infrastructure (`tests/common/`) + smoke test

**Goal:** Establish the integration test scaffolding (`spawn_test_app`, HTTP helpers) and prove it works end-to-end with a single smoke test that hits the health endpoint.

**Files:**
- Modify: `apps/api/Cargo.toml` — add `[dev-dependencies]`
- Create: `apps/api/tests/common/mod.rs`
- Create: `apps/api/tests/common/app.rs`
- Create: `apps/api/tests/common/http.rs`
- Create: `apps/api/tests/smoke.rs`
- Create: `apps/api/scripts/setup-test-db.sh`
- Create: `apps/api/scripts/setup-test-db.ps1`
- Create: `apps/api/.env.test.example`

**Acceptance Criteria:**
- [ ] `setup-test-db.sh` (and `.ps1`) creates a `traceoflight_test` template DB and applies migrations; idempotent
- [ ] `apps/api/.env.test.example` documents every env var integration tests need
- [ ] `tests/common::spawn_test_app(pool).await` returns a `TestApp` with router + per-test redis prefix + per-test bucket name
- [ ] `tests/smoke.rs` defines one test that calls `GET /api/v1/web-service/health` via `oneshot` and asserts 200 + body `"ok"`
- [ ] `cargo test --test smoke` passes (with infra running and DATABASE_URL set)

**Verify:** `cd apps/api && DATABASE_URL=$TEST_DATABASE_URL cargo test --test smoke -- --nocapture` → `1 passed`

**Steps:**

- [ ] **Step 1: Add `[dev-dependencies]` to `Cargo.toml`**

Append to `apps/api/Cargo.toml` (after the existing `[dependencies]` block, before `[profile.release]`):

```toml
[dev-dependencies]
http-body-util = "0.1"
mime = "0.3"
tower = { version = "0.5", features = ["util"] }
```

Note: `tower::util::ServiceExt::oneshot` is what powers our HTTP test helpers. `http-body-util` is needed to collect response bodies. `mime` is convenience for content-type headers.

- [ ] **Step 2: Create `setup-test-db.sh`**

Create `apps/api/scripts/setup-test-db.sh` (`chmod +x` it):

```bash
#!/usr/bin/env bash
# Idempotent: creates the test template DB and applies migrations.
# Honors DATABASE_URL_ADMIN (superuser-equivalent for CREATE DATABASE) and
# TEST_DATABASE_URL (pointer the test runner uses).
set -euo pipefail

ADMIN_URL="${DATABASE_URL_ADMIN:-${DATABASE_URL:-}}"
TEST_URL="${TEST_DATABASE_URL:-}"

if [ -z "$ADMIN_URL" ]; then
  echo "ERROR: DATABASE_URL_ADMIN or DATABASE_URL must be set." >&2
  exit 1
fi
if [ -z "$TEST_URL" ]; then
  echo "ERROR: TEST_DATABASE_URL must be set (e.g., postgres://traceoflight:pw@localhost:5432/traceoflight_test)." >&2
  exit 1
fi

# Extract the DB name from TEST_URL (everything after the final slash, ignoring query string).
TEST_DB="$(echo "$TEST_URL" | sed -E 's#.*/([^/?]+).*#\1#')"

# psql is invoked against the admin URL; we connect to the postgres maintenance DB
# to issue CREATE DATABASE if needed.
ADMIN_BASE="${ADMIN_URL%/*}/postgres"

if ! psql "$ADMIN_BASE" -tAc "SELECT 1 FROM pg_database WHERE datname='$TEST_DB'" | grep -q 1; then
  echo "Creating database $TEST_DB..."
  psql "$ADMIN_BASE" -c "CREATE DATABASE \"$TEST_DB\""
else
  echo "Database $TEST_DB already exists, skipping creation."
fi

# Apply migrations using sqlx-cli if available, else psql -f.
if command -v sqlx >/dev/null 2>&1; then
  DATABASE_URL="$TEST_URL" sqlx migrate run --source apps/api/migrations
else
  echo "sqlx-cli not found; applying migrations via psql."
  for f in apps/api/migrations/*.sql; do
    psql "$TEST_URL" -f "$f"
  done
fi

echo "Test DB ready: $TEST_URL"
```

- [ ] **Step 3: Create `setup-test-db.ps1`**

Create `apps/api/scripts/setup-test-db.ps1`:

```powershell
# Idempotent: creates the test template DB and applies migrations on Windows.
# Honors $env:DATABASE_URL_ADMIN (superuser-equivalent) and $env:TEST_DATABASE_URL.
$ErrorActionPreference = "Stop"

$AdminUrl = if ($env:DATABASE_URL_ADMIN) { $env:DATABASE_URL_ADMIN } else { $env:DATABASE_URL }
$TestUrl  = $env:TEST_DATABASE_URL

if (-not $AdminUrl) { throw "DATABASE_URL_ADMIN or DATABASE_URL must be set." }
if (-not $TestUrl)  { throw "TEST_DATABASE_URL must be set." }

$TestDb = ($TestUrl -replace '.*/([^/?]+).*', '$1')
$AdminBase = ($AdminUrl -replace '/[^/]+$', '/postgres')

$exists = (& psql $AdminBase -tAc "SELECT 1 FROM pg_database WHERE datname='$TestDb'") -join ""
if ($exists.Trim() -ne "1") {
    Write-Host "Creating database $TestDb..."
    & psql $AdminBase -c "CREATE DATABASE `"$TestDb`""
} else {
    Write-Host "Database $TestDb already exists, skipping creation."
}

if (Get-Command sqlx -ErrorAction SilentlyContinue) {
    $env:DATABASE_URL = $TestUrl
    & sqlx migrate run --source apps/api/migrations
} else {
    Write-Host "sqlx-cli not found; applying migrations via psql."
    Get-ChildItem apps/api/migrations/*.sql | ForEach-Object {
        & psql $TestUrl -f $_.FullName
    }
}

Write-Host "Test DB ready: $TestUrl"
```

- [ ] **Step 4: Create `.env.test.example`**

Create `apps/api/.env.test.example`:

```
# Connection string the test runner uses. Tests via #[sqlx::test] will clone
# this DB as a template into _sqlx_test_<uuid> per test.
DATABASE_URL=postgres://traceoflight:change-this-password@localhost:5432/traceoflight_test
TEST_DATABASE_URL=postgres://traceoflight:change-this-password@localhost:5432/traceoflight_test

# Admin connection used by setup-test-db.sh to CREATE DATABASE. Same user as
# DATABASE_URL works if it has CREATEDB privilege.
DATABASE_URL_ADMIN=postgres://traceoflight:change-this-password@localhost:5432/postgres

# Redis (real instance from docker-compose). Tests append per-test UUID prefix
# so parallel runs don't collide.
REDIS_URL=redis://localhost:6379

# MinIO (real instance from docker-compose). Each test gets its own bucket
# name; bucket creation is deferred to tests that actually upload objects
# (out of scope for the initial test suite).
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=traceoflight
MINIO_SECRET_KEY=change-this-minio-password
MINIO_REGION=us-east-1
MINIO_SECURE=false
MINIO_PRESIGNED_EXPIRE_SECONDS=900

# Admin auth — values can be dummy for tests since they're not validated against
# a real session unless a test exercises admin endpoints.
ADMIN_LOGIN_ID=test-admin
ADMIN_LOGIN_PASSWORD=test-password
ADMIN_LOGIN_PASSWORD_HASH=
ADMIN_SESSION_SECRET=test-session-secret-please-change
ADMIN_ACCESS_TOKEN_MAX_AGE_SECONDS=900
ADMIN_REFRESH_TOKEN_MAX_AGE_SECONDS=1209600

# Internal API secret — used by handlers that bypass public-only filters.
INTERNAL_API_SECRET=test-internal-secret

API_PORT=6655
API_PREFIX=/api/v1/web-service
```

- [ ] **Step 5: Create `tests/common/mod.rs`**

Create `apps/api/tests/common/mod.rs`:

```rust
// Shared helpers for integration tests. Each `tests/<topic>.rs` file imports
// this with `mod common;` (this is the cargo convention — files inside
// `tests/common/` are not auto-built as their own test binary).

#![allow(dead_code)] // helpers may be unused in some test files

pub mod app;
pub mod http;
```

- [ ] **Step 6: Create `tests/common/app.rs`**

Create `apps/api/tests/common/app.rs`:

```rust
use std::sync::Arc;

use axum::Router;
use sqlx::PgPool;
use uuid::Uuid;

use traceoflight_api::{
    AdminAuthContext, AppState, AuthContext, IndexNowClient, RefreshStore, SeriesProjector,
    Settings, build_router,
};

/// A test-scoped axum app. Holds references to the per-test isolation knobs
/// (redis prefix, MinIO bucket name) so tests can assert on them or inject
/// into MinIO bucket-creation helpers later.
pub struct TestApp {
    pub router: Router,
    pub pool: PgPool,
    pub redis_prefix: String,
    pub s3_bucket: String,
    pub api_prefix: String,
}

/// Build a TestApp from a fresh `PgPool` (provided by `#[sqlx::test]`).
///
/// Reads other settings from `.env.test` if present, otherwise from process
/// env. Each call generates fresh UUIDs for redis prefix and bucket so that
/// parallel tests cannot interfere with each other.
pub async fn spawn_test_app(pool: PgPool) -> TestApp {
    // Load .env.test (no-op if file is missing — env may be set by CI directly)
    let _ = dotenvy::from_filename(".env.test");

    let mut settings = Settings::from_env().expect("Settings::from_env (test)");
    let redis_prefix = format!("test:{}:", Uuid::new_v4());
    let s3_bucket = format!("test-{}", Uuid::new_v4());
    settings.redis_key_prefix = redis_prefix.clone();
    settings.minio.bucket = s3_bucket.clone();

    let refresh_store = if let Some(url) = settings.redis_url.as_deref() {
        let client = redis::Client::open(url).expect("redis client open (test)");
        let conn = client
            .get_connection_manager()
            .await
            .expect("redis connect (test)");
        Some(RefreshStore::new(conn, settings.redis_key_prefix.clone()))
    } else {
        None
    };

    let admin_ctx = AdminAuthContext::new(settings.admin.clone(), refresh_store);
    let indexnow = IndexNowClient::new(settings.indexnow.clone());
    let series_projector = SeriesProjector::new();
    // NOTE: not spawning the projector loop in tests — projection is invoked
    // explicitly by tests that exercise series ordering.

    let state = AppState {
        pool: pool.clone(),
        auth: AuthContext::new(settings.internal_api_secret.clone()),
        reading_words_per_minute: settings.reading_words_per_minute,
        minio: Arc::new(settings.minio.clone()),
        admin: admin_ctx,
        indexnow,
        series_projector,
    };

    let router = build_router(state, &settings.api_prefix, &settings.cors_allow_origins);

    TestApp {
        router,
        pool,
        redis_prefix,
        s3_bucket,
        api_prefix: settings.api_prefix,
    }
}
```

- [ ] **Step 7: Create `tests/common/http.rs`**

Create `apps/api/tests/common/http.rs`:

```rust
use axum::{
    Router,
    body::{Body, Bytes},
    http::{Request, Response, StatusCode},
};
use http_body_util::BodyExt;
use serde::Serialize;
use serde_json::Value;
use tower::ServiceExt;

use super::app::TestApp;

impl TestApp {
    pub fn url(&self, path: &str) -> String {
        format!("{}{}", self.api_prefix, path)
    }

    /// Send a request through the router via `oneshot` (no listener).
    pub async fn send(&self, req: Request<Body>) -> Response<Body> {
        self.router
            .clone()
            .oneshot(req)
            .await
            .expect("oneshot")
    }

    pub async fn get(&self, path: &str) -> Response<Body> {
        let req = Request::builder()
            .uri(self.url(path))
            .method("GET")
            .body(Body::empty())
            .expect("build request");
        self.send(req).await
    }

    pub async fn post_json(&self, path: &str, body: impl Serialize) -> Response<Body> {
        let json = serde_json::to_vec(&body).expect("serialize json");
        let req = Request::builder()
            .uri(self.url(path))
            .method("POST")
            .header("content-type", "application/json")
            .body(Body::from(json))
            .expect("build request");
        self.send(req).await
    }

    pub async fn delete(&self, path: &str) -> Response<Body> {
        let req = Request::builder()
            .uri(self.url(path))
            .method("DELETE")
            .body(Body::empty())
            .expect("build request");
        self.send(req).await
    }
}

/// Drain a response body into raw bytes.
pub async fn body_bytes(res: Response<Body>) -> (StatusCode, Bytes) {
    let status = res.status();
    let bytes = res
        .into_body()
        .collect()
        .await
        .expect("collect body")
        .to_bytes();
    (status, bytes)
}

/// Drain a response body and parse as JSON.
pub async fn body_json(res: Response<Body>) -> (StatusCode, Value) {
    let (status, bytes) = body_bytes(res).await;
    let value: Value =
        serde_json::from_slice(&bytes).unwrap_or_else(|err| panic!("body not JSON: {err}; raw={:?}", bytes));
    (status, value)
}
```

- [ ] **Step 8: Create `tests/smoke.rs`**

Create `apps/api/tests/smoke.rs`:

```rust
mod common;

use sqlx::PgPool;

use common::{
    app::spawn_test_app,
    http::body_bytes,
};

#[sqlx::test(migrations = "./migrations")]
async fn health_endpoint_returns_ok(pool: PgPool) {
    let app = spawn_test_app(pool).await;
    let res = app.get("/health").await;
    let (status, body) = body_bytes(res).await;
    assert_eq!(status, 200);
    assert_eq!(&body[..], b"ok");
}
```

Note on the `migrations` arg: `#[sqlx::test]` looks for migrations relative to the manifest dir (`apps/api/`), and `./migrations` is the same path the production `sqlx::migrate!()` macro uses. This makes each cloned test DB ready for handlers that touch real tables.

- [ ] **Step 9: Run `setup-test-db.sh` and verify smoke test**

Prerequisite: docker-compose infra running, `apps/api/.env.test` populated from `.env.test.example`.

```
cd apps/api
cp .env.test.example .env.test  # then edit values to match local creds
bash scripts/setup-test-db.sh
DATABASE_URL=postgres://traceoflight:<pw>@localhost:5432/traceoflight_test cargo test --test smoke
```

Expected output: `running 1 test ... test health_endpoint_returns_ok ... ok`. `1 passed`.

- [ ] **Step 10: Commit**

```
git add apps/api/Cargo.toml \
        apps/api/tests/common/mod.rs apps/api/tests/common/app.rs apps/api/tests/common/http.rs \
        apps/api/tests/smoke.rs \
        apps/api/scripts/setup-test-db.sh apps/api/scripts/setup-test-db.ps1 \
        apps/api/.env.test.example
git commit -m "test(api): scaffold integration tests with sqlx::test + smoke test"
```

---

## Task 3: Posts vertical slice — integration tests + one unit test

**Goal:** Validate the integration test pattern by writing four integration tests against the real `posts` endpoints, plus a small unit test inside `posts.rs` for pure logic. This locks the pattern that the rest of the codebase will follow.

**Files:**
- Create: `apps/api/tests/common/factories.rs`
- Create: `apps/api/tests/posts.rs`
- Modify: `apps/api/tests/common/mod.rs` (add `pub mod factories;`)
- Modify: `apps/api/src/posts.rs` (add `#[cfg(test)] mod tests` at end)

**Acceptance Criteria:**
- [ ] `PostFactory` builder supports `.title()`, `.locale()`, `.status()`, `.visibility()`, `.create(&pool) -> PostRead`
- [ ] `tests/posts.rs` has 4 integration tests covering: empty list, create→fetch round-trip, slug collision returns 409, draft hidden from public list
- [ ] `posts.rs` gains one `#[cfg(test)] mod tests` block with at least one pure-logic unit test
- [ ] `cargo test` (full run, with `DATABASE_URL` set and infra up) passes — both unit and integration

**Verify:** `cd apps/api && cargo test 2>&1 | tail -10` → `test result: ok. 9+ passed; 0 failed` (4 unit in `posts::tests`, 1 smoke, 4 integration in posts).

**Steps:**

- [ ] **Step 1: Add `#[cfg(test)] mod tests` block exercising `normalize_tag_slug`**

`normalize_tag_slug` (`apps/api/src/posts.rs:558`) is a pure string transform — ideal first unit test. Its contract: trim, lowercase, underscores/whitespace → dashes, drop non-alphanumerics, collapse multi-dash, strip surrounding dashes.

At the end of `apps/api/src/posts.rs`, append:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_tag_slug_lowercases_and_dashes_whitespace() {
        assert_eq!(normalize_tag_slug("Rust Lang"), "rust-lang");
    }

    #[test]
    fn normalize_tag_slug_collapses_multi_dash_and_strips_edges() {
        assert_eq!(normalize_tag_slug("--Rust__Lang  "), "rust-lang");
    }

    #[test]
    fn normalize_tag_slug_drops_non_alphanumerics() {
        assert_eq!(normalize_tag_slug("C# / .NET"), "c-net");
    }

    #[test]
    fn normalize_tag_slug_handles_empty_and_only_punctuation() {
        assert_eq!(normalize_tag_slug(""), "");
        assert_eq!(normalize_tag_slug("---"), "");
    }
}
```

- [ ] **Step 2: Run the unit tests, confirm green**

```
cd apps/api && cargo test --lib posts::tests
```

Expected: `test result: ok. 4 passed`. If any case fails, the assertion is wrong (read the actual function and adjust the expectation — these tests document the existing contract; we are not changing behavior).

- [ ] **Step 3: Create `tests/common/factories.rs`**

The `posts` schema (per `apps/api/migrations/20260507000000_initial_schema.sql`) requires several NOT NULL columns the factory must populate: `body_markdown`, `top_media_kind`, `content_kind`, `locale`, `translation_group_id`, `translation_status`, `translation_source_kind`. The Postgres enum values are: `top_media_kind` ∈ {image, youtube, video}; `translation_status` ∈ {source, synced, stale, failed}; `translation_source_kind` ∈ {manual, machine}. Defaults below satisfy these.

Note: `PostRead` is an aggregated read shape (includes `tags: Vec<TagRead>`, `comment_count`, etc.) that does not map cleanly from a single `RETURNING` row. The factory therefore returns a small `CreatedPost` struct with only the fields tests need.

Create `apps/api/tests/common/factories.rs`:

```rust
use sqlx::PgPool;
use uuid::Uuid;

use traceoflight_api::posts::{
    PostContentKind, PostLocale, PostStatus, PostTopMediaKind, PostVisibility,
};

/// Minimal post identity returned by `PostFactory::create`.
pub struct CreatedPost {
    pub id: Uuid,
    pub slug: String,
    pub title: String,
}

/// Builder for inserting a post directly into the database, bypassing the
/// HTTP layer. Used to set up state for tests that exercise read endpoints.
pub struct PostFactory {
    title: String,
    slug: Option<String>,
    locale: PostLocale,
    status: PostStatus,
    visibility: PostVisibility,
    content_kind: PostContentKind,
    top_media_kind: PostTopMediaKind,
    body_markdown: String,
}

impl Default for PostFactory {
    fn default() -> Self {
        Self {
            title: format!("Test Post {}", Uuid::new_v4()),
            slug: None,
            locale: PostLocale::Ko,
            status: PostStatus::Published,
            visibility: PostVisibility::Public,
            content_kind: PostContentKind::Blog,
            top_media_kind: PostTopMediaKind::Image,
            body_markdown: String::new(),
        }
    }
}

impl PostFactory {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn title(mut self, v: impl Into<String>) -> Self {
        self.title = v.into();
        self
    }

    pub fn slug(mut self, v: impl Into<String>) -> Self {
        self.slug = Some(v.into());
        self
    }

    pub fn locale(mut self, v: PostLocale) -> Self {
        self.locale = v;
        self
    }

    pub fn draft(mut self) -> Self {
        self.status = PostStatus::Draft;
        self
    }

    pub fn private(mut self) -> Self {
        self.visibility = PostVisibility::Private;
        self
    }

    pub fn body(mut self, v: impl Into<String>) -> Self {
        self.body_markdown = v.into();
        self
    }

    /// Insert directly into `posts`. Skips business-logic hooks
    /// (reading-time, slug-redirect bookkeeping); callers needing those
    /// must drive the production endpoint instead.
    pub async fn create(self, pool: &PgPool) -> CreatedPost {
        let id = Uuid::new_v4();
        let translation_group_id = Uuid::new_v4();
        let derived_slug = self
            .slug
            .clone()
            .unwrap_or_else(|| slug_from_title(&self.title));

        sqlx::query(
            r#"
            INSERT INTO posts (
                id, slug, title, body_markdown,
                status, visibility, content_kind, top_media_kind, locale,
                translation_group_id, translation_status, translation_source_kind,
                published_at, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4,
                $5, $6, $7, $8, $9,
                $10, 'source'::public.post_translation_status,
                'manual'::public.post_translation_source_kind,
                NOW(), NOW(), NOW()
            )
            "#,
        )
        .bind(id)
        .bind(&derived_slug)
        .bind(&self.title)
        .bind(&self.body_markdown)
        .bind(self.status)
        .bind(self.visibility)
        .bind(self.content_kind)
        .bind(self.top_media_kind)
        .bind(self.locale)
        .bind(translation_group_id)
        .execute(pool)
        .await
        .expect("PostFactory::create insert");

        CreatedPost {
            id,
            slug: derived_slug,
            title: self.title,
        }
    }
}

fn slug_from_title(title: &str) -> String {
    let mut out = String::with_capacity(title.len());
    let mut last_dash = false;
    for c in title.trim().to_lowercase().chars() {
        if c.is_alphanumeric() {
            out.push(c);
            last_dash = false;
        } else if !last_dash {
            out.push('-');
            last_dash = true;
        }
    }
    out.trim_matches('-').to_string()
}
```

This requires `posts::PostTopMediaKind` to be reachable as `traceoflight_api::posts::PostTopMediaKind`. Confirm in Step 2 of Task 1 that `pub mod posts;` was added (and that `PostTopMediaKind` is `pub` in `posts.rs` — it already is). If lint fails on unused fields like `private()`, leave the `#![allow(dead_code)]` already present in `tests/common/mod.rs` to absorb it.

- [ ] **Step 4: Register factories in `tests/common/mod.rs`**

Update `apps/api/tests/common/mod.rs`:

```rust
#![allow(dead_code)]

pub mod app;
pub mod factories;
pub mod http;
```

- [ ] **Step 5: Write the four integration tests (red)**

Create `apps/api/tests/posts.rs`:

```rust
mod common;

use sqlx::PgPool;

use common::{
    app::spawn_test_app,
    factories::PostFactory,
    http::body_json,
};

#[sqlx::test(migrations = "./migrations")]
async fn list_posts_returns_empty_when_db_is_empty(pool: PgPool) {
    let app = spawn_test_app(pool).await;
    let res = app.get("/posts").await;
    let (status, body) = body_json(res).await;
    assert_eq!(status, 200);
    let arr = body.as_array().expect("posts list is JSON array");
    assert!(arr.is_empty(), "expected empty array, got {arr:?}");
}

#[sqlx::test(migrations = "./migrations")]
async fn get_post_by_slug_returns_seeded_row(pool: PgPool) {
    let app = spawn_test_app(pool).await;
    let seeded = PostFactory::new()
        .title("Hello World")
        .slug("hello-world")
        .create(&app.pool)
        .await;

    let res = app.get(&format!("/posts/{}", seeded.slug)).await;
    let (status, body) = body_json(res).await;
    assert_eq!(status, 200);
    assert_eq!(body["slug"].as_str(), Some("hello-world"));
    assert_eq!(body["title"].as_str(), Some("Hello World"));
}

#[sqlx::test(migrations = "./migrations")]
async fn create_post_with_existing_slug_returns_409(pool: PgPool) {
    let app = spawn_test_app(pool).await;
    PostFactory::new()
        .title("Original")
        .slug("collision")
        .create(&app.pool)
        .await;

    // create_post is internal-secret-gated, so we use the helper that injects
    // the X-Internal-API-Secret header (added in Step 6 below).
    let payload = serde_json::json!({
        "title": "Duplicate",
        "slug": "collision",
        "body_markdown": ""
    });
    let res = app.post_json_with_internal_secret("/posts", &payload).await;
    let (status, _body) = body_json(res).await;
    assert_eq!(status, 409);
}

#[sqlx::test(migrations = "./migrations")]
async fn list_posts_hides_drafts_from_public_callers(pool: PgPool) {
    let app = spawn_test_app(pool).await;
    PostFactory::new()
        .title("Public Post")
        .slug("public-post")
        .create(&app.pool)
        .await;
    PostFactory::new()
        .title("Hidden Draft")
        .slug("hidden-draft")
        .draft()
        .create(&app.pool)
        .await;

    // Public caller — no internal secret header.
    let res = app.get("/posts").await;
    let (status, body) = body_json(res).await;
    assert_eq!(status, 200);
    let slugs: Vec<&str> = body
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v["slug"].as_str().unwrap())
        .collect();
    assert!(slugs.contains(&"public-post"));
    assert!(
        !slugs.contains(&"hidden-draft"),
        "draft leaked to public list: {slugs:?}"
    );
}
```

- [ ] **Step 6: Add `post_json_with_internal_secret` helper to `tests/common/http.rs`**

Append to `apps/api/tests/common/http.rs` inside the `impl TestApp` block:

```rust
    pub async fn post_json_with_internal_secret(
        &self,
        path: &str,
        body: impl Serialize,
    ) -> Response<Body> {
        let json = serde_json::to_vec(&body).expect("serialize json");
        let req = Request::builder()
            .uri(self.url(path))
            .method("POST")
            .header("content-type", "application/json")
            .header(
                traceoflight_api::auth::INTERNAL_SECRET_HEADER,
                &self.internal_api_secret,
            )
            .body(Body::from(json))
            .expect("build request");
        self.send(req).await
    }
```

The header name comes from `traceoflight_api::auth::INTERNAL_SECRET_HEADER` (= `"x-internal-api-secret"`, defined in `apps/api/src/auth.rs:10`); this couples the test to the same constant production uses.

`TestApp` must expose the internal secret. Update `apps/api/tests/common/app.rs`:

```rust
pub struct TestApp {
    pub router: Router,
    pub pool: PgPool,
    pub redis_prefix: String,
    pub s3_bucket: String,
    pub api_prefix: String,
    pub internal_api_secret: String,
}
```

And in `spawn_test_app`, before returning, populate it:

```rust
    TestApp {
        router,
        pool,
        redis_prefix,
        s3_bucket,
        api_prefix: settings.api_prefix,
        internal_api_secret: settings.internal_api_secret,
    }
```

For the constant import to work, `auth` must be `pub mod auth;` in `lib.rs` (Task 1, Step 2 added this). If a follow-up renames the module, the import here breaks at compile time — that's the desired coupling.

- [ ] **Step 7: Run the integration tests, see them fail or pass appropriately**

```
cd apps/api && cargo test --test posts 2>&1 | tail -20
```

Expected outcomes — investigate any test that fails with something other than the documented expectation:
- `list_posts_returns_empty_when_db_is_empty` → should pass on first run (uses `/posts` which exists).
- `get_post_by_slug_returns_seeded_row` → should pass with the factory in Step 3. If it fails on a sqlx type-encoding error for one of the enum binds, check that `posts` enum types (`PostStatus`, `PostVisibility`, `PostContentKind`, `PostTopMediaKind`, `PostLocale`) all derive `sqlx::Type` with `#[sqlx(type_name = "...")]` matching the migration enum names; they should already, but a regression here would surface as `mismatched types`.
- `create_post_with_existing_slug_returns_409` → may fail if the production handler returns a different status (e.g., 400 or 422). Read `apps/api/src/posts.rs` for `create_post` and update either the handler (TDD-real) or the test (acknowledge actual behavior).
- `list_posts_hides_drafts_from_public_callers` → should pass if `effective_visibility` filters drafts for non-trusted callers.

Iterate until all pass:
```
cd apps/api && cargo test --test posts -- --nocapture
```

- [ ] **Step 8: Run the full suite to confirm nothing else regressed**

```
cd apps/api && cargo test
```

Expected: `test result: ok. 9+ passed; 0 failed`. (4 unit in `posts::tests`, 1 smoke, 4 integration in posts.)

- [ ] **Step 9: Commit**

```
git add apps/api/tests/common/mod.rs apps/api/tests/common/app.rs \
        apps/api/tests/common/http.rs apps/api/tests/common/factories.rs \
        apps/api/tests/posts.rs apps/api/src/posts.rs
git commit -m "test(api): posts vertical slice — 4 integration + 4 unit tests"
```

---

## Task 4: Add `Test Backend` stage to `Jenkinsfile.backend`

**Goal:** Block backend deploys when `cargo test` fails. The new stage runs after infra is verified and before the image build.

**Files:**
- Modify: `infra/jenkins/Jenkinsfile.backend`
- Modify: `apps/api/.env.api.example` (document new keys)

**Acceptance Criteria:**
- [ ] New `Test Backend` stage between `Verify Infra Running` and `Build Backend Image`
- [ ] Stage runs `setup-test-db.sh` then `cargo test --locked`
- [ ] If tests fail, the build halts before `Build Backend Image`
- [ ] Stage uses `TEST_DATABASE_URL` and `DATABASE_URL_ADMIN` from `apps/api/.env.api` (already populated by `Prepare Backend Env` from the `traceoflight-api-env` credential)
- [ ] `apps/api/.env.api.example` documents both new keys
- [ ] No existing stage is removed or reordered

**Verify:** Visual diff review; `git diff infra/jenkins/Jenkinsfile.backend apps/api/.env.api.example` shows only the new stage and the new env-key documentation. Functional verification happens on first push to a feature branch (out-of-band).

**Steps:**

- [ ] **Step 1: Document the new env keys in `apps/api/.env.api.example`**

`infra/jenkins/README.md` already states that `traceoflight-api-env` follows the schema in `apps/api/.env.api.example` (line ~27 of the README). So the canonical place to document new keys is the example file.

Append to `apps/api/.env.api.example`:

```
# --- Integration test connectivity (used by Jenkins Test Backend stage) ---
# Connection string for the test template DB. Each test clones this DB
# into _sqlx_test_<uuid> for parallel-safe isolation.
TEST_DATABASE_URL=

# Admin connection for setup-test-db.sh to issue CREATE DATABASE.
# Same user as DATABASE_URL works if it has CREATEDB privilege.
DATABASE_URL_ADMIN=
```

The Jenkins operator must regenerate `apps/api/.env.api.jenkins` with these keys populated; that is an out-of-band step performed before the new `Test Backend` stage runs successfully.

- [ ] **Step 2: Insert the `Test Backend` stage in `Jenkinsfile.backend`**

Open `infra/jenkins/Jenkinsfile.backend`. After the `Verify Infra Running` stage (closing brace at line ~66) and before `Build Backend Image` (opens at line ~68), insert:

```groovy
    stage('Test Backend') {
      steps {
        sh '''
          cd apps/api

          # Sanity check required env vars from .env.api
          for key in TEST_DATABASE_URL DATABASE_URL_ADMIN; do
            if ! grep -Eq "^${key}=.+" .env.api; then
              echo "ERROR: ${key} is missing in apps/api/.env.api (required for tests)"
              exit 1
            fi
          done

          # Export the test-related env vars from .env.api (only those we need
          # for the test run; .env.api is already validated by Prepare stage).
          export TEST_DATABASE_URL="$(grep -E '^TEST_DATABASE_URL=' .env.api | head -n1 | cut -d'=' -f2-)"
          export DATABASE_URL_ADMIN="$(grep -E '^DATABASE_URL_ADMIN=' .env.api | head -n1 | cut -d'=' -f2-)"
          export DATABASE_URL="$TEST_DATABASE_URL"

          bash scripts/setup-test-db.sh

          cargo test --locked
        '''
      }
    }
```

- [ ] **Step 3: Visual diff verify**

```
git diff infra/jenkins/Jenkinsfile.backend
```

Confirm the diff shows only the new stage inserted at the correct position. Confirm no other stages were modified.

- [ ] **Step 4: Commit**

```
git add infra/jenkins/Jenkinsfile.backend apps/api/.env.api.example
git commit -m "ci(backend): gate deploy on cargo test passing"
```

---

## Task 5: Add `Test Frontend` stage to `Jenkinsfile.frontend`

**Goal:** Block frontend deploys when `bun run test` (which runs typecheck + node:test guards + vitest UI + node:test admin-auth) fails.

**Files:**
- Modify: `infra/jenkins/Jenkinsfile.frontend`

**Acceptance Criteria:**
- [ ] New `Test Frontend` stage between `Prepare Frontend Env` and `Build Frontend Image`
- [ ] Stage runs `bun install --frozen-lockfile` then `bun run test`
- [ ] If tests fail, the build halts before image build
- [ ] No existing stage is removed or reordered

**Verify:** Visual diff review; `git diff infra/jenkins/Jenkinsfile.frontend` shows only the inserted `Test Frontend` stage.

**Steps:**

- [ ] **Step 1: Insert the `Test Frontend` stage in `Jenkinsfile.frontend`**

Open `infra/jenkins/Jenkinsfile.frontend`. After `Prepare Frontend Env` (closes around line 34) and before `Build Frontend Image` (opens around line 36), insert:

```groovy
    stage('Test Frontend') {
      steps {
        dir('apps/web') {
          sh '''
            bun install --frozen-lockfile
            bun run test
          '''
        }
      }
    }
```

`bun run test` (defined in `apps/web/package.json`) chains:
1. `bun run typecheck` (`astro check`)
2. `bun run test:guards` (node:test on `tests/**/*.test.mjs`)
3. `bun run test:ui` (vitest on `tests/ui`)
4. `bun run test:auth` (node:test + tsx on `tests/admin-auth/**/*.test.ts`)

If any of those fail, the script exits non-zero and Jenkins halts the pipeline.

- [ ] **Step 2: Visual diff verify**

```
git diff infra/jenkins/Jenkinsfile.frontend
```

Confirm only the stage insertion changed.

- [ ] **Step 3: Commit**

```
git add infra/jenkins/Jenkinsfile.frontend
git commit -m "ci(frontend): gate deploy on bun run test passing"
```

---

## Self-Review Notes

- Spec section 1 (lib+bin) → Task 1.
- Spec section 2 (Redis prefix) → Task 0.
- Spec section 3 (test infrastructure) → Tasks 2 and 3.
- Spec section 4 (isolation/cleanup) → Task 2 (per-test UUIDs in spawn_test_app); cleanup-not-done is implicit.
- Spec section 5 (test runtime env) → Task 2 (.env.test.example, setup-test-db scripts).
- Spec section 6 (sequencing) → Task ordering (0 → 1 → 2 → 3 → 4; Task 5 parallel).
- Spec section 7 (Jenkinsfile changes) → Tasks 4 and 5.
- Out-of-scope items in spec are also out of scope here (no MinIO bucket auto-creation, no testcontainers, no coverage tooling).

---

## Prerequisites for the Implementer

- Local: docker-compose stack from `infra/docker/infra/` running. `cargo`, `psql`, ideally `sqlx-cli`. Ability to copy `.env.test.example` to `.env.test` with valid creds.
- CI: Jenkins agents must have `cargo`/`rustc` (for backend) and `bun` (for frontend) installed before Tasks 4 and 5 take effect on the next run. If missing, that's a separate operator setup; this plan does not install them.
- The `traceoflight` Postgres user must have `CREATEDB` privilege (verified by `setup-test-db.sh` failing fast on the first run if not).
