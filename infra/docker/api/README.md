# API Infra Stack

Runs `api + postgres + minio` on one host with isolated networks.

## Usage

Env values live in `apps/api/.env.api` (kept with the project; this folder holds only the deployment recipe). Bootstrap once at `apps/api/`, then run compose from this folder:

```bash
docker compose --env-file ../../../apps/api/.env.api up -d --build
```

The compose file references `apps/api/.env.api` via a relative `env_file:` path — no env files inside `infra/`.

## Networking

- `api` joins `traceoflight-edge` for reverse proxy (Nginx Proxy Manager)
- `postgres` stays on `api_internal` only
- `minio` joins both `api_internal` and `traceoflight-edge` (for `/media/` reverse proxy)

NPM upstream for API:
- Host: `traceoflight-api`
- Port: `API_PORT` value from `apps/api/.env.api`
- Scheme: `http`
