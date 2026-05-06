# Backup V3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `backup-v2` archive/restore with a `backup-v3` schema that captures the full site state (minus AdminCredential), preserving locale/translation linkage, comments, site profile, and all currently-missing fields. Drop v1/v2 reader compatibility.

**Architecture:** New `apps/api/src/app/services/imports/backup/` subpackage owns schema constants, per-entity serialize/deserialize, hybrid ZIP layout, and the restore coordinator. Old `backup_archive.py` / `backup_restore.py` are deleted at the end. Public entry points on `ImportService` (`download_posts_backup`, `load_posts_backup`) keep their signatures so router and frontend don't change. Restore is destructive (wipe → insert) inside a single SQLAlchemy transaction; `rebuild_series_projection_cache()` is **not** called post-restore (it would regenerate explicit `SeriesPost` rows).

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy ORM, pytest, ZIP archive metadata.

**Spec:** `docs/plans/backup-v3-design.md`.

**Working branch:** `feat/backup-v3` (worktree at `.worktrees/backup-v3`). Run pytest from `apps/api/` with `.venv\Scripts\python -m pytest ...` (Windows) or `.venv/bin/python -m pytest ...` (POSIX).

---

## File map

**New files (under `apps/api/src/app/services/imports/backup/`):**

| File | Responsibility |
|---|---|
| `__init__.py` | Public re-exports: `BACKUP_SCHEMA_VERSION`, `BackupBundle`, `PostEntry`, `build_backup_zip`, `parse_backup_zip`, `BackupRestoreCoordinator`. |
| `schema.py` | Version string, ZIP path constants and helpers (`post_dir`, `series_path`, `db_file`). |
| `bundle.py` | `BackupBundle` and `PostEntry` dataclasses (in-memory shape passed between serialize/archive/restore). |
| `serialize.py` | Pure functions: SQLAlchemy model instance → dict, plus `collect_bundle(db, storage)` that reads the DB and returns a `BackupBundle`. |
| `deserialize.py` | Pure functions: dict → SQLAlchemy model instance (without adding to session). |
| `archive.py` | `build_backup_zip(bundle) -> bytes`, `parse_backup_zip(bytes) -> BackupBundle` (with validation). |
| `restore.py` | `BackupRestoreCoordinator` (media staging + DB wipe/insert + rollback). |

**Modified files:**

| File | Change |
|---|---|
| `apps/api/src/app/services/imports/__init__.py` | Re-export new public API; drop v2 names. |
| `apps/api/src/app/services/import_service.py` | `download_posts_backup` and `load_posts_backup` switched to new pipeline; drop `rebuild_series_projection_cache()` call. |
| `apps/api/tests/services/test_import_archive_modules.py` | Rewrite tests against v3 roundtrip; assert v1/v2 rejection. |
| `apps/api/tests/services/test_backup_restore.py` | Rewrite tests against v3 restore (locale, comments, site profile, media owner link, etc.). |
| `apps/api/tests/api/test_imports_api.py` | Update e2e smoke to v3 ZIP shape. |

**Deleted files:**

| File | Why |
|---|---|
| `apps/api/src/app/services/imports/backup_archive.py` | Superseded by `backup/archive.py`. |
| `apps/api/src/app/services/imports/backup_restore.py` | Superseded by `backup/restore.py`. |
| `apps/api/src/app/services/imports/models.py` | `SnapshotBundle` is v2-shaped; v3 uses `BackupBundle`/`PostEntry` in `bundle.py`. Helpers (`normalize_slug`, `normalize_tags`, `parse_datetime`, `to_iso_utc`) move to `backup/_text.py` or stay in this file if non-backup callers exist. |

**Untouched (importing modules retain access via `services/imports/`):**
- `errors.py`, `media_refs.py` keep their current role.
- Router `apps/api/src/app/api/v1/endpoints/imports.py` and frontend `apps/web/src/components/public/BackupRestoreSection.tsx` are unchanged.

---

## Common test setup

All tests in `apps/api/tests/services/test_backup_restore.py` and `test_import_archive_modules.py` use this in-memory fixture pattern (already established in the existing files — keep it):

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db.base import Base

def _session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)()
```

`_StorageStub` (already in `test_backup_restore.py`) is reused for storage interactions. Tests run with `cd apps/api && .venv\Scripts\python -m pytest tests/services/test_backup_restore.py -q` (or POSIX equivalent).

---

### Task 1: Create backup subpackage skeleton with schema constants

**Files:**
- Create: `apps/api/src/app/services/imports/backup/__init__.py`
- Create: `apps/api/src/app/services/imports/backup/schema.py`
- Create: `apps/api/src/app/services/imports/backup/bundle.py`
- Test: `apps/api/tests/services/test_import_archive_modules.py`

- [ ] **Step 1: Write the failing test**

Add at the top of `test_import_archive_modules.py` (keep existing v2 tests for now):

```python
def test_backup_v3_schema_version_constant_exists() -> None:
    from app.services.imports.backup.schema import BACKUP_SCHEMA_VERSION
    assert BACKUP_SCHEMA_VERSION == "backup-v3"


def test_backup_v3_bundle_dataclass_has_all_entity_lists() -> None:
    from app.services.imports.backup.bundle import BackupBundle, PostEntry
    assert PostEntry.__dataclass_fields__.keys() >= {"meta", "body_markdown"}
    expected_fields = {
        "site_profile",
        "tags",
        "post_tags",
        "media_assets",
        "media_bytes",
        "posts",
        "series",
        "series_posts",
        "post_comments",
        "generated_at",
    }
    assert BackupBundle.__dataclass_fields__.keys() == expected_fields
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && .venv\Scripts\python -m pytest tests/services/test_import_archive_modules.py::test_backup_v3_schema_version_constant_exists tests/services/test_import_archive_modules.py::test_backup_v3_bundle_dataclass_has_all_entity_lists -q`

Expected: FAIL with `ModuleNotFoundError: app.services.imports.backup`.

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/app/services/imports/backup/__init__.py`:

```python
from app.services.imports.backup.schema import BACKUP_SCHEMA_VERSION
from app.services.imports.backup.bundle import BackupBundle, PostEntry

__all__ = ["BACKUP_SCHEMA_VERSION", "BackupBundle", "PostEntry"]
```

`apps/api/src/app/services/imports/backup/schema.py`:

```python
from __future__ import annotations

BACKUP_SCHEMA_VERSION = "backup-v3"

MANIFEST_PATH = "manifest.json"
DB_DIR = "db"
POSTS_DIR = "posts"
SERIES_DIR = "series"
MEDIA_DIR = "media"

DB_TAGS_PATH = f"{DB_DIR}/tags.json"
DB_POST_TAGS_PATH = f"{DB_DIR}/post_tags.json"
DB_SERIES_POSTS_PATH = f"{DB_DIR}/series_posts.json"
DB_POST_COMMENTS_PATH = f"{DB_DIR}/post_comments.json"
DB_SITE_PROFILE_PATH = f"{DB_DIR}/site_profile.json"
DB_MEDIA_ASSETS_PATH = f"{DB_DIR}/media_assets.json"


def post_meta_path(translation_group_id: str, locale: str) -> str:
    return f"{POSTS_DIR}/{translation_group_id}/{locale}/meta.json"


def post_content_path(translation_group_id: str, locale: str) -> str:
    return f"{POSTS_DIR}/{translation_group_id}/{locale}/content.md"


def series_path(translation_group_id: str, locale: str) -> str:
    return f"{SERIES_DIR}/{translation_group_id}/{locale}.json"


def media_path(object_key: str) -> str:
    return f"{MEDIA_DIR}/{object_key}"
```

`apps/api/src/app/services/imports/backup/bundle.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass
class PostEntry:
    meta: dict
    body_markdown: str


@dataclass
class BackupBundle:
    site_profile: dict | None
    tags: list[dict]
    post_tags: list[dict]
    media_assets: list[dict]
    media_bytes: dict[str, bytes]
    posts: list[PostEntry]
    series: list[dict]
    series_posts: list[dict]
    post_comments: list[dict]
    generated_at: datetime
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && .venv\Scripts\python -m pytest tests/services/test_import_archive_modules.py::test_backup_v3_schema_version_constant_exists tests/services/test_import_archive_modules.py::test_backup_v3_bundle_dataclass_has_all_entity_lists -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app/services/imports/backup apps/api/tests/services/test_import_archive_modules.py
git commit -m "feat(backup-v3): subpackage skeleton with schema constants"
```

---

### Task 2: SiteProfile serialize/deserialize roundtrip

**Files:**
- Modify: `apps/api/src/app/services/imports/backup/serialize.py`
- Modify: `apps/api/src/app/services/imports/backup/deserialize.py`
- Test: `apps/api/tests/services/test_import_archive_modules.py`

`SiteProfile` model: `key` (PK, default `"default"`), `email`, `github_url`, `created_at`, `updated_at`. Single row.

- [ ] **Step 1: Write the failing test**

Append to `test_import_archive_modules.py`:

```python
def test_site_profile_roundtrip_through_dict() -> None:
    from app.models.site_profile import SiteProfile, DEFAULT_SITE_PROFILE_KEY
    from app.services.imports.backup.serialize import serialize_site_profile
    from app.services.imports.backup.deserialize import deserialize_site_profile

    profile = SiteProfile(
        key=DEFAULT_SITE_PROFILE_KEY,
        email="hi@traceoflight.dev",
        github_url="https://github.com/traceoflight",
    )

    payload = serialize_site_profile(profile)
    restored = deserialize_site_profile(payload)

    assert payload == {
        "key": "default",
        "email": "hi@traceoflight.dev",
        "github_url": "https://github.com/traceoflight",
    }
    assert restored.key == "default"
    assert restored.email == "hi@traceoflight.dev"
    assert restored.github_url == "https://github.com/traceoflight"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && .venv\Scripts\python -m pytest tests/services/test_import_archive_modules.py::test_site_profile_roundtrip_through_dict -q`

Expected: FAIL with `ModuleNotFoundError` for `serialize` / `deserialize` modules.

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/app/services/imports/backup/serialize.py`:

```python
from __future__ import annotations

from app.models.site_profile import SiteProfile


def serialize_site_profile(profile: SiteProfile) -> dict:
    return {
        "key": profile.key,
        "email": profile.email,
        "github_url": profile.github_url,
    }
```

Create `apps/api/src/app/services/imports/backup/deserialize.py`:

```python
from __future__ import annotations

from app.models.site_profile import SiteProfile


def deserialize_site_profile(payload: dict) -> SiteProfile:
    return SiteProfile(
        key=str(payload["key"]),
        email=str(payload["email"]),
        github_url=str(payload["github_url"]),
    )
```

`created_at` / `updated_at` are intentionally not serialized for `SiteProfile` since SQLAlchemy `TimestampMixin` re-stamps them on insert. (Decision applies to all entities below where preserving timestamps yields no functional gain — see `_serialize_timestamps` helper introduced in Task 4 for entities where timestamps matter.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && .venv\Scripts\python -m pytest tests/services/test_import_archive_modules.py::test_site_profile_roundtrip_through_dict -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app/services/imports/backup/serialize.py apps/api/src/app/services/imports/backup/deserialize.py apps/api/tests/services/test_import_archive_modules.py
git commit -m "feat(backup-v3): SiteProfile serialize/deserialize"
```

---

### Task 3: Tag and PostTag serialize/deserialize roundtrip

**Files:**
- Modify: `apps/api/src/app/services/imports/backup/serialize.py`
- Modify: `apps/api/src/app/services/imports/backup/deserialize.py`
- Test: `apps/api/tests/services/test_import_archive_modules.py`

`Tag`: `id` (UUID PK), `slug`, `label`, timestamps. `PostTag`: composite PK `(post_id, tag_id)`, no other columns.

- [ ] **Step 1: Write the failing test**

```python
def test_tag_and_post_tag_roundtrip_through_dict() -> None:
    import uuid
    from app.models.tag import PostTag, Tag
    from app.services.imports.backup.serialize import serialize_tag, serialize_post_tag
    from app.services.imports.backup.deserialize import deserialize_tag, deserialize_post_tag

    tag_id = uuid.uuid4()
    post_id = uuid.uuid4()
    tag = Tag(id=tag_id, slug="python", label="Python")
    post_tag = PostTag(post_id=post_id, tag_id=tag_id)

    tag_payload = serialize_tag(tag)
    post_tag_payload = serialize_post_tag(post_tag)

    assert tag_payload == {"id": str(tag_id), "slug": "python", "label": "Python"}
    assert post_tag_payload == {"post_id": str(post_id), "tag_id": str(tag_id)}

    restored_tag = deserialize_tag(tag_payload)
    restored_link = deserialize_post_tag(post_tag_payload)

    assert restored_tag.id == tag_id
    assert restored_tag.slug == "python"
    assert restored_tag.label == "Python"
    assert restored_link.post_id == post_id
    assert restored_link.tag_id == tag_id
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && .venv\Scripts\python -m pytest tests/services/test_import_archive_modules.py::test_tag_and_post_tag_roundtrip_through_dict -q`

Expected: FAIL with `ImportError`.

- [ ] **Step 3: Write minimal implementation**

Append to `serialize.py`:

```python
import uuid
from app.models.tag import PostTag, Tag


def serialize_tag(tag: Tag) -> dict:
    return {"id": str(tag.id), "slug": tag.slug, "label": tag.label}


def serialize_post_tag(link: PostTag) -> dict:
    return {"post_id": str(link.post_id), "tag_id": str(link.tag_id)}
```

Append to `deserialize.py`:

```python
import uuid
from app.models.tag import PostTag, Tag


def deserialize_tag(payload: dict) -> Tag:
    return Tag(
        id=uuid.UUID(str(payload["id"])),
        slug=str(payload["slug"]),
        label=str(payload["label"]),
    )


def deserialize_post_tag(payload: dict) -> PostTag:
    return PostTag(
        post_id=uuid.UUID(str(payload["post_id"])),
        tag_id=uuid.UUID(str(payload["tag_id"])),
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app/services/imports/backup apps/api/tests/services/test_import_archive_modules.py
git commit -m "feat(backup-v3): Tag/PostTag serialize/deserialize"
```

---

### Task 4: MediaAsset serialize/deserialize roundtrip

**Files:**
- Modify: `apps/api/src/app/services/imports/backup/serialize.py`
- Modify: `apps/api/src/app/services/imports/backup/deserialize.py`
- Test: `apps/api/tests/services/test_import_archive_modules.py`

`MediaAsset`: `id`, `kind` (enum), `bucket`, `object_key`, `original_filename`, `mime_type`, `size_bytes`, `width`, `height`, `duration_seconds`, `owner_post_id` (nullable FK), timestamps.

- [ ] **Step 1: Write the failing test**

```python
def test_media_asset_roundtrip_through_dict() -> None:
    import uuid
    from datetime import datetime, timezone
    from app.models.media import AssetKind, MediaAsset
    from app.services.imports.backup.serialize import serialize_media_asset
    from app.services.imports.backup.deserialize import deserialize_media_asset

    media_id = uuid.uuid4()
    owner_id = uuid.uuid4()
    created = datetime(2026, 5, 5, 10, tzinfo=timezone.utc)
    media = MediaAsset(
        id=media_id,
        kind=AssetKind.IMAGE,
        bucket="traceoflight",
        object_key="image/foo.png",
        original_filename="foo.png",
        mime_type="image/png",
        size_bytes=1234,
        width=800,
        height=600,
        duration_seconds=None,
        owner_post_id=owner_id,
        created_at=created,
        updated_at=created,
    )

    payload = serialize_media_asset(media)
    restored = deserialize_media_asset(payload)

    assert payload == {
        "id": str(media_id),
        "kind": "image",
        "bucket": "traceoflight",
        "object_key": "image/foo.png",
        "original_filename": "foo.png",
        "mime_type": "image/png",
        "size_bytes": 1234,
        "width": 800,
        "height": 600,
        "duration_seconds": None,
        "owner_post_id": str(owner_id),
    }
    assert restored.id == media_id
    assert restored.kind == AssetKind.IMAGE
    assert restored.owner_post_id == owner_id
    assert restored.duration_seconds is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && .venv\Scripts\python -m pytest tests/services/test_import_archive_modules.py::test_media_asset_roundtrip_through_dict -q`

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Append to `serialize.py`:

```python
from app.models.media import AssetKind, MediaAsset


def serialize_media_asset(media: MediaAsset) -> dict:
    return {
        "id": str(media.id),
        "kind": media.kind.value,
        "bucket": media.bucket,
        "object_key": media.object_key,
        "original_filename": media.original_filename,
        "mime_type": media.mime_type,
        "size_bytes": int(media.size_bytes or 0),
        "width": media.width,
        "height": media.height,
        "duration_seconds": media.duration_seconds,
        "owner_post_id": None if media.owner_post_id is None else str(media.owner_post_id),
    }
```

Append to `deserialize.py`:

```python
from app.models.media import AssetKind, MediaAsset


def deserialize_media_asset(payload: dict) -> MediaAsset:
    raw_owner = payload.get("owner_post_id")
    return MediaAsset(
        id=uuid.UUID(str(payload["id"])),
        kind=AssetKind(str(payload["kind"])),
        bucket=str(payload["bucket"]),
        object_key=str(payload["object_key"]),
        original_filename=str(payload["original_filename"]),
        mime_type=str(payload["mime_type"]),
        size_bytes=int(payload["size_bytes"]),
        width=payload.get("width"),
        height=payload.get("height"),
        duration_seconds=payload.get("duration_seconds"),
        owner_post_id=None if raw_owner is None else uuid.UUID(str(raw_owner)),
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app/services/imports/backup apps/api/tests/services/test_import_archive_modules.py
git commit -m "feat(backup-v3): MediaAsset serialize/deserialize"
```

---

### Task 5: Post + ProjectProfile serialize/deserialize with content split

**Files:**
- Modify: `apps/api/src/app/services/imports/backup/serialize.py`
- Modify: `apps/api/src/app/services/imports/backup/deserialize.py`
- Test: `apps/api/tests/services/test_import_archive_modules.py`

`serialize_post(post)` returns `(meta_dict, body_markdown_str)`. Body lives outside meta because the ZIP layout splits it into `content.md`. Project profile is nested as `meta["project_profile"]` (or `None`).

- [ ] **Step 1: Write the failing test**

```python
def test_post_roundtrip_through_dict_with_project_profile() -> None:
    import uuid
    from datetime import datetime, timezone
    from app.models.post import (
        Post, PostContentKind, PostLocale, PostStatus, PostTopMediaKind,
        PostTranslationSourceKind, PostTranslationStatus, PostVisibility,
    )
    from app.models.project_profile import ProjectProfile
    from app.services.imports.backup.serialize import serialize_post
    from app.services.imports.backup.deserialize import deserialize_post

    post_id = uuid.uuid4()
    profile_id = uuid.uuid4()
    group_id = uuid.uuid4()
    published = datetime(2026, 4, 1, tzinfo=timezone.utc)
    post = Post(
        id=post_id,
        slug="alpha",
        title="Alpha",
        excerpt="summary",
        body_markdown="![cover](/media/image/cover.png)\n\nbody",
        cover_image_url="/media/image/cover.png",
        top_media_kind=PostTopMediaKind.IMAGE,
        top_media_image_url="/media/image/top.png",
        top_media_youtube_url=None,
        top_media_video_url=None,
        project_order_index=3,
        series_title="Series A",
        locale=PostLocale.KO,
        translation_group_id=group_id,
        source_post_id=None,
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
        translated_from_hash=None,
        content_kind=PostContentKind.PROJECT,
        status=PostStatus.PUBLISHED,
        visibility=PostVisibility.PUBLIC,
        published_at=published,
    )
    post.project_profile = ProjectProfile(
        id=profile_id,
        period_label="2026.03 - 2026.04",
        role_summary="Lead",
        project_intro="Intro",
        card_image_url="/media/image/card.png",
        highlights_json=["one", "two"],
        resource_links_json=[{"label": "GH", "href": "https://github.com/x"}],
    )

    meta, body = serialize_post(post)

    assert body == "![cover](/media/image/cover.png)\n\nbody"
    assert meta["id"] == str(post_id)
    assert meta["slug"] == "alpha"
    assert meta["locale"] == "ko"
    assert meta["translation_group_id"] == str(group_id)
    assert meta["project_order_index"] == 3
    assert meta["content_kind"] == "project"
    assert meta["top_media_kind"] == "image"
    assert meta["project_profile"] == {
        "id": str(profile_id),
        "period_label": "2026.03 - 2026.04",
        "role_summary": "Lead",
        "project_intro": "Intro",
        "card_image_url": "/media/image/card.png",
        "highlights": ["one", "two"],
        "resource_links": [{"label": "GH", "href": "https://github.com/x"}],
    }
    assert meta["published_at"] == "2026-04-01T00:00:00Z"

    restored = deserialize_post(meta, body)
    assert restored.id == post_id
    assert restored.translation_group_id == group_id
    assert restored.locale == PostLocale.KO
    assert restored.content_kind == PostContentKind.PROJECT
    assert restored.top_media_kind == PostTopMediaKind.IMAGE
    assert restored.project_profile is not None
    assert restored.project_profile.id == profile_id
    assert restored.project_profile.highlights_json == ["one", "two"]
    assert restored.body_markdown == "![cover](/media/image/cover.png)\n\nbody"


def test_post_roundtrip_with_blog_kind_has_no_project_profile() -> None:
    import uuid
    from app.models.post import (
        Post, PostContentKind, PostLocale, PostStatus, PostTopMediaKind,
        PostTranslationSourceKind, PostTranslationStatus, PostVisibility,
    )
    from app.services.imports.backup.serialize import serialize_post
    from app.services.imports.backup.deserialize import deserialize_post

    post = Post(
        id=uuid.uuid4(),
        slug="blog",
        title="Blog",
        excerpt=None,
        body_markdown="hello",
        cover_image_url=None,
        top_media_kind=PostTopMediaKind.IMAGE,
        top_media_image_url=None,
        top_media_youtube_url=None,
        top_media_video_url=None,
        project_order_index=None,
        series_title=None,
        locale=PostLocale.EN,
        translation_group_id=uuid.uuid4(),
        source_post_id=uuid.uuid4(),
        translation_status=PostTranslationStatus.SYNCED,
        translation_source_kind=PostTranslationSourceKind.MACHINE,
        translated_from_hash="abc",
        content_kind=PostContentKind.BLOG,
        status=PostStatus.DRAFT,
        visibility=PostVisibility.PRIVATE,
        published_at=None,
    )
    meta, body = serialize_post(post)
    assert meta["project_profile"] is None
    assert meta["locale"] == "en"
    assert meta["translation_status"] == "synced"
    restored = deserialize_post(meta, body)
    assert restored.project_profile is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && .venv\Scripts\python -m pytest tests/services/test_import_archive_modules.py::test_post_roundtrip_through_dict_with_project_profile tests/services/test_import_archive_modules.py::test_post_roundtrip_with_blog_kind_has_no_project_profile -q`

Expected: FAIL with `ImportError`.

- [ ] **Step 3: Write minimal implementation**

Append to `serialize.py`:

```python
from datetime import datetime, timezone
from app.models.post import Post
from app.models.project_profile import ProjectProfile


def _to_iso_utc(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _serialize_project_profile(profile: ProjectProfile) -> dict:
    return {
        "id": str(profile.id),
        "period_label": profile.period_label,
        "role_summary": profile.role_summary,
        "project_intro": profile.project_intro,
        "card_image_url": profile.card_image_url,
        "highlights": list(profile.highlights_json or []),
        "resource_links": list(profile.resource_links_json or []),
    }


def serialize_post(post: Post) -> tuple[dict, str]:
    meta = {
        "id": str(post.id),
        "slug": post.slug,
        "title": post.title,
        "excerpt": post.excerpt,
        "cover_image_url": post.cover_image_url,
        "top_media_kind": post.top_media_kind.value,
        "top_media_image_url": post.top_media_image_url,
        "top_media_youtube_url": post.top_media_youtube_url,
        "top_media_video_url": post.top_media_video_url,
        "project_order_index": post.project_order_index,
        "series_title": post.series_title,
        "locale": post.locale.value,
        "translation_group_id": str(post.translation_group_id),
        "source_post_id": None if post.source_post_id is None else str(post.source_post_id),
        "translation_status": post.translation_status.value,
        "translation_source_kind": post.translation_source_kind.value,
        "translated_from_hash": post.translated_from_hash,
        "content_kind": post.content_kind.value,
        "status": post.status.value,
        "visibility": post.visibility.value,
        "published_at": _to_iso_utc(post.published_at),
        "project_profile": (
            None if post.project_profile is None
            else _serialize_project_profile(post.project_profile)
        ),
    }
    return meta, post.body_markdown
```

Append to `deserialize.py`:

```python
from datetime import datetime, timezone
from app.models.post import (
    Post, PostContentKind, PostLocale, PostStatus, PostTopMediaKind,
    PostTranslationSourceKind, PostTranslationStatus, PostVisibility,
)
from app.models.project_profile import ProjectProfile


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _deserialize_project_profile(payload: dict) -> ProjectProfile:
    return ProjectProfile(
        id=uuid.UUID(str(payload["id"])),
        period_label=str(payload["period_label"]),
        role_summary=str(payload["role_summary"]),
        project_intro=payload.get("project_intro"),
        card_image_url=str(payload["card_image_url"]),
        highlights_json=list(payload.get("highlights") or []),
        resource_links_json=list(payload.get("resource_links") or []),
    )


def deserialize_post(meta: dict, body_markdown: str) -> Post:
    raw_source = meta.get("source_post_id")
    project_profile_payload = meta.get("project_profile")
    post = Post(
        id=uuid.UUID(str(meta["id"])),
        slug=str(meta["slug"]),
        title=str(meta["title"]),
        excerpt=meta.get("excerpt"),
        body_markdown=body_markdown,
        cover_image_url=meta.get("cover_image_url"),
        top_media_kind=PostTopMediaKind(str(meta["top_media_kind"])),
        top_media_image_url=meta.get("top_media_image_url"),
        top_media_youtube_url=meta.get("top_media_youtube_url"),
        top_media_video_url=meta.get("top_media_video_url"),
        project_order_index=meta.get("project_order_index"),
        series_title=meta.get("series_title"),
        locale=PostLocale(str(meta["locale"])),
        translation_group_id=uuid.UUID(str(meta["translation_group_id"])),
        source_post_id=None if raw_source is None else uuid.UUID(str(raw_source)),
        translation_status=PostTranslationStatus(str(meta["translation_status"])),
        translation_source_kind=PostTranslationSourceKind(str(meta["translation_source_kind"])),
        translated_from_hash=meta.get("translated_from_hash"),
        content_kind=PostContentKind(str(meta["content_kind"])),
        status=PostStatus(str(meta["status"])),
        visibility=PostVisibility(str(meta["visibility"])),
        published_at=_parse_iso(meta.get("published_at")),
    )
    if project_profile_payload is not None:
        post.project_profile = _deserialize_project_profile(project_profile_payload)
    return post
```

- [ ] **Step 4: Run test to verify it passes**

Run: same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app/services/imports/backup apps/api/tests/services/test_import_archive_modules.py
git commit -m "feat(backup-v3): Post+ProjectProfile serialize/deserialize"
```

---

### Task 6: Series and SeriesPost serialize/deserialize roundtrip

**Files:**
- Modify: `apps/api/src/app/services/imports/backup/serialize.py`
- Modify: `apps/api/src/app/services/imports/backup/deserialize.py`
- Test: `apps/api/tests/services/test_import_archive_modules.py`

- [ ] **Step 1: Write the failing test**

```python
def test_series_and_series_post_roundtrip_through_dict() -> None:
    import uuid
    from app.models.post import PostLocale, PostTranslationSourceKind, PostTranslationStatus
    from app.models.series import Series, SeriesPost
    from app.services.imports.backup.serialize import serialize_series, serialize_series_post
    from app.services.imports.backup.deserialize import deserialize_series, deserialize_series_post

    series_id = uuid.uuid4()
    group_id = uuid.uuid4()
    series = Series(
        id=series_id,
        slug="series-a",
        title="Series A",
        description="desc",
        cover_image_url="/media/image/series.png",
        list_order_index=2,
        locale=PostLocale.KO,
        translation_group_id=group_id,
        source_series_id=None,
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
        translated_from_hash=None,
    )
    sp_id = uuid.uuid4()
    post_id = uuid.uuid4()
    sp = SeriesPost(id=sp_id, series_id=series_id, post_id=post_id, order_index=1)

    series_payload = serialize_series(series)
    sp_payload = serialize_series_post(sp)

    assert series_payload == {
        "id": str(series_id),
        "slug": "series-a",
        "title": "Series A",
        "description": "desc",
        "cover_image_url": "/media/image/series.png",
        "list_order_index": 2,
        "locale": "ko",
        "translation_group_id": str(group_id),
        "source_series_id": None,
        "translation_status": "source",
        "translation_source_kind": "manual",
        "translated_from_hash": None,
    }
    assert sp_payload == {
        "id": str(sp_id),
        "series_id": str(series_id),
        "post_id": str(post_id),
        "order_index": 1,
    }

    restored_series = deserialize_series(series_payload)
    restored_sp = deserialize_series_post(sp_payload)
    assert restored_series.id == series_id
    assert restored_series.translation_group_id == group_id
    assert restored_sp.series_id == series_id
    assert restored_sp.post_id == post_id
    assert restored_sp.order_index == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && .venv\Scripts\python -m pytest tests/services/test_import_archive_modules.py::test_series_and_series_post_roundtrip_through_dict -q`

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Append to `serialize.py`:

```python
from app.models.series import Series, SeriesPost


def serialize_series(series: Series) -> dict:
    return {
        "id": str(series.id),
        "slug": series.slug,
        "title": series.title,
        "description": series.description,
        "cover_image_url": series.cover_image_url,
        "list_order_index": series.list_order_index,
        "locale": series.locale.value,
        "translation_group_id": str(series.translation_group_id),
        "source_series_id": (
            None if series.source_series_id is None else str(series.source_series_id)
        ),
        "translation_status": series.translation_status.value,
        "translation_source_kind": series.translation_source_kind.value,
        "translated_from_hash": series.translated_from_hash,
    }


def serialize_series_post(sp: SeriesPost) -> dict:
    return {
        "id": str(sp.id),
        "series_id": str(sp.series_id),
        "post_id": str(sp.post_id),
        "order_index": int(sp.order_index),
    }
```

Append to `deserialize.py`:

```python
from app.models.series import Series, SeriesPost


def deserialize_series(payload: dict) -> Series:
    raw_source = payload.get("source_series_id")
    return Series(
        id=uuid.UUID(str(payload["id"])),
        slug=str(payload["slug"]),
        title=str(payload["title"]),
        description=str(payload["description"]),
        cover_image_url=payload.get("cover_image_url"),
        list_order_index=payload.get("list_order_index"),
        locale=PostLocale(str(payload["locale"])),
        translation_group_id=uuid.UUID(str(payload["translation_group_id"])),
        source_series_id=None if raw_source is None else uuid.UUID(str(raw_source)),
        translation_status=PostTranslationStatus(str(payload["translation_status"])),
        translation_source_kind=PostTranslationSourceKind(
            str(payload["translation_source_kind"])
        ),
        translated_from_hash=payload.get("translated_from_hash"),
    )


def deserialize_series_post(payload: dict) -> SeriesPost:
    return SeriesPost(
        id=uuid.UUID(str(payload["id"])),
        series_id=uuid.UUID(str(payload["series_id"])),
        post_id=uuid.UUID(str(payload["post_id"])),
        order_index=int(payload["order_index"]),
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app/services/imports/backup apps/api/tests/services/test_import_archive_modules.py
git commit -m "feat(backup-v3): Series/SeriesPost serialize/deserialize"
```

---

### Task 7: PostComment serialize/deserialize roundtrip

**Files:**
- Modify: `apps/api/src/app/services/imports/backup/serialize.py`
- Modify: `apps/api/src/app/services/imports/backup/deserialize.py`
- Test: `apps/api/tests/services/test_import_archive_modules.py`

`PostComment` has self-referential FKs (`root_comment_id`, `reply_to_comment_id`). At serialize/deserialize level we just preserve the UUIDs — INSERT ordering is handled later in restore.

- [ ] **Step 1: Write the failing test**

```python
def test_post_comment_roundtrip_through_dict() -> None:
    import uuid
    from datetime import datetime, timezone
    from app.models.post_comment import (
        PostComment, PostCommentAuthorType, PostCommentStatus, PostCommentVisibility,
    )
    from app.services.imports.backup.serialize import serialize_post_comment
    from app.services.imports.backup.deserialize import deserialize_post_comment

    comment_id = uuid.uuid4()
    post_id = uuid.uuid4()
    root_id = uuid.uuid4()
    reply_id = uuid.uuid4()
    last_edited = datetime(2026, 5, 1, 12, tzinfo=timezone.utc)
    comment = PostComment(
        id=comment_id,
        post_id=post_id,
        root_comment_id=root_id,
        reply_to_comment_id=reply_id,
        author_name="Hee",
        author_type=PostCommentAuthorType.GUEST,
        password_hash="$2b$12$abc",
        visibility=PostCommentVisibility.PUBLIC,
        status=PostCommentStatus.ACTIVE,
        body="Hello",
        deleted_at=None,
        last_edited_at=last_edited,
        request_ip_hash="iphash",
        user_agent_hash="uahash",
    )

    payload = serialize_post_comment(comment)
    restored = deserialize_post_comment(payload)

    assert payload["id"] == str(comment_id)
    assert payload["post_id"] == str(post_id)
    assert payload["root_comment_id"] == str(root_id)
    assert payload["reply_to_comment_id"] == str(reply_id)
    assert payload["author_type"] == "guest"
    assert payload["status"] == "active"
    assert payload["visibility"] == "public"
    assert payload["last_edited_at"] == "2026-05-01T12:00:00Z"
    assert restored.id == comment_id
    assert restored.root_comment_id == root_id
    assert restored.reply_to_comment_id == reply_id
    assert restored.author_type == PostCommentAuthorType.GUEST
    assert restored.last_edited_at is not None
    assert restored.deleted_at is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && .venv\Scripts\python -m pytest tests/services/test_import_archive_modules.py::test_post_comment_roundtrip_through_dict -q`

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Append to `serialize.py`:

```python
from app.models.post_comment import (
    PostComment, PostCommentAuthorType, PostCommentStatus, PostCommentVisibility,
)


def serialize_post_comment(comment: PostComment) -> dict:
    return {
        "id": str(comment.id),
        "post_id": str(comment.post_id),
        "root_comment_id": (
            None if comment.root_comment_id is None else str(comment.root_comment_id)
        ),
        "reply_to_comment_id": (
            None if comment.reply_to_comment_id is None
            else str(comment.reply_to_comment_id)
        ),
        "author_name": comment.author_name,
        "author_type": comment.author_type.value,
        "password_hash": comment.password_hash,
        "visibility": comment.visibility.value,
        "status": comment.status.value,
        "body": comment.body,
        "deleted_at": _to_iso_utc(comment.deleted_at),
        "last_edited_at": _to_iso_utc(comment.last_edited_at),
        "request_ip_hash": comment.request_ip_hash,
        "user_agent_hash": comment.user_agent_hash,
    }
```

Append to `deserialize.py`:

```python
from app.models.post_comment import (
    PostComment, PostCommentAuthorType, PostCommentStatus, PostCommentVisibility,
)


def deserialize_post_comment(payload: dict) -> PostComment:
    raw_root = payload.get("root_comment_id")
    raw_reply = payload.get("reply_to_comment_id")
    return PostComment(
        id=uuid.UUID(str(payload["id"])),
        post_id=uuid.UUID(str(payload["post_id"])),
        root_comment_id=None if raw_root is None else uuid.UUID(str(raw_root)),
        reply_to_comment_id=None if raw_reply is None else uuid.UUID(str(raw_reply)),
        author_name=str(payload["author_name"]),
        author_type=PostCommentAuthorType(str(payload["author_type"])),
        password_hash=payload.get("password_hash"),
        visibility=PostCommentVisibility(str(payload["visibility"])),
        status=PostCommentStatus(str(payload["status"])),
        body=str(payload["body"]),
        deleted_at=_parse_iso(payload.get("deleted_at")),
        last_edited_at=_parse_iso(payload.get("last_edited_at")),
        request_ip_hash=payload.get("request_ip_hash"),
        user_agent_hash=payload.get("user_agent_hash"),
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app/services/imports/backup apps/api/tests/services/test_import_archive_modules.py
git commit -m "feat(backup-v3): PostComment serialize/deserialize"
```

---

### Task 8: Build ZIP from BackupBundle

**Files:**
- Modify: `apps/api/src/app/services/imports/backup/archive.py`
- Modify: `apps/api/src/app/services/imports/backup/__init__.py`
- Test: `apps/api/tests/services/test_import_archive_modules.py`

`build_backup_zip(bundle: BackupBundle) -> bytes`. Writes manifest, db/*.json files, posts/<group>/<locale>/{meta.json,content.md}, series/<group>/<locale>.json, media/<object_key>.

- [ ] **Step 1: Write the failing test**

```python
def test_build_backup_zip_writes_expected_files() -> None:
    import io
    import json
    import uuid
    from datetime import datetime, timezone
    from zipfile import ZipFile
    from app.services.imports.backup import (
        BACKUP_SCHEMA_VERSION, BackupBundle, PostEntry, build_backup_zip,
    )

    group_id = "11111111-1111-1111-1111-111111111111"
    series_group = "22222222-2222-2222-2222-222222222222"
    bundle = BackupBundle(
        site_profile={"key": "default", "email": "x@y.z", "github_url": "https://gh"},
        tags=[{"id": "tag-1", "slug": "py", "label": "Py"}],
        post_tags=[{"post_id": "p1", "tag_id": "tag-1"}],
        media_assets=[{"id": "m1", "kind": "image", "bucket": "b", "object_key": "image/x.png",
                       "original_filename": "x.png", "mime_type": "image/png", "size_bytes": 3,
                       "width": None, "height": None, "duration_seconds": None, "owner_post_id": None}],
        media_bytes={"image/x.png": b"abc"},
        posts=[
            PostEntry(
                meta={
                    "id": "p1", "slug": "alpha", "title": "Alpha",
                    "translation_group_id": group_id, "locale": "ko",
                    "project_profile": None,
                },
                body_markdown="hello",
            )
        ],
        series=[{"id": "s1", "slug": "series", "title": "S", "description": "d",
                 "cover_image_url": None, "list_order_index": None,
                 "translation_group_id": series_group, "locale": "ko",
                 "source_series_id": None, "translation_status": "source",
                 "translation_source_kind": "manual", "translated_from_hash": None}],
        series_posts=[{"id": "sp1", "series_id": "s1", "post_id": "p1", "order_index": 1}],
        post_comments=[],
        generated_at=datetime(2026, 5, 5, tzinfo=timezone.utc),
    )

    zip_bytes = build_backup_zip(bundle)
    with ZipFile(io.BytesIO(zip_bytes)) as archive:
        names = set(archive.namelist())
        manifest = json.loads(archive.read("manifest.json").decode())
        post_meta = json.loads(
            archive.read(f"posts/{group_id}/ko/meta.json").decode()
        )
        post_body = archive.read(f"posts/{group_id}/ko/content.md").decode()
        series_payload = json.loads(
            archive.read(f"series/{series_group}/ko.json").decode()
        )
        media_bytes = archive.read("media/image/x.png")

    assert manifest["schema_version"] == BACKUP_SCHEMA_VERSION
    assert manifest["counts"] == {
        "posts": 1, "series": 1, "tags": 1, "post_tags": 1,
        "series_posts": 1, "post_comments": 0, "media_assets": 1,
    }
    assert post_meta["slug"] == "alpha"
    assert post_body == "hello"
    assert series_payload["title"] == "S"
    assert media_bytes == b"abc"
    assert "db/site_profile.json" in names
    assert "db/tags.json" in names
    assert "db/post_tags.json" in names
    assert "db/series_posts.json" in names
    assert "db/post_comments.json" in names
    assert "db/media_assets.json" in names
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && .venv\Scripts\python -m pytest tests/services/test_import_archive_modules.py::test_build_backup_zip_writes_expected_files -q`

Expected: FAIL with `ImportError`.

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/app/services/imports/backup/archive.py`:

```python
from __future__ import annotations

import io
import json
from datetime import timezone
from zipfile import ZIP_DEFLATED, ZipFile

from app.services.imports.backup.bundle import BackupBundle
from app.services.imports.backup.schema import (
    BACKUP_SCHEMA_VERSION,
    DB_MEDIA_ASSETS_PATH,
    DB_POST_COMMENTS_PATH,
    DB_POST_TAGS_PATH,
    DB_SERIES_POSTS_PATH,
    DB_SITE_PROFILE_PATH,
    DB_TAGS_PATH,
    MANIFEST_PATH,
    media_path,
    post_content_path,
    post_meta_path,
    series_path,
)


def _dumps(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2)


def build_backup_zip(bundle: BackupBundle) -> bytes:
    manifest = {
        "schema_version": BACKUP_SCHEMA_VERSION,
        "generated_at": bundle.generated_at.astimezone(timezone.utc)
        .isoformat()
        .replace("+00:00", "Z"),
        "counts": {
            "posts": len(bundle.posts),
            "series": len(bundle.series),
            "tags": len(bundle.tags),
            "post_tags": len(bundle.post_tags),
            "series_posts": len(bundle.series_posts),
            "post_comments": len(bundle.post_comments),
            "media_assets": len(bundle.media_assets),
        },
    }

    memory = io.BytesIO()
    with ZipFile(memory, mode="w", compression=ZIP_DEFLATED) as archive:
        archive.writestr(MANIFEST_PATH, _dumps(manifest))
        archive.writestr(DB_SITE_PROFILE_PATH, _dumps(bundle.site_profile))
        archive.writestr(DB_TAGS_PATH, _dumps(bundle.tags))
        archive.writestr(DB_POST_TAGS_PATH, _dumps(bundle.post_tags))
        archive.writestr(DB_SERIES_POSTS_PATH, _dumps(bundle.series_posts))
        archive.writestr(DB_POST_COMMENTS_PATH, _dumps(bundle.post_comments))
        archive.writestr(DB_MEDIA_ASSETS_PATH, _dumps(bundle.media_assets))

        for entry in bundle.posts:
            group_id = str(entry.meta["translation_group_id"])
            locale = str(entry.meta["locale"])
            archive.writestr(post_meta_path(group_id, locale), _dumps(entry.meta))
            archive.writestr(post_content_path(group_id, locale), entry.body_markdown)

        for series_payload in bundle.series:
            group_id = str(series_payload["translation_group_id"])
            locale = str(series_payload["locale"])
            archive.writestr(series_path(group_id, locale), _dumps(series_payload))

        for object_key, payload_bytes in bundle.media_bytes.items():
            archive.writestr(media_path(object_key), payload_bytes)

    return memory.getvalue()
```

Update `apps/api/src/app/services/imports/backup/__init__.py`:

```python
from app.services.imports.backup.archive import build_backup_zip
from app.services.imports.backup.bundle import BackupBundle, PostEntry
from app.services.imports.backup.schema import BACKUP_SCHEMA_VERSION

__all__ = [
    "BACKUP_SCHEMA_VERSION",
    "BackupBundle",
    "PostEntry",
    "build_backup_zip",
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app/services/imports/backup apps/api/tests/services/test_import_archive_modules.py
git commit -m "feat(backup-v3): build ZIP from BackupBundle"
```

---

### Task 9: Parse ZIP into BackupBundle with validation

**Files:**
- Modify: `apps/api/src/app/services/imports/backup/archive.py`
- Modify: `apps/api/src/app/services/imports/backup/__init__.py`
- Test: `apps/api/tests/services/test_import_archive_modules.py`

`parse_backup_zip(zip_bytes) -> BackupBundle`. Validates schema version, manifest counts, dangling FKs (comment self-ref, post_tags FK, series_posts FK, media owner FK), and post.series_title ↔ KO series slug mapping.

- [ ] **Step 1: Write the failing test**

```python
def test_parse_backup_zip_round_trips_through_build() -> None:
    import uuid
    from datetime import datetime, timezone
    from app.services.imports.backup import (
        BackupBundle, PostEntry, build_backup_zip, parse_backup_zip,
    )

    group_id = "11111111-1111-1111-1111-111111111111"
    series_group = "22222222-2222-2222-2222-222222222222"
    bundle = BackupBundle(
        site_profile={"key": "default", "email": "x@y.z", "github_url": "https://gh"},
        tags=[],
        post_tags=[],
        media_assets=[],
        media_bytes={},
        posts=[
            PostEntry(
                meta={
                    "id": "p1", "slug": "alpha", "title": "Alpha",
                    "translation_group_id": group_id, "locale": "ko",
                    "series_title": "S", "project_profile": None,
                },
                body_markdown="hello",
            )
        ],
        series=[{
            "id": "s1", "slug": "s", "title": "S", "description": "d",
            "cover_image_url": None, "list_order_index": None,
            "translation_group_id": series_group, "locale": "ko",
            "source_series_id": None, "translation_status": "source",
            "translation_source_kind": "manual", "translated_from_hash": None,
        }],
        series_posts=[],
        post_comments=[],
        generated_at=datetime(2026, 5, 5, tzinfo=timezone.utc),
    )

    parsed = parse_backup_zip(build_backup_zip(bundle))

    assert len(parsed.posts) == 1
    assert parsed.posts[0].meta["slug"] == "alpha"
    assert parsed.posts[0].body_markdown == "hello"
    assert parsed.site_profile == bundle.site_profile
    assert parsed.series[0]["slug"] == "s"


def test_parse_backup_zip_rejects_dangling_post_tag() -> None:
    import io
    import json
    from zipfile import ZipFile
    from app.services.imports.backup import parse_backup_zip
    from app.services.imports.errors import ImportValidationError

    memory = io.BytesIO()
    with ZipFile(memory, mode="w") as archive:
        archive.writestr("manifest.json", json.dumps({
            "schema_version": "backup-v3",
            "generated_at": "2026-05-05T00:00:00Z",
            "counts": {"posts": 0, "series": 0, "tags": 1, "post_tags": 1,
                       "series_posts": 0, "post_comments": 0, "media_assets": 0},
        }))
        archive.writestr("db/site_profile.json", "null")
        archive.writestr("db/tags.json", json.dumps([{"id": "tag-1", "slug": "x", "label": "X"}]))
        archive.writestr("db/post_tags.json", json.dumps([
            {"post_id": "missing-post", "tag_id": "tag-1"}
        ]))
        archive.writestr("db/series_posts.json", "[]")
        archive.writestr("db/post_comments.json", "[]")
        archive.writestr("db/media_assets.json", "[]")

    import pytest
    with pytest.raises(ImportValidationError):
        parse_backup_zip(memory.getvalue())


def test_parse_backup_zip_rejects_unknown_schema_version() -> None:
    import io
    import json
    from zipfile import ZipFile
    from app.services.imports.backup import parse_backup_zip
    from app.services.imports.errors import ImportValidationError

    memory = io.BytesIO()
    with ZipFile(memory, mode="w") as archive:
        archive.writestr("manifest.json", json.dumps({
            "schema_version": "backup-v2",
            "generated_at": "2026-03-12T00:00:00Z",
            "post_count": 0, "media_count": 0, "series_override_count": 0,
            "slugs": [],
        }))

    import pytest
    with pytest.raises(ImportValidationError):
        parse_backup_zip(memory.getvalue())
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && .venv\Scripts\python -m pytest tests/services/test_import_archive_modules.py::test_parse_backup_zip_round_trips_through_build tests/services/test_import_archive_modules.py::test_parse_backup_zip_rejects_dangling_post_tag tests/services/test_import_archive_modules.py::test_parse_backup_zip_rejects_unknown_schema_version -q`

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Append to `archive.py`:

```python
from datetime import datetime
from zipfile import BadZipFile

from app.services.imports.backup.bundle import PostEntry
from app.services.imports.errors import ImportValidationError
from app.services.imports.backup.schema import (
    DB_DIR, MEDIA_DIR, POSTS_DIR, SERIES_DIR,
)


def _safe_loads(archive: ZipFile, path: str) -> object:
    try:
        return json.loads(archive.read(path).decode("utf-8"))
    except KeyError as exc:
        raise ImportValidationError(f"backup archive missing {path}") from exc
    except ValueError as exc:
        raise ImportValidationError(f"backup archive {path} is not valid JSON") from exc


def parse_backup_zip(backup_data: bytes) -> BackupBundle:
    try:
        archive = ZipFile(io.BytesIO(backup_data))
    except (BadZipFile, OSError) as exc:
        raise ImportValidationError("backup zip is invalid") from exc

    with archive:
        manifest = _safe_loads(archive, MANIFEST_PATH)
        if not isinstance(manifest, dict) or manifest.get("schema_version") != BACKUP_SCHEMA_VERSION:
            raise ImportValidationError("backup manifest schema is invalid")

        site_profile = _safe_loads(archive, DB_SITE_PROFILE_PATH)
        tags = _safe_loads(archive, DB_TAGS_PATH)
        post_tags = _safe_loads(archive, DB_POST_TAGS_PATH)
        series_posts = _safe_loads(archive, DB_SERIES_POSTS_PATH)
        post_comments = _safe_loads(archive, DB_POST_COMMENTS_PATH)
        media_assets = _safe_loads(archive, DB_MEDIA_ASSETS_PATH)

        for label, value in (
            ("tags", tags), ("post_tags", post_tags), ("series_posts", series_posts),
            ("post_comments", post_comments), ("media_assets", media_assets),
        ):
            if not isinstance(value, list):
                raise ImportValidationError(f"backup {label} payload must be a list")

        posts: list[PostEntry] = []
        series: list[dict] = []
        media_bytes: dict[str, bytes] = {}

        for name in archive.namelist():
            if name.startswith(f"{POSTS_DIR}/") and name.endswith("/meta.json"):
                meta = _safe_loads(archive, name)
                if not isinstance(meta, dict):
                    raise ImportValidationError(f"backup {name} must be an object")
                content_path = name[: -len("meta.json")] + "content.md"
                try:
                    body = archive.read(content_path).decode("utf-8")
                except KeyError as exc:
                    raise ImportValidationError(
                        f"backup archive missing {content_path}"
                    ) from exc
                posts.append(PostEntry(meta=meta, body_markdown=body))
            elif name.startswith(f"{SERIES_DIR}/") and name.endswith(".json"):
                payload = _safe_loads(archive, name)
                if not isinstance(payload, dict):
                    raise ImportValidationError(f"backup {name} must be an object")
                series.append(payload)
            elif name.startswith(f"{MEDIA_DIR}/"):
                object_key = name[len(MEDIA_DIR) + 1 :]
                if object_key:
                    media_bytes[object_key] = archive.read(name)

        bundle = BackupBundle(
            site_profile=site_profile if isinstance(site_profile, dict) else None,
            tags=tags,
            post_tags=post_tags,
            media_assets=media_assets,
            media_bytes=media_bytes,
            posts=posts,
            series=series,
            series_posts=series_posts,
            post_comments=post_comments,
            generated_at=datetime.fromisoformat(
                str(manifest["generated_at"]).replace("Z", "+00:00")
            ),
        )

        _validate_bundle(bundle, manifest.get("counts", {}))
        return bundle


def _validate_bundle(bundle: BackupBundle, expected_counts: dict) -> None:
    actual_counts = {
        "posts": len(bundle.posts),
        "series": len(bundle.series),
        "tags": len(bundle.tags),
        "post_tags": len(bundle.post_tags),
        "series_posts": len(bundle.series_posts),
        "post_comments": len(bundle.post_comments),
        "media_assets": len(bundle.media_assets),
    }
    for key, expected in expected_counts.items():
        if actual_counts.get(key) != expected:
            raise ImportValidationError(
                f"backup count mismatch for {key}: manifest={expected} actual={actual_counts.get(key)}"
            )

    post_ids = {str(entry.meta["id"]) for entry in bundle.posts}
    tag_ids = {str(tag["id"]) for tag in bundle.tags}
    series_ids = {str(s["id"]) for s in bundle.series}
    comment_ids = {str(c["id"]) for c in bundle.post_comments}

    for link in bundle.post_tags:
        if str(link["post_id"]) not in post_ids:
            raise ImportValidationError("post_tags references unknown post_id")
        if str(link["tag_id"]) not in tag_ids:
            raise ImportValidationError("post_tags references unknown tag_id")

    for sp in bundle.series_posts:
        if str(sp["series_id"]) not in series_ids:
            raise ImportValidationError("series_posts references unknown series_id")
        if str(sp["post_id"]) not in post_ids:
            raise ImportValidationError("series_posts references unknown post_id")

    for media in bundle.media_assets:
        owner = media.get("owner_post_id")
        if owner is not None and str(owner) not in post_ids:
            raise ImportValidationError("media_assets owner_post_id references unknown post")

    for comment in bundle.post_comments:
        if str(comment["post_id"]) not in post_ids:
            raise ImportValidationError("post_comments references unknown post_id")
        for fk in ("root_comment_id", "reply_to_comment_id"):
            target = comment.get(fk)
            if target is not None and str(target) not in comment_ids:
                raise ImportValidationError(f"post_comments {fk} references unknown comment")

    ko_series_slugs = {
        str(s["slug"]) for s in bundle.series if str(s.get("locale")) == "ko"
    }
    for entry in bundle.posts:
        series_title = entry.meta.get("series_title")
        if not series_title or str(entry.meta.get("locale")) != "ko":
            continue
        from app.services.series_projection_cache import _slugify_series_title
        if _slugify_series_title(str(series_title)) not in ko_series_slugs:
            raise ImportValidationError(
                f"post '{entry.meta.get('slug')}' references series_title without matching ko series row"
            )
```

Update `__init__.py` to include `parse_backup_zip` in `__all__` and import.

- [ ] **Step 4: Run test to verify it passes**

Run: same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app/services/imports/backup apps/api/tests/services/test_import_archive_modules.py
git commit -m "feat(backup-v3): parse ZIP with FK + schema validation"
```

---

### Task 10: collect_bundle reads BackupBundle from DB and storage

**Files:**
- Modify: `apps/api/src/app/services/imports/backup/serialize.py`
- Modify: `apps/api/src/app/services/imports/backup/__init__.py`
- Test: `apps/api/tests/services/test_import_archive_modules.py`

`collect_bundle(db, storage)` reads all relevant tables, computes referenced media keys (cover, top_media_image, top_media_video, project card, markdown internal, series cover), reads bytes, and returns a `BackupBundle`.

- [ ] **Step 1: Write the failing test**

```python
def test_collect_bundle_reads_full_state_from_session() -> None:
    import uuid
    from datetime import datetime, timezone
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.db.base import Base
    from app.models.media import AssetKind, MediaAsset
    from app.models.post import (
        Post, PostContentKind, PostLocale, PostStatus, PostTopMediaKind,
        PostTranslationSourceKind, PostTranslationStatus, PostVisibility,
    )
    from app.models.series import Series, SeriesPost
    from app.models.site_profile import DEFAULT_SITE_PROFILE_KEY, SiteProfile
    from app.models.tag import PostTag, Tag
    from app.services.imports.backup import collect_bundle

    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, expire_on_commit=False)()

    session.add(SiteProfile(key=DEFAULT_SITE_PROFILE_KEY, email="x@y.z", github_url="https://gh"))
    tag = Tag(slug="py", label="Python")
    session.add(tag)
    session.flush()

    post = Post(
        slug="alpha", title="Alpha", excerpt=None,
        body_markdown="![](/media/image/body.png)",
        cover_image_url="/media/image/cover.png",
        top_media_kind=PostTopMediaKind.IMAGE,
        top_media_image_url=None, top_media_youtube_url=None, top_media_video_url=None,
        project_order_index=None, series_title=None,
        locale=PostLocale.KO, translation_group_id=uuid.uuid4(),
        source_post_id=None,
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
        translated_from_hash=None,
        content_kind=PostContentKind.BLOG,
        status=PostStatus.PUBLISHED, visibility=PostVisibility.PUBLIC,
        published_at=datetime(2026, 5, 1, tzinfo=timezone.utc),
    )
    session.add(post)
    session.flush()
    session.add(PostTag(post_id=post.id, tag_id=tag.id))
    session.add(MediaAsset(
        kind=AssetKind.IMAGE, bucket="b", object_key="image/cover.png",
        original_filename="cover.png", mime_type="image/png", size_bytes=5,
        owner_post_id=post.id,
    ))
    session.add(MediaAsset(
        kind=AssetKind.IMAGE, bucket="b", object_key="image/body.png",
        original_filename="body.png", mime_type="image/png", size_bytes=4,
    ))
    session.commit()

    class _Storage:
        bucket = "b"
        def get_bytes(self, key):
            return {"image/cover.png": b"cover", "image/body.png": b"body"}[key]

    bundle = collect_bundle(session, _Storage())

    assert bundle.site_profile["email"] == "x@y.z"
    assert {tag["slug"] for tag in bundle.tags} == {"py"}
    assert len(bundle.post_tags) == 1
    assert len(bundle.posts) == 1
    assert bundle.posts[0].meta["slug"] == "alpha"
    assert bundle.posts[0].body_markdown.startswith("![")
    assert set(bundle.media_bytes.keys()) == {"image/cover.png", "image/body.png"}
    assert {m["object_key"] for m in bundle.media_assets} == {
        "image/cover.png", "image/body.png",
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && .venv\Scripts\python -m pytest tests/services/test_import_archive_modules.py::test_collect_bundle_reads_full_state_from_session -q`

Expected: FAIL with `ImportError: cannot import name 'collect_bundle'`.

- [ ] **Step 3: Write minimal implementation**

Append to `serialize.py`:

```python
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.post_comment import PostComment
from app.services.imports.backup.bundle import BackupBundle, PostEntry
from app.services.imports.media_refs import (
    extract_internal_object_key,
    extract_markdown_media_object_keys,
    fallback_media_manifest_entry,
)


def _utcnow():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc)


def _collect_referenced_media_keys(posts: list[Post], series_rows: list[Series]) -> set[str]:
    keys: set[str] = set()
    for post in posts:
        for url in (
            post.cover_image_url, post.top_media_image_url, post.top_media_video_url,
        ):
            key = extract_internal_object_key(url)
            if key is not None:
                keys.add(key)
        keys.update(extract_markdown_media_object_keys(post.body_markdown))
        if post.project_profile is not None:
            key = extract_internal_object_key(post.project_profile.card_image_url)
            if key is not None:
                keys.add(key)
    for series in series_rows:
        key = extract_internal_object_key(series.cover_image_url)
        if key is not None:
            keys.add(key)
    return keys


def collect_bundle(db: Session, storage) -> BackupBundle:
    posts = list(
        db.scalars(
            select(Post)
            .options(selectinload(Post.tags), selectinload(Post.project_profile))
            .order_by(Post.created_at.asc(), Post.slug.asc())
        )
    )
    series_rows = list(db.scalars(select(Series).order_by(Series.created_at.asc())))
    series_posts = list(db.scalars(select(SeriesPost).order_by(SeriesPost.series_id, SeriesPost.order_index)))
    tags = list(db.scalars(select(Tag).order_by(Tag.slug)))
    post_tags = list(db.scalars(select(PostTag)))
    comments = list(db.scalars(select(PostComment).order_by(PostComment.created_at)))

    site_profile_row = db.scalar(select(SiteProfile))
    site_profile_payload = (
        None if site_profile_row is None else serialize_site_profile(site_profile_row)
    )

    referenced_keys = _collect_referenced_media_keys(posts, series_rows)
    media_assets_query = list(
        db.scalars(
            select(MediaAsset).where(MediaAsset.object_key.in_(sorted(referenced_keys)))
        )
    ) if referenced_keys else []
    media_by_key = {row.object_key: row for row in media_assets_query}

    media_bytes: dict[str, bytes] = {}
    media_assets_payload: list[dict] = []
    for object_key in sorted(referenced_keys):
        media_bytes[object_key] = storage.get_bytes(object_key)
        media_row = media_by_key.get(object_key)
        if media_row is None:
            media_assets_payload.append(
                fallback_media_manifest_entry(object_key, media_bytes[object_key])
                | {"id": None, "owner_post_id": None}
            )
            continue
        media_assets_payload.append(serialize_media_asset(media_row))

    posts_payload: list[PostEntry] = []
    for post in posts:
        meta, body = serialize_post(post)
        posts_payload.append(PostEntry(meta=meta, body_markdown=body))

    return BackupBundle(
        site_profile=site_profile_payload,
        tags=[serialize_tag(tag) for tag in tags],
        post_tags=[serialize_post_tag(link) for link in post_tags],
        media_assets=media_assets_payload,
        media_bytes=media_bytes,
        posts=posts_payload,
        series=[serialize_series(s) for s in series_rows],
        series_posts=[serialize_series_post(sp) for sp in series_posts],
        post_comments=[serialize_post_comment(c) for c in comments],
        generated_at=_utcnow(),
    )
```

Update `__init__.py` to export `collect_bundle`.

Note: `fallback_media_manifest_entry` from v2 returns a dict missing `id` and `owner_post_id` — we splice those in for v3 compatibility. If the only callers of `fallback_media_manifest_entry` are now backup-related, consider relocating the helper to backup/ in a later task; for now keep it where it is.

- [ ] **Step 4: Run test to verify it passes**

Run: same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app/services/imports/backup apps/api/tests/services/test_import_archive_modules.py
git commit -m "feat(backup-v3): collect_bundle reads full session state"
```

---

### Task 11: Wire ImportService.download_posts_backup to v3

**Files:**
- Modify: `apps/api/src/app/services/import_service.py`
- Test: `apps/api/tests/services/test_import_archive_modules.py`

Replace v2 build path with v3 (collect → build_backup_zip).

- [ ] **Step 1: Write the failing test**

```python
def test_import_service_download_returns_v3_zip() -> None:
    import io
    import json
    from zipfile import ZipFile
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.db.base import Base
    from app.models.site_profile import DEFAULT_SITE_PROFILE_KEY, SiteProfile
    from app.services.import_service import ImportService

    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, expire_on_commit=False)()
    session.add(SiteProfile(key=DEFAULT_SITE_PROFILE_KEY, email="x@y.z", github_url="https://gh"))
    session.commit()

    class _Storage:
        bucket = "b"
        def ensure_bucket(self): pass
        def get_bytes(self, key): raise KeyError(key)

    service = ImportService(storage=_Storage(), db=session)
    name, payload = service.download_posts_backup()

    assert name.endswith(".zip")
    with ZipFile(io.BytesIO(payload)) as archive:
        manifest = json.loads(archive.read("manifest.json").decode())
    assert manifest["schema_version"] == "backup-v3"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && .venv\Scripts\python -m pytest tests/services/test_import_archive_modules.py::test_import_service_download_returns_v3_zip -q`

Expected: FAIL — current `import_service.py` still calls v2 `build_posts_backup_zip` and produces `schema_version == "backup-v2"`.

- [ ] **Step 3: Write minimal implementation**

Replace the `download_posts_backup` body in `apps/api/src/app/services/import_service.py`:

```python
from datetime import datetime, timezone
from app.services.imports.backup import build_backup_zip, collect_bundle


class ImportService:
    def __init__(self, storage, db=None):
        self.storage = storage
        self.db = db

    def download_posts_backup(self) -> tuple[str, bytes]:
        if self.db is None:
            from app.services.imports.errors import ImportValidationError
            raise ImportValidationError("database session is required")
        self.storage.ensure_bucket()
        bundle = collect_bundle(self.db, self.storage)
        archive_data = build_backup_zip(bundle)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        return f"traceoflight-posts-backup-{timestamp}.zip", archive_data
```

Keep `load_posts_backup` untouched for now (still calls v2 path; will be replaced in Task 14).

Drop unused v2 imports from `import_service.py` only after Task 14.

- [ ] **Step 4: Run test to verify it passes**

Run: same command as Step 2. Plus regression: `cd apps/api && .venv\Scripts\python -m pytest tests/services -q` to confirm no other test broke.

Expected: PASS for the new test. Existing v2 download tests in `test_import_archive_modules.py` may now be redundant; they remain in place (will be removed in Task 16 cleanup).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app/services/import_service.py apps/api/tests/services/test_import_archive_modules.py
git commit -m "feat(backup-v3): wire ImportService.download_posts_backup"
```

---

### Task 12: Restore coordinator — wipe phase

**Files:**
- Modify: `apps/api/src/app/services/imports/backup/restore.py`
- Modify: `apps/api/src/app/services/imports/backup/__init__.py`
- Test: `apps/api/tests/services/test_backup_restore.py`

`BackupRestoreCoordinator._wipe_database_contents(db)` deletes in FK-safe order.

- [ ] **Step 1: Write the failing test**

```python
def test_wipe_clears_all_target_tables_but_preserves_admin_credentials() -> None:
    import uuid
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import sessionmaker
    from app.db.base import Base
    from app.models.admin_credential import AdminCredential, OPERATIONAL_ADMIN_CREDENTIAL_KEY
    from app.models.media import AssetKind, MediaAsset
    from app.models.post import (
        Post, PostContentKind, PostLocale, PostStatus, PostTopMediaKind,
        PostTranslationSourceKind, PostTranslationStatus, PostVisibility,
    )
    from app.models.post_comment import PostComment, PostCommentAuthorType, PostCommentStatus, PostCommentVisibility
    from app.models.series import Series, SeriesPost
    from app.models.site_profile import DEFAULT_SITE_PROFILE_KEY, SiteProfile
    from app.models.tag import PostTag, Tag
    from app.services.imports.backup.restore import BackupRestoreCoordinator

    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, expire_on_commit=False)()

    tag = Tag(slug="py", label="Py"); session.add(tag); session.flush()
    post = Post(
        slug="x", title="X", body_markdown="b",
        top_media_kind=PostTopMediaKind.IMAGE,
        locale=PostLocale.KO, translation_group_id=uuid.uuid4(),
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
        content_kind=PostContentKind.BLOG,
        status=PostStatus.PUBLISHED, visibility=PostVisibility.PUBLIC,
    )
    session.add(post); session.flush()
    session.add(PostTag(post_id=post.id, tag_id=tag.id))
    series = Series(slug="s", title="S", description="d", locale=PostLocale.KO,
                    translation_group_id=uuid.uuid4(),
                    translation_status=PostTranslationStatus.SOURCE,
                    translation_source_kind=PostTranslationSourceKind.MANUAL)
    session.add(series); session.flush()
    session.add(SeriesPost(series_id=series.id, post_id=post.id, order_index=1))
    session.add(PostComment(
        post_id=post.id, author_name="a", author_type=PostCommentAuthorType.GUEST,
        visibility=PostCommentVisibility.PUBLIC, status=PostCommentStatus.ACTIVE,
        body="hi",
    ))
    session.add(MediaAsset(
        kind=AssetKind.IMAGE, bucket="b", object_key="image/x.png",
        original_filename="x.png", mime_type="image/png", size_bytes=1,
    ))
    session.add(SiteProfile(key=DEFAULT_SITE_PROFILE_KEY, email="x@y.z", github_url="https://gh"))
    session.add(AdminCredential(
        key=OPERATIONAL_ADMIN_CREDENTIAL_KEY, login_id="root",
        password_hash="$2b$12$abc", credential_revision=1,
    ))
    session.commit()

    BackupRestoreCoordinator._wipe_database_contents(session)
    session.commit()

    assert session.scalar(select(Post)) is None
    assert session.scalar(select(PostTag)) is None
    assert session.scalar(select(Tag)) is None
    assert session.scalar(select(Series)) is None
    assert session.scalar(select(SeriesPost)) is None
    assert session.scalar(select(PostComment)) is None
    assert session.scalar(select(MediaAsset)) is None
    assert session.scalar(select(SiteProfile)) is None
    assert session.scalar(select(AdminCredential)) is not None  # preserved
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && .venv\Scripts\python -m pytest tests/services/test_backup_restore.py::test_wipe_clears_all_target_tables_but_preserves_admin_credentials -q`

Expected: FAIL with `ImportError`.

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/app/services/imports/backup/restore.py`:

```python
from __future__ import annotations

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models.media import MediaAsset
from app.models.post import Post
from app.models.post_comment import PostComment
from app.models.project_profile import ProjectProfile
from app.models.series import Series, SeriesPost
from app.models.site_profile import SiteProfile
from app.models.tag import PostTag, Tag


class BackupRestoreCoordinator:
    @staticmethod
    def _wipe_database_contents(db: Session) -> None:
        db.execute(delete(PostComment))
        db.execute(delete(SeriesPost))
        db.execute(delete(PostTag))
        db.execute(delete(ProjectProfile))
        db.execute(delete(Post))
        db.execute(delete(Series))
        db.execute(delete(Tag))
        db.execute(delete(MediaAsset))
        db.execute(delete(SiteProfile))
```

Update `__init__.py` to export `BackupRestoreCoordinator`.

- [ ] **Step 4: Run test to verify it passes**

Run: same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app/services/imports/backup apps/api/tests/services/test_backup_restore.py
git commit -m "feat(backup-v3): restore wipe phase"
```

---

### Task 13: Restore coordinator — insert phase with comment two-pass

**Files:**
- Modify: `apps/api/src/app/services/imports/backup/restore.py`
- Test: `apps/api/tests/services/test_backup_restore.py`

`_insert_database_contents(db, bundle)` inserts in the order Tag → Post (with cascade ProjectProfile) → MediaAsset → PostTag → Series → SeriesPost → PostComment (root pass then reply pass) → SiteProfile.

- [ ] **Step 1: Write the failing test**

```python
def test_insert_phase_creates_all_rows_with_preserved_uuids() -> None:
    import uuid
    from datetime import datetime, timezone
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import sessionmaker
    from app.db.base import Base
    from app.models.media import MediaAsset
    from app.models.post import Post
    from app.models.post_comment import PostComment
    from app.models.series import Series, SeriesPost
    from app.models.site_profile import SiteProfile
    from app.models.tag import PostTag, Tag
    from app.services.imports.backup import BackupBundle, PostEntry
    from app.services.imports.backup.restore import BackupRestoreCoordinator

    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, expire_on_commit=False)()

    post_id = "11111111-1111-1111-1111-111111111111"
    tag_id = "22222222-2222-2222-2222-222222222222"
    series_id = "33333333-3333-3333-3333-333333333333"
    sp_id = "44444444-4444-4444-4444-444444444444"
    media_id = "55555555-5555-5555-5555-555555555555"
    root_id = "66666666-6666-6666-6666-666666666666"
    reply_id = "77777777-7777-7777-7777-777777777777"

    bundle = BackupBundle(
        site_profile={"key": "default", "email": "x@y.z", "github_url": "https://gh"},
        tags=[{"id": tag_id, "slug": "py", "label": "Py"}],
        post_tags=[{"post_id": post_id, "tag_id": tag_id}],
        media_assets=[{
            "id": media_id, "kind": "image", "bucket": "b", "object_key": "image/x.png",
            "original_filename": "x.png", "mime_type": "image/png", "size_bytes": 1,
            "width": None, "height": None, "duration_seconds": None,
            "owner_post_id": post_id,
        }],
        media_bytes={},
        posts=[PostEntry(
            meta={
                "id": post_id, "slug": "x", "title": "X", "excerpt": None,
                "cover_image_url": None,
                "top_media_kind": "image", "top_media_image_url": None,
                "top_media_youtube_url": None, "top_media_video_url": None,
                "project_order_index": None, "series_title": None,
                "locale": "ko",
                "translation_group_id": "88888888-8888-8888-8888-888888888888",
                "source_post_id": None,
                "translation_status": "source",
                "translation_source_kind": "manual",
                "translated_from_hash": None,
                "content_kind": "blog",
                "status": "published", "visibility": "public",
                "published_at": None, "project_profile": None,
            },
            body_markdown="hello",
        )],
        series=[{
            "id": series_id, "slug": "s", "title": "S", "description": "d",
            "cover_image_url": None, "list_order_index": None,
            "translation_group_id": "99999999-9999-9999-9999-999999999999",
            "locale": "ko", "source_series_id": None,
            "translation_status": "source", "translation_source_kind": "manual",
            "translated_from_hash": None,
        }],
        series_posts=[{"id": sp_id, "series_id": series_id, "post_id": post_id, "order_index": 1}],
        post_comments=[
            # Reply listed BEFORE root to verify two-pass ordering works regardless of input order.
            {
                "id": reply_id, "post_id": post_id, "root_comment_id": root_id,
                "reply_to_comment_id": root_id, "author_name": "Re",
                "author_type": "guest", "password_hash": None,
                "visibility": "public", "status": "active", "body": "reply",
                "deleted_at": None, "last_edited_at": None,
                "request_ip_hash": None, "user_agent_hash": None,
            },
            {
                "id": root_id, "post_id": post_id, "root_comment_id": None,
                "reply_to_comment_id": None, "author_name": "Root",
                "author_type": "guest", "password_hash": None,
                "visibility": "public", "status": "active", "body": "root",
                "deleted_at": None, "last_edited_at": None,
                "request_ip_hash": None, "user_agent_hash": None,
            },
        ],
        generated_at=datetime(2026, 5, 5, tzinfo=timezone.utc),
    )

    BackupRestoreCoordinator._insert_database_contents(session, bundle)
    session.commit()

    restored_post = session.scalar(select(Post).where(Post.id == uuid.UUID(post_id)))
    assert restored_post is not None and restored_post.slug == "x"
    media = session.scalar(select(MediaAsset).where(MediaAsset.id == uuid.UUID(media_id)))
    assert media is not None and media.owner_post_id == uuid.UUID(post_id)
    assert session.scalar(select(Tag).where(Tag.id == uuid.UUID(tag_id))) is not None
    assert session.scalar(select(PostTag)) is not None
    assert session.scalar(select(Series).where(Series.id == uuid.UUID(series_id))) is not None
    sp = session.scalar(select(SeriesPost).where(SeriesPost.id == uuid.UUID(sp_id)))
    assert sp is not None and sp.order_index == 1
    root = session.scalar(select(PostComment).where(PostComment.id == uuid.UUID(root_id)))
    reply = session.scalar(select(PostComment).where(PostComment.id == uuid.UUID(reply_id)))
    assert root is not None and root.root_comment_id is None
    assert reply is not None and reply.root_comment_id == uuid.UUID(root_id)
    profile = session.scalar(select(SiteProfile))
    assert profile is not None and profile.email == "x@y.z"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && .venv\Scripts\python -m pytest tests/services/test_backup_restore.py::test_insert_phase_creates_all_rows_with_preserved_uuids -q`

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Append to `restore.py`:

```python
from app.services.imports.backup.bundle import BackupBundle
from app.services.imports.backup.deserialize import (
    deserialize_media_asset,
    deserialize_post,
    deserialize_post_comment,
    deserialize_post_tag,
    deserialize_series,
    deserialize_series_post,
    deserialize_site_profile,
    deserialize_tag,
)


class BackupRestoreCoordinator:  # extend the previous class
    @staticmethod
    def _insert_database_contents(db: Session, bundle: BackupBundle) -> None:
        with db.no_autoflush:
            for tag_payload in bundle.tags:
                db.add(deserialize_tag(tag_payload))

            for entry in bundle.posts:
                db.add(deserialize_post(entry.meta, entry.body_markdown))
            db.flush()

            for media_payload in bundle.media_assets:
                db.add(deserialize_media_asset(media_payload))

            for link_payload in bundle.post_tags:
                db.add(deserialize_post_tag(link_payload))

            for series_payload in bundle.series:
                db.add(deserialize_series(series_payload))
            db.flush()

            for sp_payload in bundle.series_posts:
                db.add(deserialize_series_post(sp_payload))

            roots = [
                payload for payload in bundle.post_comments
                if payload.get("root_comment_id") in (None, payload["id"])
            ]
            replies = [
                payload for payload in bundle.post_comments
                if payload.get("root_comment_id") not in (None, payload["id"])
            ]
            for payload in roots:
                db.add(deserialize_post_comment(payload))
            db.flush()
            for payload in replies:
                db.add(deserialize_post_comment(payload))

            if bundle.site_profile is not None:
                db.add(deserialize_site_profile(bundle.site_profile))
```

- [ ] **Step 4: Run test to verify it passes**

Run: same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app/services/imports/backup apps/api/tests/services/test_backup_restore.py
git commit -m "feat(backup-v3): restore insert phase with comment two-pass"
```

---

### Task 14: Restore coordinator — media staging/promote/rollback + restore() entry point

**Files:**
- Modify: `apps/api/src/app/services/imports/backup/restore.py`
- Test: `apps/api/tests/services/test_backup_restore.py`

Port v2 staging pattern (`_stage_media_payloads` → `_promote_staged_media` → cleanup), plus `restore()` orchestrator returning `BackupLoadRead`.

- [ ] **Step 1: Write the failing test**

```python
def test_restore_replaces_seeded_state_and_promotes_media() -> None:
    from datetime import datetime, timezone
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import sessionmaker
    from app.db.base import Base
    from app.models.post import Post
    from app.services.imports.backup import (
        BackupBundle, PostEntry, BackupRestoreCoordinator,
    )

    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, expire_on_commit=False)()

    # Seed pre-existing post that should be wiped.
    from app.models.post import (
        PostContentKind, PostLocale, PostStatus, PostTopMediaKind,
        PostTranslationSourceKind, PostTranslationStatus, PostVisibility,
    )
    import uuid
    pre = Post(
        slug="old", title="old", body_markdown="b",
        top_media_kind=PostTopMediaKind.IMAGE,
        locale=PostLocale.KO, translation_group_id=uuid.uuid4(),
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
        content_kind=PostContentKind.BLOG,
        status=PostStatus.PUBLISHED, visibility=PostVisibility.PUBLIC,
    )
    session.add(pre); session.commit()

    storage = _StorageStub()  # the stub already in this test file
    bundle = BackupBundle(
        site_profile={"key": "default", "email": "x@y.z", "github_url": "https://gh"},
        tags=[], post_tags=[],
        media_assets=[{
            "id": "55555555-5555-5555-5555-555555555555", "kind": "image",
            "bucket": "b", "object_key": "image/cover.png",
            "original_filename": "cover.png", "mime_type": "image/png",
            "size_bytes": 5, "width": None, "height": None,
            "duration_seconds": None, "owner_post_id": None,
        }],
        media_bytes={"image/cover.png": b"cover"},
        posts=[PostEntry(
            meta={
                "id": "11111111-1111-1111-1111-111111111111", "slug": "new", "title": "New",
                "excerpt": None,
                "cover_image_url": "/media/image/cover.png",
                "top_media_kind": "image", "top_media_image_url": None,
                "top_media_youtube_url": None, "top_media_video_url": None,
                "project_order_index": None, "series_title": None,
                "locale": "ko",
                "translation_group_id": "22222222-2222-2222-2222-222222222222",
                "source_post_id": None,
                "translation_status": "source",
                "translation_source_kind": "manual",
                "translated_from_hash": None,
                "content_kind": "blog",
                "status": "published", "visibility": "public",
                "published_at": None, "project_profile": None,
            },
            body_markdown="hi",
        )],
        series=[], series_posts=[], post_comments=[],
        generated_at=datetime(2026, 5, 5, tzinfo=timezone.utc),
    )

    coordinator = BackupRestoreCoordinator(storage=storage, db=session)
    result = coordinator.restore(bundle)

    assert result.restored_posts == 1
    assert result.restored_media == 1
    assert session.scalar(select(Post).where(Post.slug == "old")) is None
    assert session.scalar(select(Post).where(Post.slug == "new")) is not None
    assert storage.object_bytes["image/cover.png"] == b"cover"


def test_restore_rolls_back_db_and_media_when_insert_fails(monkeypatch) -> None:
    import uuid
    from datetime import datetime, timezone
    from sqlalchemy import select
    from app.models.post import (
        Post, PostContentKind, PostLocale, PostStatus, PostTopMediaKind,
        PostTranslationSourceKind, PostTranslationStatus, PostVisibility,
    )
    from app.services.imports.backup import (
        BackupBundle, PostEntry, BackupRestoreCoordinator,
    )

    session = _session()
    pre = Post(
        slug="seed", title="seed", body_markdown="b",
        top_media_kind=PostTopMediaKind.IMAGE,
        locale=PostLocale.KO, translation_group_id=uuid.uuid4(),
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
        content_kind=PostContentKind.BLOG,
        status=PostStatus.PUBLISHED, visibility=PostVisibility.PUBLIC,
    )
    session.add(pre); session.commit()

    storage = _StorageStub(object_bytes={"image/cover.png": b"old-cover"})
    bundle = BackupBundle(
        site_profile={"key": "default", "email": "x@y.z", "github_url": "https://gh"},
        tags=[], post_tags=[],
        media_assets=[{
            "id": "55555555-5555-5555-5555-555555555555", "kind": "image",
            "bucket": "b", "object_key": "image/cover.png",
            "original_filename": "cover.png", "mime_type": "image/png", "size_bytes": 5,
            "width": None, "height": None, "duration_seconds": None, "owner_post_id": None,
        }],
        media_bytes={"image/cover.png": b"new-cover"},
        posts=[PostEntry(
            meta={
                "id": "11111111-1111-1111-1111-111111111111", "slug": "x", "title": "X",
                "excerpt": None, "cover_image_url": "/media/image/cover.png",
                "top_media_kind": "image", "top_media_image_url": None,
                "top_media_youtube_url": None, "top_media_video_url": None,
                "project_order_index": None, "series_title": None,
                "locale": "ko",
                "translation_group_id": "22222222-2222-2222-2222-222222222222",
                "source_post_id": None, "translation_status": "source",
                "translation_source_kind": "manual", "translated_from_hash": None,
                "content_kind": "blog", "status": "published", "visibility": "public",
                "published_at": None, "project_profile": None,
            },
            body_markdown="hi",
        )],
        series=[], series_posts=[], post_comments=[],
        generated_at=datetime(2026, 5, 5, tzinfo=timezone.utc),
    )

    coordinator = BackupRestoreCoordinator(storage=storage, db=session)

    def fail_after_promote(*args, **kwargs):
        raise RuntimeError("simulated insert failure")

    monkeypatch.setattr(coordinator, "_insert_database_contents", fail_after_promote)

    import pytest
    with pytest.raises(RuntimeError, match="simulated insert failure"):
        coordinator.restore(bundle)

    assert session.scalar(select(Post).where(Post.slug == "seed")) is not None
    assert storage.object_bytes["image/cover.png"] == b"old-cover"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && .venv\Scripts\python -m pytest tests/services/test_backup_restore.py::test_restore_replaces_seeded_state_and_promotes_media -q`

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Append/extend `restore.py`:

```python
import uuid
from collections.abc import Iterable

from app.schemas.imports import BackupLoadRead


class BackupRestoreCoordinator:
    def __init__(self, *, storage, db: Session) -> None:
        self.storage = storage
        self.db = db

    def restore(self, bundle: BackupBundle) -> BackupLoadRead:
        staged_keys = self._stage_media_payloads(bundle)
        previous_objects = self._snapshot_existing_final_objects(bundle)
        try:
            self._promote_staged_media(bundle, staged_keys)
            try:
                with self.db.begin():
                    self._wipe_database_contents(self.db)
                    self._insert_database_contents(self.db, bundle)
            except Exception:
                self._rollback_promoted_media(bundle, previous_objects)
                raise
            self.db.expire_all()
            return BackupLoadRead(
                restored_posts=len(bundle.posts),
                restored_media=len(bundle.media_assets),
                restored_series_overrides=0,
            )
        finally:
            self._cleanup_staged_media(staged_keys.values())

    def _stage_media_payloads(self, bundle: BackupBundle) -> dict[str, str]:
        self.storage.ensure_bucket()
        stage_id = uuid.uuid4().hex
        staged_keys: dict[str, str] = {}
        try:
            for object_key, payload in bundle.media_bytes.items():
                staged_key = f"imports/backups/staging/{stage_id}/{object_key}"
                mime_type = next(
                    (str(m["mime_type"]) for m in bundle.media_assets
                     if str(m["object_key"]) == object_key),
                    "application/octet-stream",
                )
                self.storage.put_bytes(
                    object_key=staged_key, data=payload, content_type=mime_type,
                )
                staged_keys[object_key] = staged_key
        except Exception:
            self._cleanup_staged_media(staged_keys.values())
            raise
        return staged_keys

    def _snapshot_existing_final_objects(
        self, bundle: BackupBundle,
    ) -> dict[str, bytes | None]:
        previous_objects: dict[str, bytes | None] = {}
        for object_key in bundle.media_bytes:
            previous_objects[object_key] = (
                self.storage.get_bytes(object_key)
                if self.storage.object_exists(object_key)
                else None
            )
        return previous_objects

    def _promote_staged_media(
        self, bundle: BackupBundle, staged_keys: dict[str, str],
    ) -> None:
        for object_key, staged_key in staged_keys.items():
            mime_type = next(
                (str(m["mime_type"]) for m in bundle.media_assets
                 if str(m["object_key"]) == object_key),
                "application/octet-stream",
            )
            self.storage.put_bytes(
                object_key=object_key,
                data=self.storage.get_bytes(staged_key),
                content_type=mime_type,
            )

    def _rollback_promoted_media(
        self, bundle: BackupBundle, previous_objects: dict[str, bytes | None],
    ) -> None:
        for object_key, previous_bytes in previous_objects.items():
            mime_type = next(
                (str(m["mime_type"]) for m in bundle.media_assets
                 if str(m["object_key"]) == object_key),
                "application/octet-stream",
            )
            if previous_bytes is None:
                self.storage.delete_object(object_key)
                continue
            self.storage.put_bytes(
                object_key=object_key, data=previous_bytes, content_type=mime_type,
            )

    def _cleanup_staged_media(self, staged_keys: Iterable[str]) -> None:
        for staged_key in staged_keys:
            try:
                self.storage.delete_object(staged_key)
            except Exception:
                continue
```

- [ ] **Step 4: Run test to verify it passes**

Run: same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app/services/imports/backup apps/api/tests/services/test_backup_restore.py
git commit -m "feat(backup-v3): restore media staging + restore() entry"
```

---

### Task 15: Wire ImportService.load_posts_backup to v3 and drop projection rebuild

**Files:**
- Modify: `apps/api/src/app/services/import_service.py`
- Test: `apps/api/tests/services/test_backup_restore.py`

Replace v2 path with v3 (parse_backup_zip → BackupRestoreCoordinator.restore). Remove `rebuild_series_projection_cache` import and call (it's now harmful per design spec).

- [ ] **Step 1: Write the failing test**

```python
def test_load_posts_backup_round_trip_through_zip() -> None:
    import io
    from datetime import datetime, timezone
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import sessionmaker
    from app.db.base import Base
    from app.models.post import Post
    from app.services.imports.backup import (
        BackupBundle, PostEntry, build_backup_zip,
    )
    from app.services.import_service import ImportService

    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, expire_on_commit=False)()

    bundle = BackupBundle(
        site_profile={"key": "default", "email": "x@y.z", "github_url": "https://gh"},
        tags=[], post_tags=[], media_assets=[], media_bytes={},
        posts=[PostEntry(
            meta={
                "id": "11111111-1111-1111-1111-111111111111", "slug": "new", "title": "New",
                "excerpt": None,
                "cover_image_url": None, "top_media_kind": "image",
                "top_media_image_url": None, "top_media_youtube_url": None,
                "top_media_video_url": None, "project_order_index": None,
                "series_title": None, "locale": "ko",
                "translation_group_id": "22222222-2222-2222-2222-222222222222",
                "source_post_id": None, "translation_status": "source",
                "translation_source_kind": "manual", "translated_from_hash": None,
                "content_kind": "blog", "status": "published", "visibility": "public",
                "published_at": None, "project_profile": None,
            },
            body_markdown="hi",
        )],
        series=[], series_posts=[], post_comments=[],
        generated_at=datetime(2026, 5, 5, tzinfo=timezone.utc),
    )
    zip_bytes = build_backup_zip(bundle)

    service = ImportService(storage=_StorageStub(), db=session)
    result = service.load_posts_backup("backup.zip", zip_bytes)

    assert result.restored_posts == 1
    assert session.scalar(select(Post).where(Post.slug == "new")) is not None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && .venv\Scripts\python -m pytest tests/services/test_backup_restore.py::test_load_posts_backup_round_trip_through_zip -q`

Expected: FAIL — `import_service.py` still uses v2 path.

- [ ] **Step 3: Write minimal implementation**

Replace `load_posts_backup` body in `import_service.py`:

```python
def load_posts_backup(self, filename: str, data: bytes) -> "BackupLoadRead":
    from app.services.imports.errors import ImportValidationError
    from app.services.imports.backup import parse_backup_zip, BackupRestoreCoordinator
    if self.db is None:
        raise ImportValidationError("database session is required")
    if not filename.strip():
        raise ImportValidationError("backup filename is required")
    if not data:
        raise ImportValidationError("backup file is empty")
    bundle = parse_backup_zip(data)
    return BackupRestoreCoordinator(storage=self.storage, db=self.db).restore(bundle)
```

Remove `from app.services.series_projection_cache import rebuild_series_projection_cache` import and any references — restore no longer calls it.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && .venv\Scripts\python -m pytest tests/services/test_backup_restore.py -q`. The new test passes; some legacy v2 tests will now fail (Task 16 cleans them up).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app/services/import_service.py apps/api/tests/services/test_backup_restore.py
git commit -m "feat(backup-v3): wire ImportService.load_posts_backup; drop projection rebuild"
```

---

### Task 16: Delete v2 modules and update imports/__init__.py exports

**Files:**
- Delete: `apps/api/src/app/services/imports/backup_archive.py`
- Delete: `apps/api/src/app/services/imports/backup_restore.py`
- Delete: `apps/api/src/app/services/imports/models.py` (if no consumer outside backup pipeline; otherwise prune it to non-backup helpers only)
- Modify: `apps/api/src/app/services/imports/__init__.py`
- Modify: `apps/api/tests/services/test_import_archive_modules.py`
- Modify: `apps/api/tests/services/test_backup_restore.py`

- [ ] **Step 1: Search for stale callers**

Run: `cd apps/api && grep -rn "backup_archive\|backup_restore\|SnapshotBundle\|BACKUP_SCHEMA_VERSION = \"backup-v2\"" src tests`

Confirm no production import outside the deleted files. If any exist (e.g., `import_service.py` still references something), update them to the new module.

- [ ] **Step 2: Delete v2 modules**

```bash
git rm apps/api/src/app/services/imports/backup_archive.py
git rm apps/api/src/app/services/imports/backup_restore.py
```

For `models.py`: check `grep -rn "from app.services.imports.models\|from .models" apps/api`. If only backup-internal consumers remain (which were rewritten in Tasks 2–15), `git rm` it; otherwise keep `parse_datetime`, `to_iso_utc`, etc. and remove only `SnapshotBundle`.

- [ ] **Step 3: Update `apps/api/src/app/services/imports/__init__.py`**

Replace its content with:

```python
from app.services.imports.backup import (
    BACKUP_SCHEMA_VERSION,
    BackupBundle,
    BackupRestoreCoordinator,
    PostEntry,
    build_backup_zip,
    collect_bundle,
    parse_backup_zip,
)
from app.services.imports.errors import ImportServiceError, ImportValidationError
from app.services.imports.media_refs import (
    extract_internal_object_key,
    extract_markdown_media_object_keys,
    fallback_media_manifest_entry,
    guess_asset_kind,
)

__all__ = [
    "BACKUP_SCHEMA_VERSION",
    "BackupBundle",
    "BackupRestoreCoordinator",
    "PostEntry",
    "ImportServiceError",
    "ImportValidationError",
    "build_backup_zip",
    "collect_bundle",
    "extract_internal_object_key",
    "extract_markdown_media_object_keys",
    "fallback_media_manifest_entry",
    "guess_asset_kind",
    "parse_backup_zip",
]
```

- [ ] **Step 4: Remove the now-stale v2 tests**

In `apps/api/tests/services/test_import_archive_modules.py`, delete:
- `test_backup_archive_roundtrip_preserves_posts_media_and_series_overrides`
- `test_backup_archive_parser_keeps_legacy_backup_v1_compatibility`

In `apps/api/tests/services/test_backup_restore.py`, delete:
- `test_backup_restore_restores_project_and_top_media_fields`
- `test_backup_restore_cleanup_runs_when_media_staging_fails` (port to v3 in Task 17 if missing — see below)
- `test_backup_restore_rolls_back_database_if_restore_step_fails_after_clear` (same)
- `test_backup_restore_restores_previous_media_objects_if_db_work_fails_after_promotion` (same)

Keep `_StorageStub`, `_session()`, `_seed_post()` helpers — they're reused by v3 tests.

- [ ] **Step 5: Run the full test suite**

Run: `cd apps/api && .venv\Scripts\python -m pytest tests -q`

Expected: PASS. Any failure here means a stale import that wasn't migrated.

- [ ] **Step 6: Commit**

```bash
git add -A apps/api
git commit -m "refactor(backup-v3): remove backup-v2 modules and tests"
```

---

### Task 17: Port v2 rollback regression tests to v3 + comment two-pass edge case

**Files:**
- Modify: `apps/api/tests/services/test_backup_restore.py`

The v2 tests covered staging failure rollback, db rollback, and media restore-after-promote-failure. Re-add these against v3 to lock the same regressions.

- [ ] **Step 1: Write the failing tests**

```python
def test_backup_restore_cleanup_runs_when_media_staging_fails_v3() -> None:
    from datetime import datetime, timezone
    from sqlalchemy import select
    from app.models.post import Post
    from app.services.imports.backup import (
        BackupBundle, PostEntry, BackupRestoreCoordinator,
    )

    session = _session()
    _seed_post(session)
    storage = _StorageStub(fail_on_put_number=2)

    bundle = BackupBundle(
        site_profile={"key": "default", "email": "x@y.z", "github_url": "https://gh"},
        tags=[], post_tags=[],
        media_assets=[
            {"id": "55555555-5555-5555-5555-555555555555", "kind": "image",
             "bucket": "b", "object_key": "image/a.png",
             "original_filename": "a.png", "mime_type": "image/png", "size_bytes": 1,
             "width": None, "height": None, "duration_seconds": None, "owner_post_id": None},
            {"id": "66666666-6666-6666-6666-666666666666", "kind": "image",
             "bucket": "b", "object_key": "image/b.png",
             "original_filename": "b.png", "mime_type": "image/png", "size_bytes": 1,
             "width": None, "height": None, "duration_seconds": None, "owner_post_id": None},
        ],
        media_bytes={"image/a.png": b"a", "image/b.png": b"b"},
        posts=[], series=[], series_posts=[], post_comments=[],
        generated_at=datetime(2026, 5, 5, tzinfo=timezone.utc),
    )
    coordinator = BackupRestoreCoordinator(storage=storage, db=session)

    import pytest
    with pytest.raises(RuntimeError, match="simulated storage put failure"):
        coordinator.restore(bundle)

    assert any(call.endswith("/image/a.png") for call in storage.delete_calls)
    assert session.scalar(select(Post).where(Post.slug == "existing-post")) is not None


def test_backup_restore_restores_previous_media_objects_when_db_fails_after_promote_v3(monkeypatch) -> None:
    from datetime import datetime, timezone
    from sqlalchemy import select
    from app.models.post import Post
    from app.services.imports.backup import (
        BackupBundle, PostEntry, BackupRestoreCoordinator,
    )

    session = _session()
    _seed_post(session)
    storage = _StorageStub(object_bytes={
        "image/cover.png": b"old-cover",
        "image/body.png": b"old-body",
    })
    bundle = BackupBundle(
        site_profile={"key": "default", "email": "x@y.z", "github_url": "https://gh"},
        tags=[], post_tags=[],
        media_assets=[
            {"id": "55555555-5555-5555-5555-555555555555", "kind": "image",
             "bucket": "b", "object_key": "image/cover.png",
             "original_filename": "cover.png", "mime_type": "image/png", "size_bytes": 5,
             "width": None, "height": None, "duration_seconds": None, "owner_post_id": None},
            {"id": "66666666-6666-6666-6666-666666666666", "kind": "image",
             "bucket": "b", "object_key": "image/body.png",
             "original_filename": "body.png", "mime_type": "image/png", "size_bytes": 4,
             "width": None, "height": None, "duration_seconds": None, "owner_post_id": None},
        ],
        media_bytes={"image/cover.png": b"new-cover", "image/body.png": b"new-body"},
        posts=[], series=[], series_posts=[], post_comments=[],
        generated_at=datetime(2026, 5, 5, tzinfo=timezone.utc),
    )

    coordinator = BackupRestoreCoordinator(storage=storage, db=session)

    def fail_after_promote(*args, **kwargs):
        raise RuntimeError("simulated db failure after promote")

    monkeypatch.setattr(coordinator, "_insert_database_contents", fail_after_promote)

    import pytest
    with pytest.raises(RuntimeError, match="simulated db failure after promote"):
        coordinator.restore(bundle)

    assert storage.object_bytes["image/cover.png"] == b"old-cover"
    assert storage.object_bytes["image/body.png"] == b"old-body"
    assert session.scalar(select(Post).where(Post.slug == "existing-post")) is not None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && .venv\Scripts\python -m pytest tests/services/test_backup_restore.py -q`

Expected: FAIL (the new tests reach assertions that don't yet hold or are missing).

- [ ] **Step 3: Implement (no production code change expected)**

The v3 restore coordinator already has rollback paths. If a test uncovers a regression, fix the path in `restore.py`.

- [ ] **Step 4: Run tests to verify they pass**

Run: same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/tests/services/test_backup_restore.py apps/api/src/app/services/imports/backup
git commit -m "test(backup-v3): port v2 rollback regressions"
```

---

### Task 18: Update imports API smoke test

**Files:**
- Modify: `apps/api/tests/api/test_imports_api.py`

The router `/internal-api/imports/backups/posts.zip` and `/.../load` are unchanged, but the e2e fixture must use a v3 ZIP.

- [ ] **Step 1: Inspect existing test**

Run: `cd apps/api && grep -n "backup" tests/api/test_imports_api.py | head -40`

Identify scenarios that build/parse a backup ZIP. Each must switch to v3 helpers.

- [ ] **Step 2: Update tests**

Replace any usage of `build_posts_backup_zip` (v2) with the v3 build helper:

```python
from app.services.imports.backup import BackupBundle, PostEntry, build_backup_zip
# ... build a minimal v3 BackupBundle and call build_backup_zip(bundle)
```

Replace assertions on `schema_version == "backup-v2"` with `"backup-v3"`. Replace assertions on legacy file paths (`posts/<slug>/meta.json`) with `posts/<translation_group_id>/<locale>/meta.json`.

- [ ] **Step 3: Run tests**

Run: `cd apps/api && .venv\Scripts\python -m pytest tests/api/test_imports_api.py -q`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/tests/api/test_imports_api.py
git commit -m "test(backup-v3): update imports API smoke to v3 ZIP shape"
```

---

### Task 19: End-to-end roundtrip integration test

**Files:**
- Modify: `apps/api/tests/services/test_backup_restore.py`

Lock the high-value invariant: seed DB → download backup → wipe → load backup → query DB → state matches seed exactly.

- [ ] **Step 1: Write the failing test**

```python
def test_full_roundtrip_seed_download_wipe_load_matches_seed() -> None:
    import uuid
    from datetime import datetime, timezone
    from sqlalchemy import select
    from app.models.media import AssetKind, MediaAsset
    from app.models.post import (
        Post, PostContentKind, PostLocale, PostStatus, PostTopMediaKind,
        PostTranslationSourceKind, PostTranslationStatus, PostVisibility,
    )
    from app.models.post_comment import (
        PostComment, PostCommentAuthorType, PostCommentStatus, PostCommentVisibility,
    )
    from app.models.series import Series, SeriesPost
    from app.models.site_profile import DEFAULT_SITE_PROFILE_KEY, SiteProfile
    from app.models.tag import PostTag, Tag
    from app.services.import_service import ImportService

    session = _session()
    storage = _StorageStub(object_bytes={"image/cover.png": b"cover-bytes"})

    # Seed a representative state: KO post w/ tag, KO series, comment, site profile.
    site = SiteProfile(key=DEFAULT_SITE_PROFILE_KEY, email="x@y.z", github_url="https://gh")
    tag = Tag(slug="py", label="Python")
    session.add(site); session.add(tag); session.flush()

    post = Post(
        slug="alpha", title="Alpha", excerpt="s",
        body_markdown="hello", cover_image_url="/media/image/cover.png",
        top_media_kind=PostTopMediaKind.IMAGE,
        top_media_image_url=None, top_media_youtube_url=None, top_media_video_url=None,
        project_order_index=None, series_title="S",
        locale=PostLocale.KO, translation_group_id=uuid.uuid4(),
        source_post_id=None,
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
        translated_from_hash=None,
        content_kind=PostContentKind.BLOG,
        status=PostStatus.PUBLISHED, visibility=PostVisibility.PUBLIC,
        published_at=datetime(2026, 5, 1, tzinfo=timezone.utc),
    )
    session.add(post); session.flush()
    session.add(PostTag(post_id=post.id, tag_id=tag.id))
    session.add(MediaAsset(
        kind=AssetKind.IMAGE, bucket="traceoflight-test", object_key="image/cover.png",
        original_filename="cover.png", mime_type="image/png", size_bytes=11,
        owner_post_id=post.id,
    ))
    series = Series(
        slug="s", title="S", description="d",
        locale=PostLocale.KO, translation_group_id=uuid.uuid4(),
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
    )
    session.add(series); session.flush()
    session.add(SeriesPost(series_id=series.id, post_id=post.id, order_index=1))
    session.add(PostComment(
        post_id=post.id, author_name="Hee", author_type=PostCommentAuthorType.GUEST,
        visibility=PostCommentVisibility.PUBLIC, status=PostCommentStatus.ACTIVE,
        body="hi",
    ))
    session.commit()

    seed_post_id = post.id
    seed_series_id = series.id

    # Download.
    service = ImportService(storage=storage, db=session)
    _, payload = service.download_posts_backup()

    # Wipe + restore.
    fresh_session = _session()
    fresh_storage = _StorageStub()
    fresh_service = ImportService(storage=fresh_storage, db=fresh_session)
    fresh_service.load_posts_backup("roundtrip.zip", payload)

    # Query restored state.
    restored_post = fresh_session.scalar(select(Post).where(Post.slug == "alpha"))
    assert restored_post is not None
    assert restored_post.id == seed_post_id, "Post UUID must be preserved"
    assert {tag.slug for tag in restored_post.tags} == {"py"}
    restored_series = fresh_session.scalar(select(Series).where(Series.slug == "s"))
    assert restored_series is not None and restored_series.id == seed_series_id
    sp = fresh_session.scalar(select(SeriesPost).where(SeriesPost.series_id == seed_series_id))
    assert sp is not None and sp.post_id == seed_post_id
    assert fresh_session.scalar(select(PostComment).where(PostComment.post_id == seed_post_id)) is not None
    assert fresh_session.scalar(select(SiteProfile)) is not None
    media = fresh_session.scalar(select(MediaAsset).where(MediaAsset.object_key == "image/cover.png"))
    assert media is not None and media.owner_post_id == seed_post_id
    assert fresh_storage.object_bytes["image/cover.png"] == b"cover-bytes"
```

- [ ] **Step 2: Run the test**

Run: `cd apps/api && .venv\Scripts\python -m pytest tests/services/test_backup_restore.py::test_full_roundtrip_seed_download_wipe_load_matches_seed -q`

Expected: PASS (all individual phases were tested already; this asserts the integration).

- [ ] **Step 3: If failing, debug**

Common failure modes to check:
- Tag not preserved (`tag.label` should equal "Python" not "py").
- `MediaAsset.owner_post_id` lost (Task 4 ensures preservation).
- `SeriesPost.id` regenerated (means `rebuild_series_projection_cache` was still called somewhere — check Task 15 cleanup).

Fix the underlying production code, not the test.

- [ ] **Step 4: Commit**

```bash
git add apps/api/tests/services/test_backup_restore.py
git commit -m "test(backup-v3): full seed→download→wipe→load roundtrip"
```

---

### Task 20: Final regression sweep + branch cleanup

**Files:** none (verification only).

- [ ] **Step 1: Run the full API test suite**

Run: `cd apps/api && .venv\Scripts\python -m pytest tests -q`

Expected: PASS.

- [ ] **Step 2: Run ruff/format if configured**

Run: `cd apps/api && .venv\Scripts\python -m ruff check src tests` and `... ruff format --check src tests` (if these commands exist in the project's tooling per `apps/api/pyproject.toml`).

Fix anything it flags.

- [ ] **Step 3: Verify no leftover v2 references**

Run: `cd apps/api && grep -rn "backup-v2\|build_posts_backup_zip\|parse_posts_backup_zip\|SnapshotBundle\|series_overrides" src tests`

Expected: zero hits in `src/`. In `tests/` may legitimately appear if a test name still mentions "v2 rejection" — that's fine.

- [ ] **Step 4: Push branch**

```bash
git push -u origin feat/backup-v3
```

(User has explicit branch autonomy per memory; pushing the feature branch to origin is fine. Do NOT merge to main without explicit confirmation.)

- [ ] **Step 5: Final summary**

Briefly state to the user: branch `feat/backup-v3` pushed, X commits, full test suite green, ready for review/merge.

---

## Out of scope (not implemented in this plan)

- v2→v3 ZIP conversion script.
- Frontend admin panel changes.
- Removing `series_projection_cache.py` (still used by post edit flows; only the post-restore call is dropped).
- New migrations (no schema change).
- AdminCredential backup/restore (excluded by spec).
