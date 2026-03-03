# traceoflight-web

Astro frontend for landing, blog, and projects.

## Admin Auth

- Login page: `/admin/login`
- Protected pages: `/admin/*`
- Auth APIs: `/internal-api/auth/login`, `/internal-api/auth/refresh`, `/internal-api/auth/logout`
- Auth model: `Access Token + Refresh Token Rotation (RTR)` with `httpOnly` cookies
- Required env vars are documented in `.env.example`

## Commands

| Command | Action |
| :-- | :-- |
| `npm install` | Install dependencies |
| `npm run dev` | Start dev server |
| `npm run build` | Build for production |
| `npm run preview` | Preview build output |
| `npm run format` | Format files with Prettier |
| `npm run format:check` | Check formatting |
