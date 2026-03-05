# FastAPI API Docstring/OpenAPI Standardization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** FastAPI Swagger/ReDoc 화면에서 API 의도, 입력값, 인증 헤더, 응답 코드를 JavaDoc/Doxygen처럼 읽히도록 API 전반의 주석/문서 메타데이터를 표준화한다.

**Architecture:** OpenAPI 문서 품질을 "코드 주석 + 데코레이터 메타데이터 + 스키마 Field 설명"의 3층으로 관리한다. 먼저 OpenAPI contract 테스트를 추가해 문서 회귀를 막고, 이후 endpoint(`health/posts/media`)와 schema(`post/media`)를 순차적으로 문서화한다. 마지막으로 앱 레벨 태그/설명과 운영 문서(README + docs/api 가이드)를 정리해 팀 기준을 고정한다.

**Tech Stack:** FastAPI 0.115, Pydantic v2, pytest, FastAPI TestClient, OpenAPI 3.1

---

### Task 1: Add OpenAPI Doc Contract Test Baseline

**Files:**
- Create: `apps/api/tests/api/test_openapi_docs.py`
- Modify: `apps/api/src/app/api/v1/endpoints/health.py`

**Step 1: Write the failing test**

```python
# apps/api/tests/api/test_openapi_docs.py
from fastapi.testclient import TestClient

from app.main import app


def _openapi() -> dict:
    client = TestClient(app)
    response = client.get("/openapi.json")
    assert response.status_code == 200
    return response.json()


def test_health_operation_has_summary_and_description() -> None:
    schema = _openapi()
    operation = schema["paths"]["/api/v1/health"]["get"]

    assert operation["summary"] == "Health check"
    assert "liveness" in operation["description"].lower()
    assert operation["operationId"] == "health_check_api_v1_health_get"
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api; pytest tests/api/test_openapi_docs.py::test_health_operation_has_summary_and_description -q`  
Expected: FAIL because `summary`/`description` are not defined in `health.py`.

**Step 3: Write minimal implementation**

```python
# apps/api/src/app/api/v1/endpoints/health.py
@router.get(
    "/health",
    summary="Health check",
    description="Simple liveness probe used by load balancer and container health checks.",
)
def health_check() -> dict[str, str]:
    """Return service liveness status."""
    return {"status": "ok"}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api; pytest tests/api/test_openapi_docs.py::test_health_operation_has_summary_and_description -q`  
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/tests/api/test_openapi_docs.py apps/api/src/app/api/v1/endpoints/health.py
git commit -m "test(api): add openapi contract baseline for health endpoint docs"
```

### Task 2: Document Posts Endpoints Like API Reference Pages

**Files:**
- Modify: `apps/api/src/app/api/v1/endpoints/posts.py`
- Modify: `apps/api/tests/api/test_openapi_docs.py`

**Step 1: Write the failing test**

```python
def test_posts_operations_expose_reference_metadata() -> None:
    schema = _openapi()
    list_op = schema["paths"]["/api/v1/posts"]["get"]
    create_op = schema["paths"]["/api/v1/posts"]["post"]
    delete_op = schema["paths"]["/api/v1/posts/{slug}"]["delete"]

    assert list_op["summary"] == "List posts"
    assert "public" in list_op["description"].lower()
    assert "x-internal-api-secret" in str(list_op)

    assert create_op["summary"] == "Create post"
    assert "401" in create_op["responses"]
    assert "409" in create_op["responses"]

    assert delete_op["summary"] == "Delete post"
    assert delete_op["responses"]["204"]["description"] == "Post deleted"
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api; pytest tests/api/test_openapi_docs.py::test_posts_operations_expose_reference_metadata -q`  
Expected: FAIL because posts operations do not define enough summary/description/responses metadata yet.

**Step 3: Write minimal implementation**

```python
# apps/api/src/app/api/v1/endpoints/posts.py (representative pattern)
@router.get(
    "",
    response_model=list[PostRead],
    summary="List posts",
    description=(
        "Return posts list. Public callers are forced to published/public only. "
        "Internal callers may pass draft/private filters via x-internal-api-secret."
    ),
    responses={
        200: {"description": "Posts returned"},
        401: {"description": "Invalid internal secret for privileged access"},
    },
    openapi_extra={
        "parameters": [
            {
                "name": "x-internal-api-secret",
                "in": "header",
                "required": False,
                "schema": {"type": "string"},
                "description": "Internal shared secret for privileged filtering.",
            }
        ]
    },
)
def list_posts(...):
    """List posts with automatic public fallback for non-internal callers."""
```

```python
# same metadata style for get/post/put/delete:
# summary + description + explicit responses + short endpoint docstring
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api; pytest tests/api/test_openapi_docs.py::test_posts_operations_expose_reference_metadata -q`  
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/app/api/v1/endpoints/posts.py apps/api/tests/api/test_openapi_docs.py
git commit -m "docs(api): standardize posts endpoint openapi metadata"
```

### Task 3: Document Media Endpoints Including Upload-Proxy Headers

**Files:**
- Modify: `apps/api/src/app/api/v1/endpoints/media.py`
- Modify: `apps/api/tests/api/test_openapi_docs.py`

**Step 1: Write the failing test**

```python
def test_media_operations_document_upload_flow_and_proxy_headers() -> None:
    schema = _openapi()
    upload_url_op = schema["paths"]["/api/v1/media/upload-url"]["post"]
    register_op = schema["paths"]["/api/v1/media"]["post"]
    proxy_op = schema["paths"]["/api/v1/media/upload-proxy"]["post"]

    assert upload_url_op["summary"] == "Create upload URL"
    assert register_op["summary"] == "Register uploaded media"
    assert proxy_op["summary"] == "Proxy upload to object storage"
    assert "x-upload-url" in str(proxy_op)
    assert "502" in proxy_op["responses"]
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api; pytest tests/api/test_openapi_docs.py::test_media_operations_document_upload_flow_and_proxy_headers -q`  
Expected: FAIL because media operations currently have no descriptive metadata.

**Step 3: Write minimal implementation**

```python
# apps/api/src/app/api/v1/endpoints/media.py (representative pattern)
@router.post(
    "/upload-proxy",
    summary="Proxy upload to object storage",
    description=(
        "Forward raw request body to pre-signed object storage URL. "
        "Required header: x-upload-url. Optional header: x-upload-content-type."
    ),
    responses={
        200: {"description": "Binary payload uploaded successfully"},
        400: {"description": "Missing header/body or unsupported protocol"},
        502: {"description": "Object storage request failed"},
    },
    openapi_extra={
        "parameters": [
            {
                "name": "x-upload-url",
                "in": "header",
                "required": True,
                "schema": {"type": "string"},
                "description": "Pre-signed PUT URL from object storage.",
            },
            {
                "name": "x-upload-content-type",
                "in": "header",
                "required": False,
                "schema": {"type": "string"},
                "description": "Content-Type forwarded to object storage PUT request.",
            },
        ]
    },
)
async def upload_media_proxy(...):
    """Upload binary payload to object storage via server-side proxy."""
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api; pytest tests/api/test_openapi_docs.py::test_media_operations_document_upload_flow_and_proxy_headers -q`  
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/app/api/v1/endpoints/media.py apps/api/tests/api/test_openapi_docs.py
git commit -m "docs(api): add media endpoint reference metadata and proxy header docs"
```

### Task 4: Add Field-Level Schema Descriptions and Examples

**Files:**
- Modify: `apps/api/src/app/schemas/post.py`
- Modify: `apps/api/src/app/schemas/media.py`
- Modify: `apps/api/tests/api/test_openapi_docs.py`

**Step 1: Write the failing test**

```python
def test_post_and_media_component_schemas_have_field_descriptions() -> None:
    schema = _openapi()
    post_create = schema["components"]["schemas"]["PostCreate"]["properties"]
    media_upload = schema["components"]["schemas"]["MediaUploadRequest"]["properties"]

    assert post_create["slug"]["description"] == "URL-friendly unique post identifier."
    assert "example" in post_create["title"]
    assert media_upload["filename"]["description"] == "Original file name from client."
    assert "example" in media_upload["mime_type"]
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api; pytest tests/api/test_openapi_docs.py::test_post_and_media_component_schemas_have_field_descriptions -q`  
Expected: FAIL because schema fields are plain annotations without `Field()` metadata.

**Step 3: Write minimal implementation**

```python
# apps/api/src/app/schemas/post.py
from pydantic import BaseModel, ConfigDict, Field

class PostCreate(BaseModel):
    slug: str = Field(..., description="URL-friendly unique post identifier.", example="my-first-post")
    title: str = Field(..., description="Human-readable post title.", example="My First Post")
    body_markdown: str = Field(..., description="Markdown source body.")
```

```python
# apps/api/src/app/schemas/media.py
from pydantic import BaseModel, ConfigDict, Field

class MediaUploadRequest(BaseModel):
    filename: str = Field(..., description="Original file name from client.", example="cover.jpg")
    mime_type: str = Field(..., description="IANA media type of upload file.", example="image/jpeg")
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api; pytest tests/api/test_openapi_docs.py::test_post_and_media_component_schemas_have_field_descriptions -q`  
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/app/schemas/post.py apps/api/src/app/schemas/media.py apps/api/tests/api/test_openapi_docs.py
git commit -m "docs(api): add pydantic field descriptions and examples for openapi components"
```

### Task 5: Finalize App-Level Doc UX and Team Commenting Guideline

**Files:**
- Modify: `apps/api/src/app/main.py`
- Modify: `apps/api/README.md`
- Create: `docs/api/fastapi-openapi-commenting-style.md`
- Modify: `apps/api/tests/api/test_openapi_docs.py`

**Step 1: Write the failing test**

```python
def test_openapi_has_tag_descriptions_for_health_posts_media() -> None:
    schema = _openapi()
    tags = {tag["name"]: tag for tag in schema["tags"]}

    assert "health" in tags
    assert "posts" in tags
    assert "media" in tags
    assert "liveness" in tags["health"]["description"].lower()
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api; pytest tests/api/test_openapi_docs.py::test_openapi_has_tag_descriptions_for_health_posts_media -q`  
Expected: FAIL because app-level `openapi_tags` descriptions are not configured.

**Step 3: Write minimal implementation**

```python
# apps/api/src/app/main.py
OPENAPI_TAGS = [
    {"name": "health", "description": "Liveness/readiness endpoints."},
    {"name": "posts", "description": "Post query and admin write operations."},
    {"name": "media", "description": "Media upload URL issuance and metadata registration."},
]

app = FastAPI(
    title=settings.app_name,
    description="TraceofLight content API for post and media management.",
    lifespan=lifespan,
    openapi_tags=OPENAPI_TAGS,
)
```

```md
# docs/api/fastapi-openapi-commenting-style.md
- Route decorator: always set `summary`, `description`, `responses`
- Route docstring: one-line intent + behavior notes
- Pydantic fields: use `Field(..., description=..., example=...)`
- Internal headers (e.g. `x-internal-api-secret`): always document in OpenAPI
```

**Step 4: Run full verification**

Run: `cd apps/api; pytest -q`  
Expected: PASS (existing tests + new OpenAPI docs tests all green).

Run: `cd apps/api; python -c "from app.main import app; print(bool(app.openapi()))"`  
Expected: `True`.

**Step 5: Commit**

```bash
git add apps/api/src/app/main.py apps/api/README.md docs/api/fastapi-openapi-commenting-style.md apps/api/tests/api/test_openapi_docs.py
git commit -m "docs(api): finalize openapi tagging and commenting guideline"
```

### Task 6: Optional Static API Spec Export (if CI artifact needed)

**Files:**
- Create: `apps/api/scripts/export_openapi.py`
- Modify: `apps/api/README.md`

**Step 1: Write the failing check**

```bash
cd apps/api
python scripts/export_openapi.py
```

Expected: FAIL because script does not exist.

**Step 2: Add minimal script**

```python
# apps/api/scripts/export_openapi.py
from __future__ import annotations

import json
from pathlib import Path

from app.main import app


def main() -> None:
    target = Path(__file__).resolve().parents[2] / "docs" / "api" / "openapi.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(app.openapi(), ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {target}")


if __name__ == "__main__":
    main()
```

**Step 3: Run check**

Run: `cd apps/api; python scripts/export_openapi.py`  
Expected: PASS and `docs/api/openapi.json` created.

**Step 4: Verify artifact**

Run: `Test-Path docs/api/openapi.json`  
Expected: `True`.

**Step 5: Commit**

```bash
git add apps/api/scripts/export_openapi.py apps/api/README.md docs/api/openapi.json
git commit -m "chore(api): add openapi export script for docs artifact"
```

---

`@superpowers/test-driven-development`를 각 Task에 적용해 "문서 메타데이터도 테스트로 고정"하는 방식으로 진행한다.
`@superpowers/verification-before-completion`으로 최종 `pytest -q`와 OpenAPI 생성 검증 로그를 확인한 뒤 완료 처리한다.
