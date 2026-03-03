#!/bin/sh
set -eu

python ./scripts/prestart.py
alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port "${API_PORT:-8000}"
