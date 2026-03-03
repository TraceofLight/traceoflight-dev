# API Infra Stack

Runs `api + postgres + minio` on one host with isolated networks.

## Usage

```bash
cp .env.example .env
docker compose up -d --build
```

## Networking

- `api` joins `traceoflight-edge` for reverse proxy (Nginx Proxy Manager)
- `postgres` stays on `api_internal` only
- `minio` joins both `api_internal` and `traceoflight-edge` (for `/media/` reverse proxy)

NPM upstream for API:
- Host: `traceoflight-api`
- Port: `API_PORT` value from `infra/docker/api/.env`
- Scheme: `http`
