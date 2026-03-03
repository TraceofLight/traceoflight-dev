FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/src

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
COPY src ./src
COPY alembic ./alembic
COPY alembic.ini ./
COPY scripts ./scripts

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir .

RUN addgroup --system app \
    && adduser --system --ingroup app --home /app --shell /usr/sbin/nologin app \
    && chown -R app:app /app \
    && chmod +x ./scripts/entrypoint.sh

USER app

EXPOSE 8000

ENTRYPOINT ["./scripts/entrypoint.sh"]
