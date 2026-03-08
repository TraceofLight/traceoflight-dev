# Jenkins Pipelines

Use `Pipeline script from SCM` and set script paths per job:

- Frontend job script path: `infra/jenkins/Jenkinsfile.frontend`
- Backend job script path: `infra/jenkins/Jenkinsfile.backend`
- Infra job script path: `infra/jenkins/Jenkinsfile.infra`

## Backend Credential

`Jenkinsfile.backend` expects a Jenkins `Secret file` credential:

- Credential ID: `traceoflight-api-env`
- File content: backend runtime env (based on `infra/docker/api/.env.example`)

Backend pipeline deploys only the `api` service (`--no-deps api`) to avoid unintended restarts of `postgres` and `minio`.
- Backend/Frontend deploy jobs should not prune Docker images during `post` steps. Concurrent prune operations can remove legacy builder intermediates while another pipeline is still building.

`Jenkinsfile.infra` uses the same credential and manages only infra services (`postgres`, `minio`, `minio-init`) via `ACTION` parameter.
- After each infra run, Jenkins removes the exited one-shot `minio-init` container with:
  - `docker compose --env-file .env rm -f minio-init`

Note:
- For Compose safety, avoid `$` characters in secret values inside the Jenkins env file used by backend pipeline.
- Required keys in Jenkins env file: `API_PORT`, `POSTGRES_PORT`, `MINIO_API_PORT`, `MINIO_CONSOLE_PORT`, DB and MinIO credentials.

## Frontend Credential

`Jenkinsfile.frontend` expects a Jenkins `Secret file` credential:

- Credential ID: `traceoflight-web-env`
- File content: frontend runtime env (based on `apps/web/.env.example`)
- Jenkins copies this file to `apps/web/.env` at deploy time, then runs:
  - `docker compose --env-file .env up -d --build --remove-orphans`
- Required keys:
  - `SITE_URL`
  - `ADMIN_LOGIN_ID`
  - `ADMIN_LOGIN_PASSWORD_HASH` (preferred) or `ADMIN_LOGIN_PASSWORD` (fallback)
  - `ADMIN_SESSION_SECRET`
  - `ADMIN_ACCESS_TOKEN_MAX_AGE_SECONDS`
  - `ADMIN_REFRESH_TOKEN_MAX_AGE_SECONDS`
