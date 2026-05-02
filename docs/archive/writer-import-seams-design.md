# Writer And Import Seams Design

**Date:** 2026-03-10

## Goal

Refactor the remaining large orchestration modules without changing behavior:
- `apps/web/src/lib/admin/new-post-page.ts`
- `apps/api/src/app/services/import_service.py`

The immediate objective is to move independently testable concerns out of these files while keeping the public entrypoints stable.

## Current Pain Points

- `new-post-page.ts` still owns page bootstrap, state mutation, draft loading, upload flows, drag/drop wiring, preview refresh, and modal control in one file.
- `import_service.py` still mixes backup orchestration with archive and restore details.
- Existing tests already guard the current behavior, but they are forced to inspect the top-level files because the seams are not explicit enough.

## Options Considered

### 1. Keep entrypoints stable and extract coordinators/adapters

- Web: keep `initNewPostAdminPage()` as the public bootstrap and move loader/media logic into helper modules.
- API: keep `ImportService` as the public service and move backup archive/restore helpers into import submodules.
- Pros: lowest-risk refactor, easiest to test incrementally, no route/schema churn.
- Cons: top-level files still remain orchestration-heavy, just smaller.

### 2. Replace the entrypoints with new controller classes

- Web: introduce a `WriterPageController`.
- API: introduce an `ImportBackupService` plus a separate restore/archive coordinator layer.
- Pros: stronger structure long-term.
- Cons: more code movement, higher regression risk, unnecessary for the current scope.

### 3. Only do cosmetic file splits

- Move helpers mechanically without clarifying boundaries.
- Pros: fastest.
- Cons: low value, does not improve testability or reasoning.

## Decision

Use option 1.

### Web

- Keep `initNewPostAdminPage()` as the entrypoint.
- Extract two explicit seams first:
  - loader/query logic
  - media upload and drag/drop binding
- Leave submit flow and editor bridge wiring where they are for now.

### API

- Keep `ImportService` as the service entrypoint.
- Extract:
  - backup archive helpers
  - restore coordination seams
- Keep snapshot zip and backup restore flows where they already live.

## Testing Strategy

- Update source-structure tests first so they fail for the expected reason.
- Add direct module tests for the extracted backup/archive components.
- Keep existing API/web behavior tests green.

## Expected Outcome

- `new-post-page.ts` becomes a narrower bootstrap/orchestration layer.
- `import_service.py` becomes a narrower backup application service instead of also owning archive details.
- Future refactors can continue from explicit seams instead of reopening the same files.
