# traceoflight-api

FastAPI backend for posts and media metadata.

## API notes

- `GET /api/v1/web-service/posts?status=published` for public blog feed
- `GET /api/v1/web-service/posts/{slug}?status=published` for public post detail
- `POST /api/v1/web-service/posts` for admin post creation
- `POST /api/v1/web-service/media/upload-url` + `POST /api/v1/web-service/media` for media uploads

## Local run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
# All env files for this app live under apps/api/ with .env.api[.suffix] naming.
# Bootstrap from the local template:
cp .env.api.example .env.api
# (optional) keep a .env.api.jenkins next to it as your local copy of the Jenkins credential payload.
export API_PORT=<your_api_port>
uvicorn app.main:app --reload --host 0.0.0.0 --port "$API_PORT"
```

The deployment compose stack at `infra/docker/api/docker-compose.yml` reads `apps/api/.env.api` via a relative `env_file:` path — there are no env files inside `infra/`.

## Test

```bash
pytest -q
```

OpenAPI documentation contract test:

```bash
pytest tests/api/test_openapi_docs.py -q
```

## OpenAPI Commenting Style

OpenAPI metadata and docstring conventions are documented at:

- `docs/api/fastapi-openapi-commenting-style.md`

## OpenAPI Export

Export static OpenAPI JSON artifact:

```bash
python scripts/export_openapi.py
```

## Docker Stack

Use `infra/docker/api/docker-compose.yml` to run API + PostgreSQL + MinIO.
API runtime container runs as non-root user (`app`).
