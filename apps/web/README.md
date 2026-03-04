# traceoflight-web

Astro frontend for landing, blog, and projects.

## Runtime env

Copy `.env.example` to `.env` when needed.

- `SITE_URL`: public site url
- `GA4_MEASUREMENT_ID`: optional Google Analytics 4 measurement id (example: `G-XXXXXXXXXX`)
- `GA4_REPORTS_URL`: optional admin quick-link URL for GA4 dashboard
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
