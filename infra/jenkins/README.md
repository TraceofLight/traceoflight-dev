# Jenkins Pipelines

Use `Pipeline script from SCM` and set script paths per job:

- Orchestrator job script path: `infra/jenkins/Jenkinsfile.orchestrator`
- Frontend job script path: `infra/jenkins/Jenkinsfile.frontend`
- Backend job script path: `infra/jenkins/Jenkinsfile.backend`
- Infra job script path: `infra/jenkins/Jenkinsfile.infra`

## Orchestrator entrypoint

`Jenkinsfile.orchestrator` is the single GitHub-push entrypoint. On push it
runs:

1. **Test** — `Backend Test` and `Frontend Test` in parallel (cargo test in
   the api_internal docker network; bun test in a self-contained image).
2. **Build** — `Backend Build` and `Frontend Build` in parallel via
   `build job: 'traceoflight-backend' MODE=build` and `traceoflight-frontend`.
3. **Deploy Backend** — `traceoflight-backend MODE=deploy`.
4. **Deploy Frontend** — `traceoflight-frontend MODE=deploy`. Always last so
   the frontend never deploys against an unupgraded API.

Test runs inline in the orchestrator (not delegated to children) so Blue
Ocean's orchestrator view shows the full Test → Build → Deploy story on one
screen. The children expose only `build`/`deploy`/`full` and do not test.

The child Jenkinsfiles expose a `MODE` choice parameter (`full`, `build`,
`deploy`). `full` runs build + deploy + healthcheck for manual single-domain
re-deploys; **it does not run tests** — testing is the orchestrator's job.

The orchestrator hard-codes the downstream Jenkins job names
`traceoflight-backend` and `traceoflight-frontend`. Create those jobs (they
already exist per the existing convention) before pointing the orchestrator at
its Jenkinsfile, and remove `githubPush` from the backend job once the
orchestrator owns the webhook.

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
