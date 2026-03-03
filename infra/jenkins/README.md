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

`Jenkinsfile.infra` uses the same credential and manages only infra services (`postgres`, `minio`, `minio-init`) via `ACTION` parameter.

Note:
- For Compose safety, avoid `$` characters in secret values inside the Jenkins env file used by backend pipeline.
- Required keys in Jenkins env file: `API_PORT`, `POSTGRES_PORT`, `MINIO_API_PORT`, `MINIO_CONSOLE_PORT`, DB and MinIO credentials.
