# Jenkins Docker Cleanup Design

## Context

The deployment host accumulated large numbers of dangling Docker images, legacy tagged images, build cache entries, and exited one-shot containers. The current frontend and backend Jenkins pipelines rebuild Docker images on each deployment, but they do not perform any cleanup after the deployment completes.

## Options Considered

### Option 1: Remove only exited containers

- Simple to add.
- Cleans up `minio-init` and any stray stopped containers.
- Does not address the main storage growth from dangling images and BuildKit cache.

### Option 2: Add safe deploy-time cleanup to Jenkins pipelines

- Add `docker image prune -f` and `docker builder prune -f` after frontend/backend deployments.
- Remove `minio-init` explicitly after infra runs.
- Preserves running containers and referenced images.
- Prevents repetitive accumulation without broad host-wide destructive pruning.

### Option 3: Aggressive prune after every deployment

- Use `docker image prune -a -f` or broader system pruning in Jenkins.
- Reclaims more space immediately.
- Risks removing useful tagged images and slowing subsequent builds unnecessarily.

## Selected Design

Use Option 2.

- Frontend pipeline cleans dangling images and unused builder cache in `post { always { ... } }`.
- Backend pipeline does the same.
- Infra pipeline removes the exited `minio-init` one-shot container in `post { always { ... } }`.
- Jenkins documentation explains the cleanup behavior so the operational intent stays explicit.

## Why This Design

- Dangling images created by repeated `docker compose ... up -d --build` are definitely safe to remove.
- Unused builder cache is safe to prune after the build has completed.
- `minio-init` is intentionally short-lived and should not remain as operational clutter.
- The change is local to the deployment pipelines and does not change runtime application behavior.

## Verification Plan

- Add a regression test that checks the Jenkinsfiles for the expected cleanup commands.
- Run the new test once before implementation to confirm failure.
- Update Jenkinsfiles and docs.
- Re-run the test to confirm the required cleanup hooks are present.
