# Admin Velog One-Time Migration Architecture

## Goal

Provide a two-stage, admin-driven migration flow for Velog content:

1. Create and store a reusable snapshot package (ZIP + manifest).
2. Run `dry_run` or `apply` import jobs from that snapshot without recrawling Velog.

This reduces repeated load on external servers and makes rollback/rebuild scenarios operationally safe.

## Scope

In scope:

- Snapshot creation from Velog username.
- Snapshot upload path from existing ZIP package.
- Snapshot reuse across multiple import attempts.
- Post import with media internalization and markdown URL rewrite.
- Idempotent rerun behavior and per-item failure reporting.

Out of scope (v1):

- Live or scheduled synchronization.
- Cross-platform comment/reaction migration.
- Delete propagation back to source platform.

## Current Baseline

- Posts can already be created and updated via internal API.
- Tags and visibility are already part of post model and admin UX.
- Media storage and registration already exist.
- Admin auth and internal API guards are already enforced in frontend and backend.

## Key Decisions

### 1) Strict Two-Stage Workflow

- Stage A: `snapshot` creation only (crawl/upload + package + persist).
- Stage B: `import job` execution only (read snapshot + validate + write).
- Import jobs do not call Velog directly.

### 2) Snapshot Is the Source of Truth for Migration Runs

- A snapshot artifact is immutable after creation.
- Re-import after failure or full reset always reuses stored snapshot.
- Admin can rerun `dry_run` and `apply` on the same snapshot.

### 3) Shared Importer Core

- Both sources produce the same packaged format:
  - Velog crawler output.
  - Uploaded ZIP snapshot.
- Import executor reads this unified snapshot format only.

### 4) Media Must Be Internalized

- Imported markdown and cover URLs are rewritten to internal media URLs.
- External media URLs are downloaded, validated, and stored internally.

### 5) Idempotent Upsert by Source Identity

- Source mapping key: `(source_provider, external_post_id)`.
- Rerun updates mapped posts and avoids duplicate inserts.

### 6) Deterministic Apply Order

- Snapshot items are applied oldest to newest.
- Ties are resolved deterministically by external post id.

## Domain and Persistence Additions

### New Tables

- `import_snapshots`
  - `id` UUID PK
  - `source_provider` (`velog`, `zip`)
  - `source_identity` (Velog username or upload label)
  - `status` (`queued`, `collecting`, `packaging`, `ready`, `failed`)
  - `artifact_bucket`
  - `artifact_object_key`
  - `artifact_checksum`
  - `total_items`
  - `error_summary`
  - `created_at`, `updated_at`

- `import_snapshot_items`
  - `id` UUID PK
  - `snapshot_id` FK -> `import_snapshots.id`
  - `order_index`
  - `external_post_id`
  - `external_slug`
  - `title`
  - `status` (`ready`, `invalid`, `failed`)
  - `error_detail`
  - `created_at`, `updated_at`

- `import_jobs`
  - `id` UUID PK
  - `snapshot_id` FK -> `import_snapshots.id`
  - `mode` (`dry_run`, `apply`)
  - `status` (`queued`, `running`, `succeeded`, `partially_failed`, `failed`)
  - `total_items`, `success_items`, `failed_items`
  - `started_at`, `finished_at`
  - `error_summary`
  - `created_at`, `updated_at`

- `import_job_items`
  - `id` UUID PK
  - `job_id` FK -> `import_jobs.id`
  - `order_index`
  - `external_post_id`
  - `external_slug`
  - `resolved_slug`
  - `status` (`pending`, `succeeded`, `failed`, `skipped`)
  - `error_detail`
  - `created_at`, `updated_at`

- `post_source_mappings`
  - `id` UUID PK
  - `source_provider`
  - `external_post_id`
  - `external_slug`
  - `post_id` FK -> `posts.id`
  - unique (`source_provider`, `external_post_id`)
  - `created_at`, `updated_at`

## Two-Stage Pipeline

### Stage A: Snapshot Creation

1. Trigger snapshot creation from:
   - Velog username crawler, or
   - uploaded ZIP package.
2. Normalize source content into canonical bundle items.
   - Preserve `series_title` when the source provides series metadata.
3. Validate and order items.
4. Package into ZIP artifact with manifest.
5. Store artifact in object storage.
6. Persist snapshot summary and item metadata.

### Stage B: Import from Snapshot

1. Admin selects a `snapshot_id`.
2. Run import job in `dry_run` or `apply`.
3. Import executor reads snapshot artifact only.
4. For each item:
   - validate fields,
   - process media internalization,
   - rewrite markdown and cover URLs,
   - upsert post via source mapping.
5. Persist per-item and job-level results.

## Backend API Design

All mutating endpoints require trusted internal secret guard.

### Snapshot Endpoints

- `POST /api/v1/imports/snapshots/velog`
  - body: `{ username }`
  - creates snapshot job from Velog crawl.

- `POST /api/v1/imports/snapshots/zip`
  - multipart: `file` (zip)
  - validates and stores uploaded snapshot.

- `GET /api/v1/imports/snapshots/{snapshot_id}`
  - returns snapshot summary/status.

- `GET /api/v1/imports/snapshots/{snapshot_id}/items`
  - returns paged snapshot item metadata.

- `GET /api/v1/imports/snapshots/{snapshot_id}/download`
  - returns download URL or proxied stream for snapshot artifact.

### Import Endpoints

- `POST /api/v1/imports/snapshots/{snapshot_id}/jobs`
  - body: `{ mode }`
  - creates import job from existing snapshot.

- `GET /api/v1/imports/jobs/{job_id}`
  - returns import job summary/status.

- `GET /api/v1/imports/jobs/{job_id}/items`
  - returns paged item-level import result list.

## Frontend Design

### Admin Migration Console (`/admin/imports/velog`)

Step 1: Snapshot

- Create snapshot by Velog username.
- Upload snapshot ZIP.
- Show snapshot list and readiness status.

Step 2: Import

- Select snapshot.
- Run `dry_run` then `apply`.
- Poll job status and inspect failed items.

### Internal API Proxy

- Add proxy routes mirroring backend snapshot/import endpoints.
- Preserve current proxy behavior:
  - status and body passthrough,
  - `503` with `backend unavailable` on backend failure.

## Error Handling

Snapshot-level failures:

- invalid username,
- crawler fetch failures,
- malformed ZIP,
- artifact storage failures.

Import item failures:

- invalid content schema,
- media download/validation failure,
- slug conflict fallback exhaustion,
- post write failure.

Rules:

- Item failure does not abort whole import job.
- Snapshot stage and import stage each record separate status and error summaries.

## Security and Safety

- Admin-only endpoint access through middleware + internal secret.
- ZIP validation must block path traversal, symlink abuse, and zip bombs.
- External downloads must enforce timeout, size cap, MIME allowlist, and retry limit.
- Snapshot artifacts should be protected by signed URLs or proxied download authorization.

## Observability

- Structured logs include:
  - `snapshot_id`, `job_id`, `external_post_id`, `stage`.
- Snapshot and job tables provide durable audit trail.
- Admin UI surfaces recent failures and rerun actions from stored snapshot.

## Risks and Mitigations

- Risk: Velog contract changes.
  - Mitigation: isolate crawler adapter; snapshot stage fails fast with explicit reason.
- Risk: repeated external crawl pressure.
  - Mitigation: snapshot reuse; import stage never recrawls.
- Risk: storage growth from snapshot artifacts.
  - Mitigation: retention policy and optional manual cleanup after migration signoff.
- Risk: duplicate posts on rerun.
  - Mitigation: source mapping unique key and deterministic upsert logic.
