# FastAPI Media Backend

## Goal

Provide a production-ready backend baseline for single-instance deployment:

- API: FastAPI
- Database: PostgreSQL
- Object Storage: MinIO

## Current Structure

- `apps/api`: backend application code
- `infra/docker/api`: runtime stack (`api`, `postgres`, `minio`, `minio-init`)
- `infra/jenkins`: CI/CD pipelines by responsibility
  - `Jenkinsfile.frontend`
  - `Jenkinsfile.backend` (deploy API only)
  - `Jenkinsfile.infra` (manage DB/Storage only)

## Deployment Policy

- Frontend pipeline: deploy `apps/web`
- Backend pipeline: deploy only `api` service
- Infra pipeline: manage only `postgres`, `minio`, `minio-init`

Reason:
- Keep stateful services isolated from routine backend rebuilds
- Reduce unintended restart risk for DB/storage

## Env Policy

- Runtime secret file for Jenkins upload:
  - `infra/docker/api/.env.jenkins` (ignored by git)
- Public template files:
  - `infra/docker/api/.env.example`
  - `apps/api/.env.example`

Template files use placeholder values only.

## Data Flow (Media Upload)

1. Admin requests upload URL from API.
2. API returns MinIO presigned PUT URL + `object_key`.
3. Client uploads binary directly to MinIO.
4. Client sends metadata to API.
5. API stores metadata in PostgreSQL and links with post.

## API Baseline

- `GET /api/v1/health`
- `GET /api/v1/posts`
- `POST /api/v1/posts`
- `POST /api/v1/media/upload-url`
- `POST /api/v1/media`

## Database Baseline

- `posts`
- `media_assets`
- migration: `apps/api/alembic/versions/20260303_0001_initial_schema.py`

## Operations Notes

- Reverse proxy upstream for API:
  - host: `traceoflight-api`
  - port: `API_PORT` from runtime env
  - scheme: `http`
- State services are internal network only and not externally published.

## Next Recommended Steps

- Add auth/authorization for admin APIs
- Add upload size/type validation and antivirus scan hook
- Add backup policy automation for Postgres and MinIO
- Add API integration tests for post/media flows
