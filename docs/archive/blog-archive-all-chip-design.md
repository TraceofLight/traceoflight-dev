# Blog Archive All Chip Design

## Goal

Keep the blog archive `전체` chip aligned with the absolute archive total while making its active state reflect whether no tag or search filter is currently narrowing the list.

## Problem

- The archive summary line and `전체` chip both reuse filtered response metadata.
- When a tag is selected, the total number changes even though the user reads it as an absolute total.
- When a search query is entered, `전체` still appears active even though the visible results are no longer the unconstrained archive.

## Decision

- Treat `전체 (N)` as the absolute archive total for the current viewer scope.
- Keep that count stable after tag and search changes.
- Mark `전체` active only when visibility is `all` and there is no selected tag and no search query.

## Scope

- Blog archive filter island state and rendering
- Blog archive filter regression tests
