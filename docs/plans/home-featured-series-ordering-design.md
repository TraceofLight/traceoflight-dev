# Home Featured Series Ordering Design

## Goal

Make the home page `Featured Series` section use the same top-of-list ordering as the `/series` archive instead of re-sorting by `updatedAt`.

## Problem

- `/series` already has a canonical order from the backend series list.
- `listFeaturedSeries()` re-sorts by `updatedAt`.
- `index.astro` re-sorts by `updatedAt` again and slices the result.

## Decision

- Treat the `/series` list order as canonical.
- Fetch only the required limit for featured series.
- Remove redundant client-side `updatedAt` sorting from both `listFeaturedSeries()` and the home page.
