# Admin Post Backup Save/Load Architecture

## Goal

Provide an admin-only backup workflow for the current DB-backed blog:

1. Download a self-contained ZIP of posts, internal media, and series cover overrides.
2. Restore that ZIP through a dedicated admin screen at `/admin/imports`.
3. Keep imports scoped to DB backup save/load only.

## Admin Ownership

- Footer keeps the login entry only.
- Backup management UI now lives in `apps/web/src/pages/admin/imports.astro`.
- The interactive panel lives in `apps/web/src/components/public/AdminImportsPanel.tsx`.

## ZIP Contents

```text
manifest.json
media-manifest.json
series_overrides.json
posts/<slug>/meta.json
posts/<slug>/content.md
media/<object-key>
```

Included data:

- post metadata and markdown
- internal media binaries referenced by post cover or markdown
- series cover overrides keyed by `series_title`

## Save Flow

1. Read posts from DB.
2. Collect referenced internal media object keys from:
   - `cover_image_url`
   - markdown `/media/...` links
   - series cover overrides
3. Read binary payloads from object storage.
4. Build ZIP via `app.services.imports.backup_archive`.
5. Return ZIP through `GET /api/v1/imports/backups/posts.zip`.

## Load Flow

1. Parse and validate the uploaded ZIP via `app.services.imports.backup_archive`.
2. Stage media payloads under `imports/backups/staging/...`.
3. Promote staged payloads back to their target object keys.
4. Replace `posts` and `media_assets` in one explicit DB transaction through `BackupRestoreCoordinator`.
5. Rebuild series projection.
6. Reapply `series_overrides.json` cover images.
7. Clean up staged objects in `finally`.

## Safety Rules

- Invalid ZIP: no DB clear
- Media staging failure: no DB clear
- DB failure during replace transaction: rollback leaves existing posts intact
- staged media objects are cleaned up even on failure

## Current Limits

- Restore is still full replacement, not merge.
- If final media promotion fails after staging, the restore aborts before DB replacement.
- Series rows are rebuilt from restored posts rather than backed up as first-class entities.
- Snapshot and external-source import flows are no longer part of the supported architecture.
