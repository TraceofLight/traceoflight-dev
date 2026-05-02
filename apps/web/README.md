# traceoflight-web

Astro frontend for landing, blog, and projects.

## Runtime env

Copy `.env.example` to `.env` when needed.

- `SITE_URL`: public site url
- `GA4_MEASUREMENT_ID`: optional Google Analytics 4 measurement id (example: `G-XXXXXXXXXX`). Used by both the server-side event forwarder (`/internal-api/analytics/event`) and the dashboard summary helper.
- `GA4_API_SECRET`: GA4 Measurement Protocol API secret. Required for server-side page-view forwarding; without it the analytics endpoint silently no-ops.
- `GA4_REPORTS_URL`: optional admin quick-link URL for GA4 dashboard
- `GA4_PROPERTY_ID`: GA4 property id used for server-side visitor summary reads
- `GA4_SERVICE_ACCOUNT_JSON`: GA service account JSON string for Data API access
- `GA4_VISITOR_TOTAL_START_DATE`: optional total counter start date (default: `2025-01-01`)
- `GA4_VISITOR_CACHE_TTL_SECONDS`: optional visitor summary cache TTL in seconds (default: `600`)
- `CONTENT_PROVIDER`: `file` or `db`
- `API_BASE_URL`: backend API base URL (runtime fallback is `http://traceoflight-api:6654/api/v1`)

## Admin Auth

- Login page: `/admin/login`
- Protected pages: `/admin/*`
- Auth APIs: `/internal-api/auth/login`, `/internal-api/auth/refresh`, `/internal-api/auth/logout`
- Auth model: `Access Token + Refresh Token Rotation (RTR)` with `httpOnly` cookies
- Rotation outcomes: `rotated`, `stale`, `reuse_detected`, `invalid`, `expired`
- Password policy: `ADMIN_LOGIN_PASSWORD_HASH` first, `ADMIN_LOGIN_PASSWORD` fallback

## Admin Writer

- Writer page: `/admin/posts/new`
- Milkdown editor + draft/publish submit
- Media upload flow:
  - request presigned upload URL
  - upload file to storage
  - register metadata to backend
  - append markdown snippet into editor

## Commands

| Command | Action |
| :-- | :-- |
| `npm install` | Install dependencies |
| `npm run dev` | Start dev server |
| `npm run build` | Build for production |
| `npm run preview` | Preview build output |
| `npm run format` | Format files with Prettier |
| `npm run format:check` | Check formatting |
