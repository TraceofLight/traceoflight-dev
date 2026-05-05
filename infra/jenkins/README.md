# Jenkins Pipelines

Use `Pipeline script from SCM` and set script paths per job:

- Frontend job script path: `infra/jenkins/Jenkinsfile.frontend`
- Backend job script path: `infra/jenkins/Jenkinsfile.backend`
- Infra job script path: `infra/jenkins/Jenkinsfile.infra`

## Env file naming convention

All env files for this project live under each app folder (`apps/api/`, `apps/web/`). Filename includes the service so two files visible side-by-side stay distinguishable when uploading to Jenkins or moving between machines:

| Service | Runtime env (gitignored) | Committed template | Jenkins payload reference (gitignored) |
| :-- | :-- | :-- | :-- |
| Backend | `apps/api/.env.api` | `apps/api/.env.api.example` | `apps/api/.env.api.jenkins` |
| Frontend | `apps/web/.env.web` | `apps/web/.env.web.example` | `apps/web/.env.web.jenkins` |

Nothing env-related lives inside `infra/`.

## Backend Credential

`Jenkinsfile.backend` expects a Jenkins `Secret file` credential:

- Credential ID: `traceoflight-api-env`
- Schema: same keys as `apps/api/.env.api.example`, with production values
- Jenkins copies the credential to `apps/api/.env.api` at deploy time, then runs compose from `infra/docker/api` with `--env-file ../../../apps/api/.env.api`. Cleanup `rm -f apps/api/.env.api` runs in `post.always`.

Backend pipeline deploys only the `api` service (`--no-deps api`) to avoid unintended restarts of `postgres` and `minio`.

`Jenkinsfile.infra` uses the same credential and manages infra services (`postgres`, `minio`, `redis`, `minio-init`) via `ACTION` parameter.
- After each infra run, Jenkins removes the exited one-shot `minio-init` container with:
  - `docker compose --env-file ../../../apps/api/.env.api rm -f minio-init`

- Backend/Frontend deploy jobs prune only safe Docker garbage during `post` steps:
  - `docker container prune -f`
  - `docker image prune -f`
- They intentionally do not run `docker builder prune` so active build cache cleanup is left alone during concurrent builds.

Note:
- For Compose safety, avoid `$` characters in secret values inside the Jenkins env file used by backend pipeline.
- Required keys in Jenkins env file: `API_PORT`, `POSTGRES_PORT`, `MINIO_API_PORT`, `MINIO_CONSOLE_PORT`, DB and MinIO credentials.

## Frontend Credential

`Jenkinsfile.frontend` expects a Jenkins `Secret file` credential:

- Credential ID: `traceoflight-web-env`
- Schema: same keys as `apps/web/.env.web.example`, with production values
- Jenkins copies the credential to `apps/web/.env.web` at deploy time, then runs compose from `infra/docker/web` with `--env-file ../../../apps/web/.env.web`. Cleanup `rm -f apps/web/.env.web` runs in `post.always`.
- Required keys:
  - `SITE_URL`
  - `PORT`
  - `API_BASE_URL`
  - `ADMIN_SESSION_SECRET`
  - `ADMIN_ACCESS_TOKEN_MAX_AGE_SECONDS`
  - `ADMIN_REFRESH_TOKEN_MAX_AGE_SECONDS`
  - `INTERNAL_API_SECRET`
