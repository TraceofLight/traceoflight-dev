# traceoflight-api

FastAPI backend for posts and media metadata.

## API notes

- `GET /api/v1/posts?status=published` for public blog feed
- `GET /api/v1/posts/{slug}?status=published` for public post detail
- `POST /api/v1/posts` for admin post creation
- `POST /api/v1/media/upload-url` + `POST /api/v1/media` for media uploads

## Local run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
# create .env from ../../infra/docker/api/.env.example and adjust values
export API_PORT=<your_api_port>
uvicorn app.main:app --reload --host 0.0.0.0 --port "$API_PORT"
```

## Test

```bash
pytest -q
```

## Docker Stack

Use `infra/docker/api/docker-compose.yml` to run API + PostgreSQL + MinIO.
API runtime container runs as non-root user (`app`).
