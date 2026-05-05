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
  - `POST /internal-api/media/upload-proxy`

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
   - Upload binary:
     - direct `PUT` to presigned URL (default)
     - fallback `POST /internal-api/media/upload-proxy` when presigned URL is not browser-safe (for example mixed-content `http://` on `https://` page)
       - browser sends raw binary body with `x-upload-url`/`x-upload-content-type` headers
       - avoids Astro form-origin check conflicts from `multipart/form-data` behind reverse proxy
   - `POST /internal-api/media/register`
   - Insert markdown snippet into editor:
     - image: `![name](url)`
     - video: `<video controls src="..."></video>`
     - file: `[name](url)`

## Writer UX Hardening

1. Global drag-and-drop overlay was added to reduce editor-specific drop event misses.
2. Cover URL normalization:
   - Google redirect links (`google.com/url?...`) are converted to original source URL.
   - On HTTPS page, HTTP cover URL is upgraded to HTTPS when possible.
3. Cover preview error handling:
   - Invalid/mixed-content/broken image now hides preview image and reports feedback instead of showing broken alt text.
4. Markdown link normalization before preview/render/save:
   - removes accidental whitespace/newline breaks inside markdown URL segment
   - normalizes URL protocol/redirect where possible.

## Backend Proxy Contract

Internal API routes delegate to backend through `requestBackend()`:

- base URL from `API_BASE_URL`
- fallback: `http://traceoflight-api:6654/api/v1/web-service`
- `cache: no-store` default

This keeps browser clients from directly coupling to backend host/port.

## Environment Baseline

`apps/web/.env.web.example` (template; copy to `apps/web/.env.web` for both local dev and the compose deployment stack):

- `SITE_URL`
- `PORT`
- `API_BASE_URL` (default `http://traceoflight-api:6654/api/v1/web-service`)
- `ADMIN_LOGIN_ID`
- `ADMIN_LOGIN_PASSWORD_HASH`
- `ADMIN_LOGIN_PASSWORD` (fallback only)
- `ADMIN_SESSION_SECRET`
- `ADMIN_ACCESS_TOKEN_MAX_AGE_SECONDS`
- `ADMIN_REFRESH_TOKEN_MAX_AGE_SECONDS`
- `INTERNAL_API_SECRET`

`infra/docker/web/docker-compose.yml` reads `apps/web/.env.web` via a relative `env_file: ../../../apps/web/.env.web` plus an explicit `environment:` block for keys consumed by the Astro container at runtime. No env files live inside `infra/`.

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

## UX Benchmark (Velog + Cruz Lab)

### Sources

- `velog-client` (`src/components/write/*`, `src/containers/write/*`)
- `cruz-lab` (`src/pages/admin/posts/new.astro`, `src/components/editor/*`)

### What Velog Does Well

1. Writer is a dedicated workspace page, not a generic site page.
2. Desktop keeps a fixed 2-pane composition:
   - left: editing + meta controls
   - right: live preview
3. Bottom/top actions are explicit and always reachable:
   - draft save
   - publish
   - exit/back
4. Upload entry is close to writing flow, not hidden in deep settings.

### What Cruz Lab Adds

1. Modernized Milkdown-based editing stack with rich plugin extension.
2. Practical UX around media:
   - drag and drop
   - upload progress and feedback
3. Theming and ergonomic helper controls for editor-only context.

### Decision for TraceofLight

Keep current Astro + Crepe stack but align writer UX to Velog mental model:

1. Dedicated full-screen writer layout (`AdminWriterLayout`) without public header/footer.
2. 2-pane editor/preview workspace on desktop.
3. Responsive collapse to 1-column at smaller widths.
4. Upload UX simplified to:
   - top action upload button
   - drag/drop in editor
   - clipboard paste upload
5. Real-time preview rendering from current markdown content.

## Applied Changes (Current Implementation)

1. Page structure:
   - `/admin/posts/new` migrated from card-form style to workspace style.
2. Layout:
   - Added `src/layouts/AdminWriterLayout.astro`.
3. Writer client module:
   - `src/lib/admin/new-post-page.ts` now handles:
     - live preview rendering
     - submitter-aware draft/publish action
     - upload button + drag/drop + paste upload
4. Styling:
   - `src/styles/components.css` includes `writer-*` namespace styles for split layout and responsive behavior.
5. Verification:
   - Writer structure tests updated (`tests/admin-writer-page.test.mjs`) for split layout and upload trigger.
