# FastAPI Backend

## Goal

Provide a backend baseline for admin-driven post management and media upload in a single-instance deployment.

## Current Scope

- Runtime: FastAPI (`apps/api`)
- Database: PostgreSQL (`traceoflight-postgres`)
- Object Storage: MinIO (`traceoflight-minio`)
- Orchestration: Docker Compose (`infra/docker/api/docker-compose.yml`)
- Reverse Proxy Target: `traceoflight-api:${API_PORT}` (internal edge network)

## Directory Structure

- `apps/api/src/app`
  - `main.py`: FastAPI app entrypoint and middleware registration
  - `core`: settings and logging
  - `db`: SQLAlchemy base/session
  - `models`: ORM entities (`posts`, `media_assets`)
  - `schemas`: Pydantic request/response models
  - `repositories`: DB access layer
  - `services`: business logic layer
  - `api/v1/endpoints`: route handlers
  - `storage/minio_client.py`: MinIO client wrapper
- `apps/api/alembic`
  - schema migration runtime and initial migration
- `infra/docker/api`
  - compose stack for `api`, `postgres`, `minio`, `minio-init`

## API Baseline

- `GET /api/v1/web-service/health`
- `GET /api/v1/web-service/posts`
- `POST /api/v1/web-service/posts`
- `POST /api/v1/web-service/media/upload-url`
- `POST /api/v1/web-service/media`

## Media Upload Flow

1. Admin client requests upload URL from backend.
2. Backend returns MinIO presigned PUT URL and `object_key`.
3. Client uploads binary directly to MinIO.
4. Client registers metadata to backend.
5. Backend stores metadata in PostgreSQL and links to post.

## Deployment Policy

- Backend CI/CD deploys only API container:
  - `docker compose --env-file .env up -d --build --no-deps api`
- Infra CI/CD manages only stateful services:
  - `postgres`, `minio`, `minio-init`
- Stateful services are intentionally excluded from routine backend rebuilds.

## Network and Security Baseline

- `api` joins external edge network for reverse proxy integration.
- `postgres` and `minio` stay on internal network only.
- Runtime secrets are provided by Jenkins Secret File credential (`traceoflight-api-env`).
- Template env files use placeholder values only.

## Migration and Boot Policy

- API entrypoint waits for PostgreSQL readiness.
- Alembic migrations run at container startup (`alembic upgrade head`).
- MinIO bucket creation is handled by one-shot `minio-init`.

## Next Recommended Steps

1. Add admin authentication and role-based authorization.
2. Add request validation for upload size/type limits.
3. Add backup and recovery runbook for PostgreSQL and MinIO.
4. Add integration tests for post and media lifecycle.
