# Site Translations Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `NoopTranslationProvider` with a real DeepL-backed pipeline that creates and maintains `en/ja/zh` sibling rows for every Korean source post, executed asynchronously via a Redis-backed `rq` queue with hash-based change detection so unchanged content never re-translates.

**Architecture:** A `DeeplTranslationProvider` adapter wraps the DeepL SDK and emits translated `(title, excerpt, body_markdown)` triples. `PostTranslationService` becomes a thin orchestrator that, on Korean source create/update, enqueues one `translate_post_to_locale(source_id, target)` job per target locale onto the `translations` queue. A separate `rq worker` process reuses the API container image, picks up jobs, performs mask → translate → unmask, then upserts the corresponding sibling `posts` row. The worker re-derives a sha256 hash of the source's translatable fields each run; if the existing sibling's `translated_from_hash` already matches, it skips the DeepL call and only re-syncs non-translated metadata (cover image, status, published_at, etc.). Failed jobs are retained in `rq`'s failed registry for inspection and the corresponding sibling row is marked `translation_status='failed'` for inline retry on the next source save.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, Pydantic Settings, Redis, `rq` (sync queue), `deepl` SDK, `fakeredis` (tests), pytest.

**Provenance:** Continues the work in `feature/translation-core` (squashed commit `a26af0a` on top of main) and the incremental history on `feature/site-translations` (HEAD `2b2e9c3`). Builds on existing helpers `mask_markdown_translation_segments` / `unmask_markdown_translation_segments` from `apps/api/src/app/services/post_translation_markdown.py` and the `TranslationProvider` Protocol from `apps/api/src/app/services/translation_provider.py`.

**Reference:** `docs/plans/site-translations-design.md` — architectural decisions, especially the "Translation Service Seam" and "Writer Flow" sections.

---

## Pre-flight (read once before starting)

- **Where to work:** the existing worktree at `D:\Projects\Github\traceoflight-dev\.worktrees\site-translations`, branch `feature/site-translations`. After completion, the user will squash this work into a separate `feature/translation-provider` branch off main (mirroring how `feature/translation-core` was assembled).
- **Authorization:** the user has explicitly granted free action on non-main branches. Don't push, don't merge to main without explicit confirmation.
- **DeepL API key:** the user has a DeepL Free account; key lives in `.env.api` (gitignored). The key must NEVER appear in code, commits, or test fixtures. Tests use a stub provider, never the real client.
- **rq worker imports:** rq workers spawn a fresh Python process and import the job function by fully-qualified name. The job function (`app.services.translation_worker.translate_post_to_locale`) must be importable in isolation — no closures, no global mutable state, just take its arguments and read what it needs from the DB.
- **DB session in worker:** the worker is a separate process from the FastAPI app. It opens its own SQLAlchemy session per job using `app.db.session.SessionLocal` (or whatever the project already exports).
- **Markdown masking lives at the worker, not the service.** The previous core plan kept masking inside `PostTranslationService` for the Noop case. Move it into the worker so the masking + DeepL call + unmasking form one atomic step in the worker, and `PostTranslationService` becomes a pure "decide whether to enqueue" orchestrator.
- **Test infrastructure:** `apps/api/tests/services/__init__.py` already exists from the core plan. Reuse the in-memory SQLite session pattern (`create_engine("sqlite+pysqlite:///:memory:")`) for DB-touching tests. Use `fakeredis.FakeStrictRedis` for queue-touching tests.
- **Don't forget:** `apps/api/.env.api.example` is the committed template; update it. `apps/api/.env.api` is local-only and the user maintains it.

---

## File map

### New files

```
apps/api/src/app/services/deepl_translation_provider.py
apps/api/src/app/services/translation_hash.py
apps/api/src/app/services/translation_queue.py
apps/api/src/app/services/translation_worker.py
apps/api/alembic/versions/20260504_0014_add_translated_from_hash.py
apps/api/alembic/versions/20260504_0015_add_post_locale_slug_uniqueness.py
apps/api/tests/services/test_deepl_translation_provider.py
apps/api/tests/services/test_translation_hash.py
apps/api/tests/services/test_translation_queue.py
apps/api/tests/services/test_translation_worker.py
```

### Modified files

```
apps/api/pyproject.toml                          # add deepl, rq, fakeredis (dev) deps
apps/api/.env.api.example                        # add DEEPL_API_KEY, REDIS_QUEUE_NAME entries
apps/api/src/app/core/config.py                  # deepl_api_key, redis_url, redis_queue_name settings
apps/api/src/app/models/post.py                  # add translated_from_hash column
apps/api/src/app/api/deps.py                     # wire DeepL provider + queue
apps/api/src/app/services/post_translation_service.py   # replace direct provider call with queue enqueue
apps/api/src/app/services/post_translation_markdown.py  # (read only — uses existing helpers)
infra/docker/api/docker-compose.yml              # translation-worker service
```

### Responsibility per file

| File | Responsibility |
|------|----------------|
| `deepl_translation_provider.py` | Adapt DeepL SDK to the existing `TranslationProvider` Protocol. Exposes `DeeplTranslationProvider(api_key)` with `translate_post(post, target_locale) -> dict \| None` returning `{"title", "excerpt", "body_markdown"}`. |
| `translation_hash.py` | `compute_source_hash(*, title, excerpt, body_markdown) -> str` — deterministic sha256 over translatable fields only. Pure function, no DB access. |
| `translation_queue.py` | `TranslationQueue` wrapper around `rq.Queue("translations", connection=Redis)`. Method `enqueue_translation_job(source_post_id, target_locale)`. Sync API. |
| `translation_worker.py` | The actual rq job function `translate_post_to_locale(source_post_id, target_locale)`. Loads source, finds/creates sibling, decides translate-or-skip, runs mask→translate→unmask, persists. |
| `20260504_0014_add_translated_from_hash.py` | Add nullable `translated_from_hash VARCHAR(64)` column on `posts`. |
| `20260504_0015_add_post_locale_slug_uniqueness.py` | Drop existing UNIQUE on `slug` if present, add UNIQUE `(slug, locale)`. |
| `post_translation_service.py` | Become thin: on Korean source save, enqueue one job per target locale. Accept optional `queue: TranslationQueue` ctor arg; if absent, no-op. |
| `deps.py` | At app startup: build queue from `settings.redis_url`. Build `DeeplTranslationProvider` if `settings.deepl_api_key` set, else `NoopTranslationProvider`. Pass queue (and provider where needed) into `PostTranslationService`. |
| `docker-compose.yml` | Add a `translation-worker` service running `rq worker translations -u $REDIS_URL` reusing the api Dockerfile. |

---

### Task 1: Add DeepL + rq + fakeredis dependencies and env-var scaffolding

**Files:**
- Modify: `apps/api/pyproject.toml` — add `deepl`, `rq` to runtime deps; `fakeredis` to dev deps
- Modify: `apps/api/.env.api.example` — add `DEEPL_API_KEY`, `REDIS_URL`, `REDIS_QUEUE_NAME` entries
- Modify: `apps/api/src/app/core/config.py` — add three settings

- [ ] **Step 1: Update `apps/api/pyproject.toml`**

In the `dependencies` list (alongside `fastapi`, `sqlalchemy`, `redis`, etc.), add:

```toml
  "deepl==1.20.0",
  "rq==2.0.0",
```

In the `[project.optional-dependencies] dev` list, add:

```toml
  "fakeredis==2.26.1",
```

(Pin exact versions to match the rest of this project's pinning convention.)

- [ ] **Step 2: Install the new deps in the venv**

```bash
cd /d/Projects/Github/traceoflight-dev/.worktrees/site-translations/apps/api
.venv/Scripts/python -m pip install -e .[dev]
```

Expected: pip resolves `deepl`, `rq`, `fakeredis`, no version conflicts. Confirm with:

```bash
.venv/Scripts/python -c "import deepl, rq, fakeredis; print(deepl.__version__, rq.__version__, fakeredis.__version__)"
```

- [ ] **Step 3: Update `.env.api.example`**

Append to the bottom:

```env
# Translation provider (DeepL Free or Pro). Leave empty to disable translations
# and fall back to NoopTranslationProvider.
DEEPL_API_KEY=

# Redis connection for the translation job queue.
REDIS_URL=redis://redis:6379/0
REDIS_QUEUE_NAME=translations
```

If existing `REDIS_URL` is already in the example (it appears in docker-compose env), don't duplicate — only add the missing keys.

- [ ] **Step 4: Add the three settings in `apps/api/src/app/core/config.py`**

Inside the `Settings` class (where `postgres_user`, `api_prefix`, etc. live), add:

```python
deepl_api_key: str | None = Field(default=None, alias="DEEPL_API_KEY")
redis_url: str = Field(default="redis://redis:6379/0", alias="REDIS_URL")
redis_queue_name: str = Field(default="translations", alias="REDIS_QUEUE_NAME")
```

If `redis_url` already exists for some other purpose, reuse it; do not add a second copy.

- [ ] **Step 5: Smoke-import**

```bash
cd /d/Projects/Github/traceoflight-dev/.worktrees/site-translations/apps/api
.venv/Scripts/python -c "from app.core.config import settings; print(settings.redis_url, settings.redis_queue_name, type(settings.deepl_api_key))"
```

Expected: `redis://redis:6379/0 translations <class 'NoneType'>` (assuming no key set in shell env).

- [ ] **Step 6: Commit**

```bash
cd /d/Projects/Github/traceoflight-dev/.worktrees/site-translations
git add apps/api/pyproject.toml apps/api/.env.api.example apps/api/src/app/core/config.py
git commit -m "build(api): add deepl, rq, fakeredis deps and translation env settings"
```

---

### Task 2: Add `translated_from_hash` column (migration 0014, model)

**Files:**
- Modify: `apps/api/src/app/models/post.py`
- Create: `apps/api/alembic/versions/20260504_0014_add_translated_from_hash.py`

- [ ] **Step 1: Extend the `Post` model**

In `apps/api/src/app/models/post.py`, immediately after the existing `translation_source_kind` column inside `class Post(...):`, add:

```python
translated_from_hash: Mapped[str | None] = mapped_column(
    String(64),
    nullable=True,
)
```

(64 hex chars = sha256.)

- [ ] **Step 2: Write the migration**

Create `apps/api/alembic/versions/20260504_0014_add_translated_from_hash.py`:

```python
"""add translated_from_hash to posts

Revision ID: 20260504_0014
Revises: 20260503_0013
Create Date: 2026-05-04 12:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260504_0014"
down_revision = "20260503_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "posts",
        sa.Column("translated_from_hash", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("posts", "translated_from_hash")
```

- [ ] **Step 3: Verify offline SQL generation**

```bash
cd /d/Projects/Github/traceoflight-dev/.worktrees/site-translations/apps/api
SQLALCHEMY_URL="postgresql+psycopg://stub@localhost/stub" \
ADMIN_SESSION_SECRET=test ADMIN_LOGIN_ID=test ADMIN_LOGIN_PASSWORD_HASH=test \
.venv/Scripts/python -m alembic upgrade 20260503_0013:20260504_0014 --sql 2>&1 | tail -10
```

Expected: clean `ALTER TABLE posts ADD COLUMN translated_from_hash VARCHAR(64);` followed by `UPDATE alembic_version`.

- [ ] **Step 4: Verify the model still imports**

```bash
.venv/Scripts/python -c "from app.models.post import Post; print('translated_from_hash' in [c.name for c in Post.__table__.columns])"
```

Expected: `True`.

- [ ] **Step 5: Run the existing backend test suite to confirm no regressions**

```bash
.venv/Scripts/python -m pytest -q 2>&1 | tail -10
```

Expected: same green count as the end of the core plan (171 passed).

- [ ] **Step 6: Commit**

```bash
cd /d/Projects/Github/traceoflight-dev/.worktrees/site-translations
git add apps/api/src/app/models/post.py apps/api/alembic/versions/20260504_0014_add_translated_from_hash.py
git commit -m "feat(api): add translated_from_hash column for change detection"
```

---

### Task 3: Replace `slug` UNIQUE with composite `(slug, locale)` UNIQUE (migration 0015)

The previous core plan didn't update slug uniqueness, but the new design requires multiple posts sharing a slug across locales. Verify the constraint name first, then drop and re-add.

**Files:**
- Create: `apps/api/alembic/versions/20260504_0015_add_post_locale_slug_uniqueness.py`

- [ ] **Step 1: Inspect the live posts table on the test container to find the slug constraint name**

The user previously stood up `translations-pg-test` on port 5436. If still running, point alembic at it and inspect:

```bash
cd /d/Projects/Github/traceoflight-dev/.worktrees/site-translations/apps/api
docker exec translations-pg-test psql -U traceoflight -d traceoflight -c "\d posts" 2>&1 | grep -i "unique\|index" | head -20
```

If the container is not running, spin one up briefly:

```bash
docker run -d --name translations-pg-test -e POSTGRES_USER=traceoflight -e POSTGRES_PASSWORD=traceoflight -e POSTGRES_DB=traceoflight -p 5436:5432 postgres:16-alpine
sleep 5
POSTGRES_HOST=localhost POSTGRES_PORT=5436 POSTGRES_USER=traceoflight POSTGRES_PASSWORD=traceoflight POSTGRES_DB=traceoflight \
ADMIN_SESSION_SECRET=test ADMIN_LOGIN_ID=test ADMIN_LOGIN_PASSWORD_HASH=test \
.venv/Scripts/python -m alembic upgrade 20260324_0012
docker exec translations-pg-test psql -U traceoflight -d traceoflight -c "\d posts"
```

(The chain may stall at migration 0008 due to the pre-existing same-transaction-enum issue. If so, manually create the `posts` table or skip live verification — the migration syntax can still be validated offline below.)

Capture the existing constraint name. Conventional pattern in this repo: `posts_slug_key` (Postgres default) or `uq_posts_slug` (Alembic-named). Note exactly what shows.

- [ ] **Step 2: Write the migration**

Create `apps/api/alembic/versions/20260504_0015_add_post_locale_slug_uniqueness.py`:

```python
"""replace slug uniqueness with (slug, locale)

Revision ID: 20260504_0015
Revises: 20260504_0014
Create Date: 2026-05-04 12:30:00
"""

from __future__ import annotations

from alembic import op


revision = "20260504_0015"
down_revision = "20260504_0014"
branch_labels = None
depends_on = None


# Postgres assigns this name automatically when a column is declared UNIQUE
# inline. If the live constraint is named differently in your environment,
# update this value before running the migration.
LEGACY_SLUG_UNIQUE_NAME = "posts_slug_key"
COMPOSITE_UNIQUE_NAME = "uq_posts_slug_locale"


def upgrade() -> None:
    op.drop_constraint(LEGACY_SLUG_UNIQUE_NAME, "posts", type_="unique")
    op.create_unique_constraint(
        COMPOSITE_UNIQUE_NAME,
        "posts",
        ["slug", "locale"],
    )


def downgrade() -> None:
    op.drop_constraint(COMPOSITE_UNIQUE_NAME, "posts", type_="unique")
    op.create_unique_constraint(
        LEGACY_SLUG_UNIQUE_NAME,
        "posts",
        ["slug"],
    )
```

If Step 1 revealed a different constraint name, update `LEGACY_SLUG_UNIQUE_NAME` accordingly before running.

- [ ] **Step 3: Verify offline**

```bash
cd /d/Projects/Github/traceoflight-dev/.worktrees/site-translations/apps/api
SQLALCHEMY_URL="postgresql+psycopg://stub@localhost/stub" \
ADMIN_SESSION_SECRET=test ADMIN_LOGIN_ID=test ADMIN_LOGIN_PASSWORD_HASH=test \
.venv/Scripts/python -m alembic upgrade 20260504_0014:20260504_0015 --sql 2>&1 | tail -10
```

Expected: `ALTER TABLE posts DROP CONSTRAINT posts_slug_key;` followed by `ALTER TABLE posts ADD CONSTRAINT uq_posts_slug_locale UNIQUE (slug, locale);`.

- [ ] **Step 4: Live round-trip on the test container (if available)**

```bash
docker exec translations-pg-test psql -U traceoflight -d traceoflight -c "DROP TABLE IF EXISTS posts CASCADE; CREATE TABLE posts (id UUID PRIMARY KEY, slug TEXT NOT NULL, locale TEXT NOT NULL DEFAULT 'ko', CONSTRAINT posts_slug_key UNIQUE (slug));"
docker exec translations-pg-test psql -U traceoflight -d traceoflight -c "ALTER TABLE posts DROP CONSTRAINT posts_slug_key; ALTER TABLE posts ADD CONSTRAINT uq_posts_slug_locale UNIQUE (slug, locale);"
docker exec translations-pg-test psql -U traceoflight -d traceoflight -c "INSERT INTO posts (id, slug, locale) VALUES (gen_random_uuid(), 'foo', 'ko'), (gen_random_uuid(), 'foo', 'en');"
docker exec translations-pg-test psql -U traceoflight -d traceoflight -c "SELECT slug, locale FROM posts;"
docker exec translations-pg-test psql -U traceoflight -d traceoflight -c "INSERT INTO posts (id, slug, locale) VALUES (gen_random_uuid(), 'foo', 'ko');" 2>&1 | grep -i "duplicate\|unique"
```

Expected: first INSERT succeeds (foo/ko + foo/en), second INSERT fails with duplicate key violation on `uq_posts_slug_locale`. Cleanup:

```bash
docker exec translations-pg-test psql -U traceoflight -d traceoflight -c "DROP TABLE posts;"
```

- [ ] **Step 5: Existing tests still pass**

The in-memory SQLite-based tests don't enforce the constraint identically, but the `Base.metadata.create_all` should pick up the model unchanged.

```bash
.venv/Scripts/python -m pytest -q 2>&1 | tail -10
```

Expected: 171 passed (or matching the running baseline).

- [ ] **Step 6: Commit**

```bash
cd /d/Projects/Github/traceoflight-dev/.worktrees/site-translations
git add apps/api/alembic/versions/20260504_0015_add_post_locale_slug_uniqueness.py
git commit -m "feat(api): replace slug uniqueness with (slug, locale) composite"
```

---

### Task 4: Translation hash helper (TDD)

**Files:**
- Create: `apps/api/src/app/services/translation_hash.py`
- Create: `apps/api/tests/services/test_translation_hash.py`

- [ ] **Step 1: Write failing tests**

`apps/api/tests/services/test_translation_hash.py`:

```python
from __future__ import annotations

from app.services.translation_hash import compute_source_hash


def test_compute_source_hash_is_deterministic() -> None:
    a = compute_source_hash(title="A", excerpt=None, body_markdown="hi")
    b = compute_source_hash(title="A", excerpt=None, body_markdown="hi")
    assert a == b


def test_compute_source_hash_changes_when_title_changes() -> None:
    base = compute_source_hash(title="Old", excerpt=None, body_markdown="x")
    other = compute_source_hash(title="New", excerpt=None, body_markdown="x")
    assert base != other


def test_compute_source_hash_changes_when_excerpt_changes() -> None:
    base = compute_source_hash(title="t", excerpt=None, body_markdown="x")
    other = compute_source_hash(title="t", excerpt="lead-in", body_markdown="x")
    assert base != other


def test_compute_source_hash_changes_when_body_changes() -> None:
    base = compute_source_hash(title="t", excerpt=None, body_markdown="one")
    other = compute_source_hash(title="t", excerpt=None, body_markdown="two")
    assert base != other


def test_compute_source_hash_returns_64_hex_chars() -> None:
    digest = compute_source_hash(title="t", excerpt=None, body_markdown="b")
    assert len(digest) == 64
    int(digest, 16)  # parse as hex; raises if not hex
```

- [ ] **Step 2: Verify failure**

```bash
cd /d/Projects/Github/traceoflight-dev/.worktrees/site-translations/apps/api
.venv/Scripts/python -m pytest tests/services/test_translation_hash.py -q 2>&1 | tail -5
```

Expected: collection-time `ImportError: cannot import name 'compute_source_hash'`.

- [ ] **Step 3: Write the helper**

Create `apps/api/src/app/services/translation_hash.py`:

```python
"""Deterministic source-hash helper for translation change detection."""

from __future__ import annotations

import hashlib

_FIELD_SEPARATOR = "\x1f"  # ASCII unit separator — never appears in user content


def compute_source_hash(*, title: str, excerpt: str | None, body_markdown: str) -> str:
    """Return a sha256 hex digest over the translatable fields of a post.

    The hash intentionally excludes non-translated fields (cover image, status,
    published_at, etc.) so changes to those fields do NOT trigger re-translation.
    """
    payload = _FIELD_SEPARATOR.join(
        [
            title or "",
            excerpt or "",
            body_markdown or "",
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
.venv/Scripts/python -m pytest tests/services/test_translation_hash.py -q 2>&1 | tail -5
```

Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
cd /d/Projects/Github/traceoflight-dev/.worktrees/site-translations
git add apps/api/src/app/services/translation_hash.py apps/api/tests/services/test_translation_hash.py
git commit -m "feat(api): add deterministic source-hash helper for translation drift detection"
```

---

### Task 5: DeepL translation provider (TDD with mocked SDK)

**Files:**
- Create: `apps/api/src/app/services/deepl_translation_provider.py`
- Create: `apps/api/tests/services/test_deepl_translation_provider.py`

- [ ] **Step 1: Write failing tests**

`apps/api/tests/services/test_deepl_translation_provider.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from unittest.mock import MagicMock

import pytest

from app.services.deepl_translation_provider import (
    DeeplTranslationProvider,
    UnsupportedTargetLocaleError,
)


@dataclass
class _Post:
    title: str
    excerpt: str | None
    body_markdown: str


def _stub_translator(translations: dict[tuple[str, str], str]) -> MagicMock:
    """Return a mock that mimics deepl.Translator.translate_text."""

    def translate_text(text, *, source_lang, target_lang, **_kwargs):
        result = MagicMock()
        result.text = translations[(text, target_lang)]
        return result

    translator = MagicMock()
    translator.translate_text.side_effect = translate_text
    return translator


def test_translate_post_calls_deepl_with_correct_target_codes() -> None:
    translator = _stub_translator(
        {
            ("Hello", "EN-US"): "Hello!",
            ("Lead", "EN-US"): "Lead!",
            ("body", "EN-US"): "Body!",
        }
    )
    provider = DeeplTranslationProvider(api_key="stub", _client=translator)

    result = provider.translate_post(
        _Post(title="Hello", excerpt="Lead", body_markdown="body"),
        target_locale="en",
    )

    assert result == {
        "title": "Hello!",
        "excerpt": "Lead!",
        "body_markdown": "Body!",
    }
    calls = translator.translate_text.call_args_list
    assert len(calls) == 3
    for call in calls:
        assert call.kwargs["source_lang"] == "KO"
        assert call.kwargs["target_lang"] == "EN-US"


def test_translate_post_maps_target_codes_for_each_supported_locale() -> None:
    cases = {
        "en": "EN-US",
        "ja": "JA",
        "zh": "ZH",
    }
    for short, expected_target in cases.items():
        translator = _stub_translator({("t", expected_target): "T"})
        provider = DeeplTranslationProvider(api_key="stub", _client=translator)
        result = provider.translate_post(
            _Post(title="t", excerpt=None, body_markdown="t"),
            target_locale=short,
        )
        assert result is not None
        assert translator.translate_text.call_args.kwargs["target_lang"] == expected_target


def test_translate_post_skips_excerpt_when_none() -> None:
    translator = _stub_translator(
        {("title", "EN-US"): "T", ("body", "EN-US"): "B"}
    )
    provider = DeeplTranslationProvider(api_key="stub", _client=translator)

    result = provider.translate_post(
        _Post(title="title", excerpt=None, body_markdown="body"),
        target_locale="en",
    )

    assert result == {"title": "T", "excerpt": None, "body_markdown": "B"}
    assert translator.translate_text.call_count == 2


def test_translate_post_raises_for_unknown_target_locale() -> None:
    translator = _stub_translator({})
    provider = DeeplTranslationProvider(api_key="stub", _client=translator)

    with pytest.raises(UnsupportedTargetLocaleError):
        provider.translate_post(
            _Post(title="t", excerpt=None, body_markdown="b"),
            target_locale="ko",  # source locale, not a target
        )
```

- [ ] **Step 2: Verify failure**

```bash
.venv/Scripts/python -m pytest tests/services/test_deepl_translation_provider.py -q 2>&1 | tail -5
```

Expected: ImportError on `DeeplTranslationProvider`.

- [ ] **Step 3: Write the provider**

Create `apps/api/src/app/services/deepl_translation_provider.py`:

```python
"""DeepL-backed translation provider conforming to the TranslationProvider Protocol."""

from __future__ import annotations

from typing import Any


_DEEPL_TARGET_BY_LOCALE = {
    "en": "EN-US",
    "ja": "JA",
    "zh": "ZH",
}


class UnsupportedTargetLocaleError(ValueError):
    """Raised when a target locale isn't in the DeepL target map."""


class DeeplTranslationProvider:
    """Adapter around the deepl SDK that translates the three translatable
    fields of a post (title, excerpt, body_markdown). Excerpt is optional.

    The provider expects already-masked markdown for body_markdown — masking
    and unmasking are owned by the worker, not this adapter.
    """

    def __init__(self, api_key: str, *, _client: Any | None = None) -> None:
        if _client is not None:
            self._client = _client
            return
        # Lazy import so that pytest collection doesn't pull the SDK when the
        # provider isn't actually being used.
        import deepl  # type: ignore[import-untyped]

        self._client = deepl.Translator(api_key)

    def translate_post(self, post: Any, target_locale: str) -> dict[str, Any] | None:
        target = _DEEPL_TARGET_BY_LOCALE.get(target_locale)
        if target is None:
            raise UnsupportedTargetLocaleError(
                f"target_locale {target_locale!r} not in {sorted(_DEEPL_TARGET_BY_LOCALE)}"
            )

        title = self._translate(post.title, target)
        excerpt = self._translate(post.excerpt, target) if post.excerpt else None
        body = self._translate(post.body_markdown, target)
        return {
            "title": title,
            "excerpt": excerpt,
            "body_markdown": body,
        }

    def _translate(self, text: str, target_lang: str) -> str:
        result = self._client.translate_text(
            text,
            source_lang="KO",
            target_lang=target_lang,
        )
        return str(result.text)
```

- [ ] **Step 4: Run tests**

```bash
.venv/Scripts/python -m pytest tests/services/test_deepl_translation_provider.py -q 2>&1 | tail -5
```

Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
cd /d/Projects/Github/traceoflight-dev/.worktrees/site-translations
git add apps/api/src/app/services/deepl_translation_provider.py apps/api/tests/services/test_deepl_translation_provider.py
git commit -m "feat(api): add DeepL-backed translation provider"
```

---

### Task 6: Translation queue wrapper (TDD with fakeredis)

**Files:**
- Create: `apps/api/src/app/services/translation_queue.py`
- Create: `apps/api/tests/services/test_translation_queue.py`

- [ ] **Step 1: Write failing tests**

`apps/api/tests/services/test_translation_queue.py`:

```python
from __future__ import annotations

import uuid

import fakeredis
import pytest

from app.services.translation_queue import TranslationQueue


@pytest.fixture
def fake_redis() -> fakeredis.FakeStrictRedis:
    return fakeredis.FakeStrictRedis()


def test_enqueue_translation_job_pushes_to_named_queue(fake_redis) -> None:
    queue = TranslationQueue(connection=fake_redis, name="translations")
    source_id = uuid.uuid4()

    queue.enqueue_translation_job(source_post_id=source_id, target_locale="en")

    # rq stores queue contents at "rq:queue:<name>"
    queued_ids = fake_redis.lrange("rq:queue:translations", 0, -1)
    assert len(queued_ids) == 1


def test_enqueued_job_uses_full_function_path(fake_redis) -> None:
    queue = TranslationQueue(connection=fake_redis, name="translations")
    source_id = uuid.uuid4()

    job = queue.enqueue_translation_job(
        source_post_id=source_id,
        target_locale="ja",
    )

    assert job.func_name == "app.services.translation_worker.translate_post_to_locale"
    assert job.args == (str(source_id), "ja")


def test_enqueue_normalizes_uuid_to_string(fake_redis) -> None:
    """Job args must be JSON-serializable (string), not raw UUID objects."""
    queue = TranslationQueue(connection=fake_redis, name="translations")
    source_id = uuid.uuid4()

    job = queue.enqueue_translation_job(
        source_post_id=source_id,
        target_locale="zh",
    )

    assert isinstance(job.args[0], str)


def test_translation_queue_uses_configured_name(fake_redis) -> None:
    queue = TranslationQueue(connection=fake_redis, name="custom-queue")
    queue.enqueue_translation_job(
        source_post_id=uuid.uuid4(),
        target_locale="en",
    )

    assert fake_redis.llen("rq:queue:custom-queue") == 1
    assert fake_redis.llen("rq:queue:translations") == 0
```

- [ ] **Step 2: Verify failure**

```bash
.venv/Scripts/python -m pytest tests/services/test_translation_queue.py -q 2>&1 | tail -5
```

Expected: ImportError on `TranslationQueue`.

- [ ] **Step 3: Write the queue wrapper**

Create `apps/api/src/app/services/translation_queue.py`:

```python
"""Thin sync wrapper around rq for translation jobs."""

from __future__ import annotations

import uuid
from typing import Any

from rq import Queue
from rq.job import Job

_JOB_FUNC_PATH = "app.services.translation_worker.translate_post_to_locale"


class TranslationQueue:
    """Enqueue translation jobs onto a Redis-backed rq queue.

    Jobs are referenced by their fully-qualified function path so the worker
    process can import them without a shared in-memory registry.
    """

    def __init__(self, *, connection: Any, name: str = "translations") -> None:
        self._queue = Queue(name=name, connection=connection)

    def enqueue_translation_job(
        self,
        *,
        source_post_id: uuid.UUID | str,
        target_locale: str,
    ) -> Job:
        return self._queue.enqueue(
            _JOB_FUNC_PATH,
            str(source_post_id),
            target_locale,
        )
```

- [ ] **Step 4: Run tests**

```bash
.venv/Scripts/python -m pytest tests/services/test_translation_queue.py -q 2>&1 | tail -5
```

Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
cd /d/Projects/Github/traceoflight-dev/.worktrees/site-translations
git add apps/api/src/app/services/translation_queue.py apps/api/tests/services/test_translation_queue.py
git commit -m "feat(api): add TranslationQueue wrapper around rq"
```

---

### Task 7: Translation worker function (TDD)

This task implements `translate_post_to_locale(source_post_id, target_locale)` — the unit of work the rq worker executes per job. It owns mask → translate → unmask, sibling upsert, and hash bookkeeping.

**Files:**
- Create: `apps/api/src/app/services/translation_worker.py`
- Create: `apps/api/tests/services/test_translation_worker.py`

- [ ] **Step 1: Write failing tests**

`apps/api/tests/services/test_translation_worker.py`:

```python
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models.post import (
    Post,
    PostContentKind,
    PostLocale,
    PostStatus,
    PostTranslationSourceKind,
    PostTranslationStatus,
    PostVisibility,
)
from app.services import translation_worker
from app.services.translation_hash import compute_source_hash


@pytest.fixture
def session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        yield db


def _korean_source(db: Session, *, slug: str = "hello", body: str = "안녕") -> Post:
    now = datetime.now(timezone.utc)
    post = Post(
        slug=slug,
        title="안녕하세요",
        excerpt="짧은 발췌",
        body_markdown=body,
        cover_image_url=None,
        content_kind=PostContentKind.BLOG,
        status=PostStatus.PUBLISHED,
        visibility=PostVisibility.PUBLIC,
        locale=PostLocale.KO,
        translation_group_id=uuid.uuid4(),
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
        published_at=now,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return post


class _StubProvider:
    def __init__(self, mapping: dict[str, dict[str, str | None]]) -> None:
        self._mapping = mapping
        self.calls: list[tuple[str, str]] = []

    def translate_post(self, post, target_locale):  # type: ignore[no-untyped-def]
        self.calls.append((post.body_markdown, target_locale))
        return self._mapping[target_locale]


def test_worker_creates_sibling_when_none_exists(session, monkeypatch) -> None:
    source = _korean_source(session)
    provider = _StubProvider(
        {"en": {"title": "Hello", "excerpt": "Lead", "body_markdown": "hi"}}
    )
    monkeypatch.setattr(translation_worker, "_open_session", lambda: session)
    monkeypatch.setattr(translation_worker, "_get_provider", lambda: provider)

    translation_worker.translate_post_to_locale(str(source.id), "en")

    siblings = session.scalars(
        select(Post).where(Post.translation_group_id == source.translation_group_id, Post.locale == PostLocale.EN)
    ).all()
    assert len(siblings) == 1
    sibling = siblings[0]
    assert sibling.title == "Hello"
    assert sibling.excerpt == "Lead"
    assert sibling.body_markdown == "hi"
    assert sibling.slug == source.slug
    assert sibling.translation_status == PostTranslationStatus.SYNCED
    assert sibling.translation_source_kind == PostTranslationSourceKind.MACHINE
    assert sibling.source_post_id == source.id
    assert sibling.translated_from_hash == compute_source_hash(
        title=source.title, excerpt=source.excerpt, body_markdown=source.body_markdown
    )
    assert provider.calls == [(source.body_markdown, "en")]


def test_worker_skips_translation_when_hash_matches(session, monkeypatch) -> None:
    source = _korean_source(session)
    sibling = Post(
        slug=source.slug,
        title="Hello",
        excerpt="Lead",
        body_markdown="hi",
        cover_image_url=source.cover_image_url,
        content_kind=PostContentKind.BLOG,
        status=PostStatus.PUBLISHED,
        visibility=PostVisibility.PUBLIC,
        locale=PostLocale.EN,
        translation_group_id=source.translation_group_id,
        source_post_id=source.id,
        translation_status=PostTranslationStatus.SYNCED,
        translation_source_kind=PostTranslationSourceKind.MACHINE,
        translated_from_hash=compute_source_hash(
            title=source.title,
            excerpt=source.excerpt,
            body_markdown=source.body_markdown,
        ),
        published_at=source.published_at,
    )
    session.add(sibling)
    session.commit()
    provider = _StubProvider({})
    monkeypatch.setattr(translation_worker, "_open_session", lambda: session)
    monkeypatch.setattr(translation_worker, "_get_provider", lambda: provider)

    translation_worker.translate_post_to_locale(str(source.id), "en")

    assert provider.calls == []


def test_worker_re_translates_when_source_body_changed(session, monkeypatch) -> None:
    source = _korean_source(session)
    sibling = Post(
        slug=source.slug,
        title="Hello-old",
        excerpt="Lead-old",
        body_markdown="hi-old",
        cover_image_url=source.cover_image_url,
        content_kind=PostContentKind.BLOG,
        status=PostStatus.PUBLISHED,
        visibility=PostVisibility.PUBLIC,
        locale=PostLocale.EN,
        translation_group_id=source.translation_group_id,
        source_post_id=source.id,
        translation_status=PostTranslationStatus.SYNCED,
        translation_source_kind=PostTranslationSourceKind.MACHINE,
        translated_from_hash="deadbeef" * 8,  # different from current source
        published_at=source.published_at,
    )
    session.add(sibling)
    session.commit()
    provider = _StubProvider(
        {"en": {"title": "Hello-new", "excerpt": "Lead-new", "body_markdown": "hi-new"}}
    )
    monkeypatch.setattr(translation_worker, "_open_session", lambda: session)
    monkeypatch.setattr(translation_worker, "_get_provider", lambda: provider)

    translation_worker.translate_post_to_locale(str(source.id), "en")

    session.refresh(sibling)
    assert sibling.title == "Hello-new"
    assert sibling.body_markdown == "hi-new"
    assert sibling.translated_from_hash == compute_source_hash(
        title=source.title, excerpt=source.excerpt, body_markdown=source.body_markdown
    )


def test_worker_marks_failed_status_when_provider_raises(session, monkeypatch) -> None:
    source = _korean_source(session)

    class _Boom:
        def translate_post(self, *_, **__):
            raise RuntimeError("DeepL transient failure")

    monkeypatch.setattr(translation_worker, "_open_session", lambda: session)
    monkeypatch.setattr(translation_worker, "_get_provider", lambda: _Boom())

    with pytest.raises(RuntimeError):
        translation_worker.translate_post_to_locale(str(source.id), "ja")

    siblings = session.scalars(
        select(Post).where(Post.translation_group_id == source.translation_group_id, Post.locale == PostLocale.JA)
    ).all()
    assert len(siblings) == 1
    assert siblings[0].translation_status == PostTranslationStatus.FAILED


def test_worker_copies_non_translated_fields_from_source(session, monkeypatch) -> None:
    source = _korean_source(session)
    source.cover_image_url = "https://example/cover.jpg"
    source.series_title = "MySeries"
    session.commit()
    provider = _StubProvider(
        {"ja": {"title": "T", "excerpt": "E", "body_markdown": "B"}}
    )
    monkeypatch.setattr(translation_worker, "_open_session", lambda: session)
    monkeypatch.setattr(translation_worker, "_get_provider", lambda: provider)

    translation_worker.translate_post_to_locale(str(source.id), "ja")

    sibling = session.scalars(
        select(Post).where(Post.translation_group_id == source.translation_group_id, Post.locale == PostLocale.JA)
    ).one()
    assert sibling.cover_image_url == "https://example/cover.jpg"
    assert sibling.series_title == "MySeries"
    assert sibling.published_at == source.published_at
    assert sibling.status == PostStatus.PUBLISHED
    assert sibling.visibility == PostVisibility.PUBLIC


def test_worker_no_ops_when_source_is_not_korean(session, monkeypatch) -> None:
    source = _korean_source(session)
    source.locale = PostLocale.EN
    session.commit()
    provider = _StubProvider({})
    monkeypatch.setattr(translation_worker, "_open_session", lambda: session)
    monkeypatch.setattr(translation_worker, "_get_provider", lambda: provider)

    translation_worker.translate_post_to_locale(str(source.id), "ja")

    assert provider.calls == []
    siblings = session.scalars(
        select(Post).where(Post.translation_group_id == source.translation_group_id, Post.locale == PostLocale.JA)
    ).all()
    assert siblings == []
```

- [ ] **Step 2: Verify failure**

```bash
.venv/Scripts/python -m pytest tests/services/test_translation_worker.py -q 2>&1 | tail -5
```

Expected: ImportError on `translation_worker`.

- [ ] **Step 3: Write the worker**

Create `apps/api/src/app/services/translation_worker.py`:

```python
"""rq job function: translate one Korean source post into one target locale."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.post import (
    Post,
    PostLocale,
    PostTranslationSourceKind,
    PostTranslationStatus,
)
from app.services.post_translation_markdown import (
    mask_markdown_translation_segments,
    unmask_markdown_translation_segments,
)
from app.services.translation_hash import compute_source_hash
from app.services.translation_provider import (
    NoopTranslationProvider,
    TranslationProvider,
)


_LOCALE_BY_KEY = {
    "en": PostLocale.EN,
    "ja": PostLocale.JA,
    "zh": PostLocale.ZH,
}


def _open_session() -> Session:
    return SessionLocal()


def _get_provider() -> TranslationProvider:
    """Return the configured provider. Lazily import the DeepL adapter so
    test contexts that don't need it don't pay the SDK import cost."""
    if not settings.deepl_api_key:
        return NoopTranslationProvider()
    from app.services.deepl_translation_provider import DeeplTranslationProvider

    return DeeplTranslationProvider(api_key=settings.deepl_api_key)


def translate_post_to_locale(source_post_id: str, target_locale: str) -> None:
    """rq job: ensure the (source_post, target_locale) sibling row is in
    sync with the source. If translation is needed, call the provider; if
    only metadata changed, skip the provider but still re-sync.

    On provider failure, mark the sibling row's translation_status='failed'
    and re-raise so rq can retain the failure for retry.
    """

    target_locale_enum = _LOCALE_BY_KEY.get(target_locale)
    if target_locale_enum is None:
        raise ValueError(f"unsupported target locale {target_locale!r}")

    db = _open_session()
    try:
        source = db.scalar(select(Post).where(Post.id == uuid.UUID(source_post_id)))
        if source is None:
            return  # source was deleted; nothing to do
        if source.locale != PostLocale.KO or source.source_post_id is not None:
            return  # not a Korean source row; ignore

        sibling = db.scalar(
            select(Post).where(
                Post.translation_group_id == source.translation_group_id,
                Post.locale == target_locale_enum,
            )
        )
        source_hash = compute_source_hash(
            title=source.title,
            excerpt=source.excerpt,
            body_markdown=source.body_markdown,
        )

        needs_translation = (
            sibling is None
            or sibling.translation_status == PostTranslationStatus.FAILED
            or sibling.translated_from_hash != source_hash
        )

        try:
            if needs_translation:
                translated = _translate(source, target_locale)
                if translated is None:
                    # Provider declined (e.g. NoopTranslationProvider). Don't
                    # leave a half-built sibling row behind.
                    return
            else:
                translated = None

            sibling = _upsert_sibling(
                db,
                source=source,
                sibling=sibling,
                target_locale_enum=target_locale_enum,
                translated_fields=translated,
                source_hash=source_hash,
            )
            db.commit()
        except Exception:
            db.rollback()
            _mark_failed(
                db,
                source=source,
                target_locale_enum=target_locale_enum,
                source_hash=source_hash,
            )
            db.commit()
            raise
    finally:
        db.close()


def _translate(source: Post, target_locale: str) -> dict[str, Any] | None:
    masked_body = mask_markdown_translation_segments(source.body_markdown or "")

    class _MaskedView:
        title = source.title
        excerpt = source.excerpt
        body_markdown = masked_body.text

    provider = _get_provider()
    result = provider.translate_post(_MaskedView(), target_locale)
    if result is None:
        return None
    body = result.get("body_markdown", "") or ""
    if masked_body.replacements:
        body = unmask_markdown_translation_segments(body, masked_body.replacements)
    return {
        "title": result.get("title", "") or "",
        "excerpt": result.get("excerpt"),
        "body_markdown": body,
    }


def _upsert_sibling(
    db: Session,
    *,
    source: Post,
    sibling: Post | None,
    target_locale_enum: PostLocale,
    translated_fields: dict[str, Any] | None,
    source_hash: str,
) -> Post:
    if sibling is None:
        sibling = Post(
            slug=source.slug,
            locale=target_locale_enum,
            translation_group_id=source.translation_group_id,
            source_post_id=source.id,
            translation_source_kind=PostTranslationSourceKind.MACHINE,
        )
        db.add(sibling)

    # Always keep non-translated fields in sync with the source row.
    sibling.cover_image_url = source.cover_image_url
    sibling.top_media_kind = source.top_media_kind
    sibling.top_media_image_url = source.top_media_image_url
    sibling.top_media_youtube_url = source.top_media_youtube_url
    sibling.top_media_video_url = source.top_media_video_url
    sibling.series_title = source.series_title
    sibling.content_kind = source.content_kind
    sibling.status = source.status
    sibling.visibility = source.visibility
    sibling.published_at = source.published_at

    if translated_fields is not None:
        sibling.title = translated_fields["title"]
        sibling.excerpt = translated_fields["excerpt"]
        sibling.body_markdown = translated_fields["body_markdown"]
        sibling.translated_from_hash = source_hash
        sibling.translation_status = PostTranslationStatus.SYNCED
    elif sibling.translated_from_hash != source_hash:
        # Hash mismatch but no translation requested means the worker
        # decided to skip; record the source hash so subsequent runs don't
        # endlessly try to re-translate when the provider is Noop.
        sibling.translated_from_hash = source_hash
    return sibling


def _mark_failed(
    db: Session,
    *,
    source: Post,
    target_locale_enum: PostLocale,
    source_hash: str,
) -> None:
    """Idempotently mark the sibling row failed, creating a placeholder if
    the original transaction never committed it."""
    sibling = db.scalar(
        select(Post).where(
            Post.translation_group_id == source.translation_group_id,
            Post.locale == target_locale_enum,
        )
    )
    if sibling is None:
        sibling = Post(
            slug=source.slug,
            locale=target_locale_enum,
            translation_group_id=source.translation_group_id,
            source_post_id=source.id,
            title=source.title,
            excerpt=source.excerpt,
            body_markdown=source.body_markdown,
            cover_image_url=source.cover_image_url,
            top_media_kind=source.top_media_kind,
            top_media_image_url=source.top_media_image_url,
            top_media_youtube_url=source.top_media_youtube_url,
            top_media_video_url=source.top_media_video_url,
            series_title=source.series_title,
            content_kind=source.content_kind,
            status=source.status,
            visibility=source.visibility,
            published_at=source.published_at,
            translation_source_kind=PostTranslationSourceKind.MACHINE,
        )
        db.add(sibling)
    sibling.translation_status = PostTranslationStatus.FAILED
```

A small note on the `_MaskedView` shim: the provider Protocol takes a duck-typed object exposing `title`, `excerpt`, `body_markdown`. We don't want to mutate the live source ORM instance, so we hand the provider a tiny anonymous view. The tests use a similar `_Post` dataclass.

- [ ] **Step 4: Run tests**

```bash
.venv/Scripts/python -m pytest tests/services/test_translation_worker.py -q 2>&1 | tail -10
```

Expected: `6 passed`.

- [ ] **Step 5: Run full backend suite**

```bash
.venv/Scripts/python -m pytest -q 2>&1 | tail -10
```

Expected: 171 (baseline) + 5 (Task 4) + 4 (Task 5) + 4 (Task 6) + 6 (Task 7) ≈ 190 passed, 0 failures.

- [ ] **Step 6: Commit**

```bash
cd /d/Projects/Github/traceoflight-dev/.worktrees/site-translations
git add apps/api/src/app/services/translation_worker.py apps/api/tests/services/test_translation_worker.py
git commit -m "feat(api): translation worker upserts sibling rows with hash-gated re-translation"
```

---

### Task 8: Wire `PostTranslationService` to enqueue jobs (replace direct provider call)

**Files:**
- Modify: `apps/api/src/app/services/post_translation_service.py`
- Modify: `apps/api/tests/services/test_post_translation_service.py` (loosen / replace assertions)
- Modify: `apps/api/tests/services/test_post_service_translation_sync.py` (replace `_RepoStub` translation expectation)

- [ ] **Step 1: Read the current `PostTranslationService` and the existing tests**

```bash
cd /d/Projects/Github/traceoflight-dev/.worktrees/site-translations
sed -n '1,60p' apps/api/src/app/services/post_translation_service.py
sed -n '1,80p' apps/api/tests/services/test_post_translation_service.py
sed -n '1,80p' apps/api/tests/services/test_post_service_translation_sync.py
```

The current implementation calls the provider directly inside `sync_source_post`. We're replacing the provider arg with an optional queue arg, and the service becomes a thin "decide-to-enqueue" coordinator.

- [ ] **Step 2: Rewrite `apps/api/src/app/services/post_translation_service.py`**

```python
"""Coordinator: when a Korean source post is created/updated, enqueue one
translation job per target locale onto the translation queue. The worker
owns the actual translation."""

from __future__ import annotations

from typing import Any

TARGET_TRANSLATION_LOCALES = ("en", "ja", "zh")


class PostTranslationService:
    def __init__(self, queue: Any | None = None) -> None:
        self.queue = queue

    def sync_source_post(self, post) -> list[Any]:  # type: ignore[no-untyped-def]
        if self.queue is None:
            return []
        locale = str(getattr(post, "locale", "") or "").strip().lower()
        source_post_id = getattr(post, "source_post_id", None)
        if locale != "ko" or source_post_id is not None:
            return []

        jobs: list[Any] = []
        for target_locale in TARGET_TRANSLATION_LOCALES:
            jobs.append(
                self.queue.enqueue_translation_job(
                    source_post_id=getattr(post, "id"),
                    target_locale=target_locale,
                )
            )
        return jobs
```

Note: `PostTranslationService` no longer touches markdown masking (that's the worker's job). It also no longer accepts `provider`. Update tests accordingly.

- [ ] **Step 3: Update `tests/services/test_post_translation_service.py`**

Replace the existing test body with queue-focused assertions. Open the file and rewrite the tests so they use a stub queue:

```python
from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from app.services.post_translation_service import (
    PostTranslationService,
    TARGET_TRANSLATION_LOCALES,
)


@dataclass
class _Post:
    id: Any
    locale: str
    source_post_id: Any | None = None
    title: str = "t"
    excerpt: str | None = None
    body_markdown: str = "b"


class _StubQueue:
    def __init__(self) -> None:
        self.calls: list[tuple[Any, str]] = []

    def enqueue_translation_job(self, *, source_post_id, target_locale):
        self.calls.append((source_post_id, target_locale))
        return ("enqueued", source_post_id, target_locale)


def test_sync_source_post_enqueues_one_job_per_target_locale() -> None:
    queue = _StubQueue()
    svc = PostTranslationService(queue=queue)
    post = _Post(id=uuid.uuid4(), locale="ko")

    result = svc.sync_source_post(post)

    assert len(result) == len(TARGET_TRANSLATION_LOCALES)
    assert [target for (_id, target) in queue.calls] == list(TARGET_TRANSLATION_LOCALES)
    for source_id, _target in queue.calls:
        assert source_id == post.id


def test_sync_source_post_skips_non_korean_locale() -> None:
    queue = _StubQueue()
    svc = PostTranslationService(queue=queue)
    post = _Post(id=uuid.uuid4(), locale="en")

    result = svc.sync_source_post(post)

    assert result == []
    assert queue.calls == []


def test_sync_source_post_skips_translated_variants() -> None:
    queue = _StubQueue()
    svc = PostTranslationService(queue=queue)
    post = _Post(id=uuid.uuid4(), locale="ko", source_post_id=uuid.uuid4())

    result = svc.sync_source_post(post)

    assert result == []
    assert queue.calls == []


def test_sync_source_post_with_no_queue_is_noop() -> None:
    svc = PostTranslationService(queue=None)
    post = _Post(id=uuid.uuid4(), locale="ko")
    result = svc.sync_source_post(post)
    assert result == []
```

- [ ] **Step 4: Update `tests/services/test_post_service_translation_sync.py`**

The existing tests (from the core plan) assert that `PostService.create_post` invokes `PostTranslationService.sync_source_post(post)`. Those assertions stay valid — change only the `PostTranslationService` stub setup so it accepts `queue=` instead of `provider=`. The `_RepoStub` `_DbStub` shim added by the core plan also stays.

Open the file and update the construction sites of `PostTranslationService(...)` to `PostTranslationService(queue=...)`. If the test relies on `MagicMock` for the service, that mock's contract is a no-op `sync_source_post(post)` — should already work. If you used a real `PostTranslationService` with a real `provider=Noop()`, replace with a stub queue so the test still observes the call shape.

If the existing tests in this file are happy with a `MagicMock(spec=PostTranslationService)`, no edits are needed — verify by running the tests below.

- [ ] **Step 5: Update `apps/api/src/app/api/deps.py`**

Replace the existing `get_post_service` provider wiring with queue wiring:

```python
from redis import Redis

from app.services.post_translation_service import PostTranslationService
from app.services.translation_queue import TranslationQueue


_redis_client: Redis | None = None
_translation_queue: TranslationQueue | None = None


def _get_translation_queue() -> TranslationQueue | None:
    global _redis_client, _translation_queue
    if _translation_queue is not None:
        return _translation_queue
    try:
        _redis_client = Redis.from_url(settings.redis_url)
        # Smoke ping; if Redis isn't reachable, fall back to no queue rather
        # than failing every post-create request.
        _redis_client.ping()
    except Exception:
        return None
    _translation_queue = TranslationQueue(
        connection=_redis_client,
        name=settings.redis_queue_name,
    )
    return _translation_queue


def get_post_service(db: Session = Depends(get_db)) -> PostService:
    return PostService(
        repo=PostRepository(db),
        translation_service=PostTranslationService(queue=_get_translation_queue()),
    )
```

Remove the `NoopTranslationProvider` import and the per-request provider construction; both are dead code now (the worker uses `_get_provider` from `translation_worker.py` instead).

- [ ] **Step 6: Run focused tests**

```bash
cd /d/Projects/Github/traceoflight-dev/.worktrees/site-translations/apps/api
.venv/Scripts/python -m pytest tests/services/test_post_translation_service.py tests/services/test_post_service_translation_sync.py -q 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 7: Run full backend suite**

```bash
.venv/Scripts/python -m pytest -q 2>&1 | tail -10
```

Expected: same total minus any tests previously asserting the now-removed `provider` arg, plus the rewritten queue assertions. Net should still be 0 failures.

- [ ] **Step 8: Commit**

```bash
cd /d/Projects/Github/traceoflight-dev/.worktrees/site-translations
git add apps/api/src/app/services/post_translation_service.py apps/api/tests/services/test_post_translation_service.py apps/api/tests/services/test_post_service_translation_sync.py apps/api/src/app/api/deps.py
git commit -m "feat(api): PostTranslationService now enqueues jobs onto translation queue"
```

---

### Task 9: Add the worker service to docker-compose

**Files:**
- Modify: `infra/docker/api/docker-compose.yml`

- [ ] **Step 1: Read the current compose**

```bash
cd /d/Projects/Github/traceoflight-dev/.worktrees/site-translations
sed -n '1,40p' infra/docker/api/docker-compose.yml
```

Confirm the existing `api` service uses `build: ../../../apps/api` and depends on `postgres`, `redis`, `minio`. The new `translation-worker` mirrors most of that, but its command is `rq worker translations`.

- [ ] **Step 2: Append the new service definition**

Insert into `services:` (logical grouping near `api`):

```yaml
  translation-worker:
    build:
      context: ../../../apps/api
      dockerfile: Dockerfile
    container_name: traceoflight-translation-worker
    restart: unless-stopped
    env_file:
      - ../../../apps/api/.env.api
    environment:
      POSTGRES_HOST: postgres
      POSTGRES_PORT: ${POSTGRES_PORT}
      REDIS_URL: redis://redis:${REDIS_PORT}/0
    command:
      - rq
      - worker
      - translations
      - --url
      - redis://redis:${REDIS_PORT}/0
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    networks:
      - api_internal
```

(Match the indentation, env conventions, and network membership of the surrounding services.)

- [ ] **Step 3: Validate compose syntax**

```bash
cd /d/Projects/Github/traceoflight-dev/.worktrees/site-translations/infra/docker/api
docker compose config --quiet 2>&1 | tail -5
```

Expected: no output (or quiet success). If `command` syntax errors, fix and re-run.

- [ ] **Step 4: Commit**

```bash
cd /d/Projects/Github/traceoflight-dev/.worktrees/site-translations
git add infra/docker/api/docker-compose.yml
git commit -m "build(infra): add rq translation-worker service to docker compose"
```

---

### Task 10: End-to-end live verification

This task verifies the full pipeline against a running Postgres + Redis + (mocked or real) DeepL.

**Prerequisites:** the user supplies the DeepL API key in `apps/api/.env.api`. If they prefer not to spend free-tier credits during plan validation, set the key to a sentinel like `mock-key` and the worker will use NoopTranslationProvider (which means siblings will never be created — useful for verifying the queue + worker plumbing without DeepL traffic).

- [ ] **Step 1: Start the test Postgres + Redis**

If the user has the full stack, `docker compose up postgres redis -d` from `infra/docker/api/`. Otherwise, the standalone test container from Task 3 plus a one-off Redis:

```bash
docker run -d --name translations-redis-test -p 6379:6379 redis:7-alpine
```

- [ ] **Step 2: Migrate the DB**

```bash
cd /d/Projects/Github/traceoflight-dev/.worktrees/site-translations/apps/api
POSTGRES_HOST=localhost POSTGRES_PORT=5436 POSTGRES_USER=traceoflight POSTGRES_PASSWORD=traceoflight POSTGRES_DB=traceoflight \
ADMIN_SESSION_SECRET=test ADMIN_LOGIN_ID=test ADMIN_LOGIN_PASSWORD_HASH=test \
DEEPL_API_KEY="${DEEPL_API_KEY:-}" REDIS_URL=redis://localhost:6379/0 \
.venv/Scripts/python -m alembic upgrade head
```

(If migration 0008 still hits the same-transaction-enum issue on this fresh DB, restore from a backup or use the workaround `transaction_per_migration = True` in `env.py` temporarily — this is unchanged from the core plan.)

Verify all five locale columns exist via `\d posts`.

- [ ] **Step 3: Boot the API and the worker locally**

In one shell:
```bash
cd /d/Projects/Github/traceoflight-dev/.worktrees/site-translations/apps/api
POSTGRES_HOST=localhost POSTGRES_PORT=5436 POSTGRES_USER=traceoflight POSTGRES_PASSWORD=traceoflight POSTGRES_DB=traceoflight \
ADMIN_SESSION_SECRET=test ADMIN_LOGIN_ID=test ADMIN_LOGIN_PASSWORD_HASH=test \
DEEPL_API_KEY="$DEEPL_API_KEY" REDIS_URL=redis://localhost:6379/0 \
.venv/Scripts/python -m uvicorn app.main:app --port 8000
```

In another shell:
```bash
cd /d/Projects/Github/traceoflight-dev/.worktrees/site-translations/apps/api
POSTGRES_HOST=localhost POSTGRES_PORT=5436 POSTGRES_USER=traceoflight POSTGRES_PASSWORD=traceoflight POSTGRES_DB=traceoflight \
ADMIN_SESSION_SECRET=test ADMIN_LOGIN_ID=test ADMIN_LOGIN_PASSWORD_HASH=test \
DEEPL_API_KEY="$DEEPL_API_KEY" REDIS_URL=redis://localhost:6379/0 \
.venv/Scripts/rq worker translations --url redis://localhost:6379/0
```

Expected: API listens on :8000; worker prints `*** Listening on translations...`.

- [ ] **Step 4: Create a Korean post via API**

```bash
curl -s -X POST http://localhost:8000/api/v1/web-service/posts \
  -H "Content-Type: application/json" \
  -H "X-Internal-Api-Secret: <secret>" \
  -d '{"slug":"smoke-test","title":"안녕하세요","excerpt":"인사","body_markdown":"# 본문\n\n안녕!","status":"published","visibility":"public","locale":"ko","tags":[]}'
```

Expected response: 201 with the Korean post payload.

- [ ] **Step 5: Watch the worker pick up jobs**

Worker shell should log three jobs: `translate_post_to_locale('<id>', 'en')`, `(..., 'ja')`, `(..., 'zh')`. Each completes (or fails if no DeepL key — they'd no-op via Noop).

- [ ] **Step 6: Verify sibling rows**

```bash
docker exec translations-pg-test psql -U traceoflight -d traceoflight \
  -c "SELECT slug, locale, translation_status, LEFT(title, 30) AS title FROM posts WHERE slug='smoke-test' ORDER BY locale;"
```

Expected (with real DeepL key):
```
   slug    | locale | translation_status |        title
-----------+--------+--------------------+----------------------
 smoke-test| en     | synced             | Hello
 smoke-test| ja     | synced             | こんにちは
 smoke-test| ko     | source             | 안녕하세요
 smoke-test| zh     | synced             | 你好
```

(Without a DeepL key: only `ko` row, `en/ja/zh` rows absent — provider returned None, worker skipped sibling creation.)

- [ ] **Step 7: Verify hash short-circuit on second save**

PUT the post with the **same** body:

```bash
curl -s -X PUT http://localhost:8000/api/v1/web-service/posts/smoke-test \
  -H "Content-Type: application/json" \
  -H "X-Internal-Api-Secret: <secret>" \
  -d '{"slug":"smoke-test","title":"안녕하세요","excerpt":"인사","body_markdown":"# 본문\n\n안녕!","status":"published","visibility":"public","locale":"ko","tags":[]}'
```

Worker shell shows three jobs queued. With real DeepL key: the `_translate` step is skipped because hash matches; the worker logs reflect "skip translation" or you observe DeepL request count unchanged via your DeepL dashboard. Without a key: jobs no-op as before.

- [ ] **Step 8: Verify re-translation when body changes**

PUT again with edited body:

```bash
curl -s -X PUT http://localhost:8000/api/v1/web-service/posts/smoke-test \
  -H "Content-Type: application/json" \
  -H "X-Internal-Api-Secret: <secret>" \
  -d '{"slug":"smoke-test","title":"안녕하세요","excerpt":"인사","body_markdown":"# 본문\n\n안녕! (수정됨)","status":"published","visibility":"public","locale":"ko","tags":[]}'
```

With real DeepL: en/ja/zh sibling bodies update; `translated_from_hash` updates; status remains `synced`.

- [ ] **Step 9: Verify the failure path manually (optional, real DeepL only)**

Temporarily set `DEEPL_API_KEY=invalid` for the worker, restart the worker, save another post. Expected: worker logs the error, sibling rows for that source land with `translation_status='failed'`, rq's failed registry shows the jobs. Restore the real key and save the post again — siblings flip to `synced`.

- [ ] **Step 10: Tear down**

```bash
docker stop translations-pg-test translations-redis-test 2>/dev/null
docker rm translations-pg-test translations-redis-test 2>/dev/null
```

- [ ] **Step 11: No commits in this task**

This task is verification only — nothing changes in the repo. Note any findings (DeepL output quality, latency, edge cases) in the report.

---

### Task 11: Documentation pass

**Files:**
- Modify: `docs/plans/site-translations-design.md` — append a "Provider integration (delivered)" section noting the rq + DeepL choice, the hash-based skip, and the failure surface
- Modify: `README.md` — add a one-paragraph "Translations" section under "Apps" pointing readers at the design doc

- [ ] **Step 1: Append to `docs/plans/site-translations-design.md`**

After the existing "Rollout" section, add:

```markdown
## Provider integration (delivered)

The translation seam from the core rollout is now backed by:

- `DeeplTranslationProvider` (deepl SDK, ko → en/ja/zh)
- `TranslationQueue` (rq on Redis, queue name `translations`)
- `translate_post_to_locale` worker job (one row per target locale)
- sha256 `translated_from_hash` on translated rows for change detection

Source-post create/update enqueues three jobs (en, ja, zh). The worker
skips the DeepL call when the source's translatable-field hash matches the
sibling's stored hash, but always re-syncs non-translated metadata
(cover image, status, published_at, series_title).

Failure surface: provider errors mark the corresponding sibling row's
translation_status='failed' and re-raise so rq retains the job in its
failed registry. The next source-save retries automatically because hash
mismatch and `failed` status both bypass the skip path.
```

- [ ] **Step 2: Add a section to README.md**

Under the existing "Apps" bullet list in `README.md`:

```markdown
## Translations

The site is multi-locale (ko/en/ja/zh). Korean posts are the source of truth;
en/ja/zh siblings are auto-generated via DeepL by a background `rq` worker.
Set `DEEPL_API_KEY` in `apps/api/.env.api` to enable translation; without a
key, the API still serves Korean content unchanged.

Design: `docs/plans/site-translations-design.md`.
```

- [ ] **Step 3: Commit**

```bash
cd /d/Projects/Github/traceoflight-dev/.worktrees/site-translations
git add docs/plans/site-translations-design.md README.md
git commit -m "docs: describe provider integration and translation env"
```

---

## Self-review checklist (run before handoff)

- [ ] Provider Protocol unchanged: `DeeplTranslationProvider.translate_post(post, target_locale)` returns `dict | None`, matching `NoopTranslationProvider`.
- [ ] `compute_source_hash` only hashes translatable fields (title, excerpt, body_markdown). Cover image / status / published_at changes do NOT trigger re-translation but DO get synced to siblings via `_upsert_sibling`.
- [ ] `translation_worker.translate_post_to_locale` is importable as a module-level function (no closures, no decorators) so rq can call it.
- [ ] `TranslationQueue.enqueue_translation_job` stringifies UUIDs (rq's job args must be JSON-serializable).
- [ ] Migration chain: 0013 → 0014 → 0015. Each migration's `down_revision` matches the prior `revision`.
- [ ] Slug constraint name in migration 0015 matches the live constraint (verified in Task 3 step 1).
- [ ] `deps.py` falls back to no-queue when Redis is unreachable (so a misconfigured dev environment doesn't break post creation).
- [ ] `worker._get_provider` returns `NoopTranslationProvider` when `DEEPL_API_KEY` is unset, so the same image runs in dev/CI without secret material.
- [ ] No DeepL API key is committed anywhere — only `.env.api.example` template referenced.
- [ ] `apps/api/tests/services/__init__.py` exists; new test files are discovered automatically.
- [ ] Web side requires no changes for this plan (sitemap and routes already handle the case where some siblings exist; `LanguageToggle` will start showing once siblings are produced).

---

## Risks and follow-ups

- **Worker session lifecycle**: each job opens a fresh `SessionLocal()`. For high job volume this would be wasteful; for personal-blog volume it's fine. If we ever switch to a persistent worker connection pool, revisit `_open_session()`.
- **Idempotency under retries**: the worker's upsert uses model identity by `(translation_group_id, target_locale)`. If two retries race (shouldn't happen with default rq concurrency=1), the composite UNIQUE on `(slug, locale)` would surface a conflict — by design, rather than silent data corruption.
- **Slug collisions across translation groups**: if a Korean post `foo` exists and another Korean post in a different group also wants slug `foo`, the `(slug, locale)` UNIQUE prevents that. Same as before — slug uniqueness within `ko` is preserved.
- **Markdown corner cases**: DeepL occasionally re-orders inline elements. The mask/unmask round-trip handles fences, links, images, bare URLs, but not (e.g.) custom Astro components. Re-test if the writer adds new MDX-style syntax.
- **Source post deletion**: existing FK `ON DELETE SET NULL` on `source_post_id` keeps siblings around but unlinks them. Future enhancement: a periodic cleanup job that removes siblings whose source has been gone for N days. Out of scope here.
- **DeepL Free 500K char/month cap**: a save-edit cycle that flips `body_markdown` triggers full re-translation. Heavy editing on long posts could approach the cap. Surface a usage indicator on the admin page in a follow-up if needed; for now the user can monitor via DeepL dashboard.
