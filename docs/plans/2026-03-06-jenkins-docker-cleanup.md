# Jenkins Docker Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent Docker image, cache, and one-shot container buildup from repeated Jenkins deployments.

**Architecture:** Frontend and backend pipelines will prune dangling images and unused builder cache after each run. The infra pipeline will explicitly remove the exited `minio-init` bootstrap container after infra actions complete. A small regression test will assert these cleanup hooks stay present.

**Tech Stack:** Jenkins Pipeline, Docker Compose, Python `unittest`

---

### Task 1: Add a failing regression test for cleanup hooks

**Files:**
- Create: `infra/jenkins/tests/test_pipeline_cleanup.py`

**Step 1: Write the failing test**
- Assert `Jenkinsfile.frontend` contains `docker image prune -f`.
- Assert `Jenkinsfile.frontend` contains `docker builder prune -f`.
- Assert `Jenkinsfile.backend` contains `docker image prune -f`.
- Assert `Jenkinsfile.backend` contains `docker builder prune -f`.
- Assert `Jenkinsfile.infra` contains `docker compose --env-file .env rm -f minio-init`.

**Step 2: Run the test to verify it fails**
- Run: `python infra/jenkins/tests/test_pipeline_cleanup.py`
- Expected: FAIL because the cleanup commands are not present yet.

### Task 2: Add Jenkins cleanup hooks

**Files:**
- Modify: `infra/jenkins/Jenkinsfile.frontend`
- Modify: `infra/jenkins/Jenkinsfile.backend`
- Modify: `infra/jenkins/Jenkinsfile.infra`

**Step 1: Add frontend cleanup**
- In `post { always { ... } }`, keep `.env` cleanup and add `docker image prune -f || true` and `docker builder prune -f || true`.

**Step 2: Add backend cleanup**
- In `post { always { ... } }`, keep `.env` cleanup and add `docker image prune -f || true` and `docker builder prune -f || true`.

**Step 3: Add infra one-shot cleanup**
- In `post { always { ... } }`, run `docker compose --env-file .env rm -f minio-init || true` before deleting `.env`.

### Task 3: Document the pipeline behavior

**Files:**
- Modify: `infra/jenkins/README.md`

**Step 1: Update frontend and backend notes**
- Document that deploy jobs prune dangling images and unused build cache after each run.

**Step 2: Update infra notes**
- Document that the infra job removes the exited `minio-init` bootstrap container after runs.

### Task 4: Verify

**Files:**
- Modify only if verification reveals a gap.

**Step 1: Re-run regression test**
- Run: `python infra/jenkins/tests/test_pipeline_cleanup.py`
- Expected: PASS

**Step 2: Inspect diff**
- Run: `git diff -- infra/jenkins/Jenkinsfile.frontend infra/jenkins/Jenkinsfile.backend infra/jenkins/Jenkinsfile.infra infra/jenkins/README.md infra/jenkins/tests/test_pipeline_cleanup.py docs/plans/2026-03-06-jenkins-docker-cleanup-design.md docs/plans/2026-03-06-jenkins-docker-cleanup.md`
- Expected: Only cleanup-related changes are present.
