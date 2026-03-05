# Series Feature Architecture (Unified FE/BE)

## Goal

Implement a full series system that groups related posts into ordered learning flows, with public discovery routes and admin management capabilities.

## Unified Architecture

### Core Domain

- `series` (metadata)
- `series_posts` (ordered mapping from series to posts)
- `series_context` projection on post detail

v1 rule:

- one post belongs to at most one series (`unique(post_id)` in mapping table).

### Public Experience

- `/series`:
  - card list, count/updated metadata.
- `/about`:
  - redirected alias to `/series` (about page reused).
- `/series/[slug]`:
  - hero + ordered table-of-contents + start button.
- `/blog/[...slug]`:
  - optional in-series navigation block (prev/next).

### Admin Experience

- `/admin/series`: list and delete.
- `/admin/series/new`: create.
- `/admin/series/[slug]/edit`: update metadata + reorder/assign posts.

### API Surface

- Backend:
  - `GET /api/v1/series`
  - `GET /api/v1/series/{slug}`
  - `POST /api/v1/series`
  - `PUT /api/v1/series/{slug}`
  - `DELETE /api/v1/series/{slug}`
  - `PUT /api/v1/series/{slug}/posts`
- Frontend internal proxy:
  - `/internal-api/series*` mirrors backend methods.

## Contract Sync Points

Lock before implementation:

1. slug ownership:
   - path slug is identity key for update/delete.
2. reorder payload:
   - explicit ordered post slug list with stable shape.
3. error semantics:
   - `401` unauthorized,
   - `404` not found,
   - `409` duplicate slug/order conflict,
   - `400` validation errors.
4. visibility behavior:
   - public responses filter non-visible posts.

## Parallel Delivery Model

1. FE and BE tracks are defined independently in this unified contract before coding.
2. FE and BE implementation can run in parallel after contract freeze.
3. One dedicated integration session resolves API mismatch/awkwardness.
4. Final pass validates both stacks together before merge.

## Integration Session (Required)

Session objective:

- remove FE/BE API awkwardness in one place before completion.

Checklist:

- query parameter names/types,
- payload field casing and nullability,
- no-body response handling (`204`),
- ordering semantics (`order_index`),
- not-found and conflict message shape.

## Risks and Mitigations

- Risk: FE assumes richer data than BE returns.
  - Mitigation: contract fixture examples + integration session tests.
- Risk: reorder conflicts from concurrent edits.
  - Mitigation: transactional reorder and conflict response.
- Risk: public series page leaks private posts.
  - Mitigation: enforce visibility filter in series reader queries.
