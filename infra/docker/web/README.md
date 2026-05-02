# Web Infra Stack

Runs the `frontend` (Astro SSR) container on the shared edge network.

## Usage

Env values live in `apps/web/.env.web` (kept with the project; this folder holds only the deployment recipe). Bootstrap once at `apps/web/`, then run compose from this folder:

```bash
docker compose --env-file ../../../apps/web/.env.web up -d --build
```

The compose file references `apps/web/.env.web` via a relative `env_file:` path — no env files inside `infra/`.

## Networking

- `frontend` joins `traceoflight-edge` for reverse proxy (Nginx Proxy Manager)
- Astro server-side fetches reach `traceoflight-api` over the same edge network

NPM upstream for Frontend:
- Host: `traceoflight-frontend`
- Port: `PORT` value from `apps/web/.env.web`
- Scheme: `http`
