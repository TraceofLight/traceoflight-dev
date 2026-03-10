# Remove Velog Import Design

**Date:** 2026-03-10

## Goal

Remove the unused Velog snapshot import path so the imports feature only represents the DB-backed backup download and restore workflow that is still in service.

## Context

- The admin imports UI no longer exposes any Velog-specific control.
- The backend and web proxy still carry dormant snapshot paths from the old Velog import flow.
- Those remaining pieces keep obsolete schemas, tests, and docs alive even though the product direction is now DB backup and restore only.

## Options

### 1. Keep the Velog backend path but hide it from the UI

- Pros: least code churn.
- Cons: leaves dead product surface, tests, and docs behind.

### 2. Remove the entire imports snapshot model

- Pros: strongest simplification.
- Cons: requires coordinated cleanup in API, web proxy, tests, and docs.

## Decision

Use option 2.

## Design

### API

- Delete the `/api/v1/imports/snapshots/velog` endpoint.
- Delete the `/api/v1/imports/snapshots/{snapshot_id}/jobs` endpoint.
- Remove snapshot-specific request/response schemas from the imports schema module.
- Delete `ImportService.create_velog_snapshot()` and `ImportService.run_snapshot_import()`.
- Remove the now-unused Velog source/client modules and snapshot archive helpers.

### Web

- Delete the internal proxy route at `apps/web/src/pages/internal-api/imports/snapshots/velog.ts`.
- Delete the internal proxy route at `apps/web/src/pages/internal-api/imports/snapshots/[snapshotId]/jobs.ts`.
- Keep only the backup download/load proxy routes.

### Tests

- Update API tests so imports coverage only checks backup endpoints and the absence of snapshot paths.
- Update web source tests so the shared proxy contract only expects backup proxy files.
- Remove the service tests that only exist to exercise the Velog source and snapshot archive modules.

### Docs

- Rewrite imports contract and architecture docs so they only describe the current backup workflow.
- Remove or trim plan references that describe Velog snapshot creation as an active part of the system.
