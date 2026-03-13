# Blog Visibility Counts Design

## Goal

Make the blog archive visibility chips use the same backend-wide count basis as the total post count, even when the archive uses paged lazy loading.

## Problem

- `전체` uses backend `totalCount`.
- `공개` and `비공개` currently count only the posts loaded into the client so far.
- With paged loading, the first screen can show `전체 (77)` and `공개 (24)` at the same time.

## Decision

- Add backend-provided `visibilityCounts` metadata to summary responses.
- Compute those counts with the current query/tag/content filters applied, but without the current visibility filter applied.
- Render all three visibility chips from backend metadata.

## Scope

- API summary schema and repository aggregation
- Web summary parsing and blog archive initial props
- Blog archive filters UI rendering and regression tests
