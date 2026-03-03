# Frontend Writer (Admin + RTR Auth)

## Goal

Document the current frontend writer implementation that is shipped in this commit:

- Admin authentication with `Access Token + Refresh Token Rotation (RTR)`
- Protected admin routes and internal API routing
- Writer UI with Milkdown editor
- Media upload + registration flow

## Scope

- Target app: `apps/web` (Astro server runtime)
- Included:
  - `/admin` pages
  - `/internal-api/auth/*` endpoints
  - `/internal-api/posts*` and `/internal-api/media/*` proxy endpoints
  - auth middleware and token/cookie logic
  - writer client module
- Excluded:
  - FastAPI backend JWT/session implementation
  - persistent token store (current refresh store is in-memory)

## Route Map

- Admin pages:
  - `/admin/login`
  - `/admin`
  - `/admin/posts/new`
- Internal APIs:
  - `POST /internal-api/auth/login`
  - `POST /internal-api/auth/refresh`
  - `POST /internal-api/auth/logout`
  - `GET|POST /internal-api/posts`
  - `GET /internal-api/posts/[slug]`
  - `POST /internal-api/media/upload-url`
  - `POST /internal-api/media/register`

## Directory Structure

- `apps/web/src/middleware.ts`
  - Protects `/admin*` and `/internal-api*` except `/admin/login` and `/internal-api/auth/*`.
  - Verifies access cookie first, then attempts refresh rotation.
- `apps/web/src/lib/admin-auth-core.ts`
  - Core token issue/verify/rotate/revoke logic.
  - Refresh token store and family state management.
- `apps/web/src/lib/admin-auth.ts`
  - Env-driven config and cookie helpers.
  - Password verification policy and adapter over auth core.
- `apps/web/src/lib/admin-redirect.ts`
  - Login `next` path sanitizer.
- `apps/web/src/pages/internal-api/auth/*`
  - Login/refresh/logout handlers for cookie-based admin session.
- `apps/web/src/pages/internal-api/posts*`, `media/*`
  - Pass-through proxy from frontend runtime to backend API.
- `apps/web/src/pages/admin/*`
  - Login/dashboard/writer pages.
- `apps/web/src/lib/admin/new-post-page.ts`
  - Client-side writer behavior (editor init, submit, media upload).

## Auth Model

### Token Pair

- Access token:
  - Short-lived (`ADMIN_ACCESS_TOKEN_MAX_AGE_SECONDS`, default 900)
  - Cookie: `traceoflight_admin_access`
- Refresh token:
  - Long-lived (`ADMIN_REFRESH_TOKEN_MAX_AGE_SECONDS`, default 1209600)
  - Cookie: `traceoflight_admin_refresh`

Both cookies are:

- `httpOnly`
- `sameSite=lax`
- `path=/`
- `secure` on production/https

### Rotation Outcomes

`rotateRefreshToken` returns one of:

- `rotated`: refresh is valid and replaced with new token pair
- `stale`: old parent refresh token was reused after successful rotation race
- `reuse_detected`: replay/tamper detected -> revoke token family
- `invalid`: malformed or unknown token
- `expired`: refresh expired

### Middleware Behavior

For protected routes:

1. Valid access cookie: allow request.
2. Invalid/missing access + refresh present:
   - `rotated`: set new cookies and allow.
   - `reuse_detected` / `invalid` / `expired`: clear cookies and block.
   - `stale`: block without clearing current cookies.
3. Block behavior:
   - `/internal-api*` -> `401 { detail: "Unauthorized" }`
   - `/admin*` -> redirect to `/admin/login?next=...`

### Redirect Safety

`sanitizeNextPath` applies on `/admin/login`:

- Reject absolute/protocol-relative URLs.
- Reject `/internal-api*` target.
- Fallback to `/admin`.

## Credential Policy

Configured by env vars:

- `ADMIN_LOGIN_ID`
- `ADMIN_LOGIN_PASSWORD_HASH` (preferred)
- `ADMIN_LOGIN_PASSWORD` (fallback for migration)
- `ADMIN_SESSION_SECRET`

Password verification order:

1. `ADMIN_LOGIN_PASSWORD_HASH` if present
2. Fallback `ADMIN_LOGIN_PASSWORD`

Supported hash formats:

- `argon2` (via `@node-rs/argon2`)
- `sha256:<hex>` (legacy/simple fallback)

## Writer Flow

Writer page: `/admin/posts/new`

1. Initialize Milkdown (`@milkdown/crepe`) editor.
2. Auto-generate slug from title until slug is manually edited.
3. On save:
   - Build payload (`slug`, `title`, `excerpt`, `body_markdown`, `cover_image_url`, `status`, `published_at`)
   - `POST /internal-api/posts`
4. On media upload:
   - `POST /internal-api/media/upload-url`
   - Upload binary to returned presigned URL (`PUT`)
   - `POST /internal-api/media/register`
   - Insert markdown snippet into editor:
     - image: `![name](url)`
     - video: `<video controls src="..."></video>`
     - file: `[name](url)`

## Backend Proxy Contract

Internal API routes delegate to backend through `requestBackend()`:

- base URL from `API_BASE_URL`
- fallback: `http://traceoflight-api:6654/api/v1`
- `cache: no-store` default

This keeps browser clients from directly coupling to backend host/port.

## Environment Baseline

`apps/web/.env.example`:

- `SITE_URL`
- `ADMIN_LOGIN_ID`
- `ADMIN_LOGIN_PASSWORD_HASH`
- `ADMIN_LOGIN_PASSWORD` (fallback only)
- `ADMIN_SESSION_SECRET`
- `ADMIN_ACCESS_TOKEN_MAX_AGE_SECONDS`
- `ADMIN_REFRESH_TOKEN_MAX_AGE_SECONDS`

`apps/web/docker-compose.yml` additionally sets:

- `CONTENT_PROVIDER=db`
- `API_BASE_URL=http://traceoflight-api:6654/api/v1`

## Tests and Verification

- Guard tests: `tests/**/*.test.mjs`
- Auth behavior tests: `tests/admin-auth/**/*.test.ts`

Run from `apps/web`:

- `npm test`
- `npm run build`

## Known Constraints

1. Refresh state store is in-memory, so admin sessions are reset on process restart.
2. Multi-instance deployment needs shared store (for example Redis) for token family state.
3. Auth endpoints currently do not include rate-limit or lockout policy.
4. CSRF defense is currently based on `sameSite=lax`; if cross-site requirements change, add explicit CSRF tokens.
