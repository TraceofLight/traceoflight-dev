from __future__ import annotations

import io
import json
from zipfile import ZipFile

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.post import Post, PostStatus, PostVisibility
from app.services import import_service as import_service_module
from app.services.import_service import ImportService, SnapshotBundle
from app.schemas.imports import ImportMode


class _StorageStub:
    def __init__(
        self,
        snapshot_data: bytes | None = None,
        object_bytes: dict[str, bytes] | None = None,
    ) -> None:
        self.snapshot_data = snapshot_data
        self.object_bytes = object_bytes or {}

    def ensure_bucket(self) -> None:
        return None

    def object_exists(self, object_key: str) -> bool:
        return object_key in self.object_bytes or (
            self.snapshot_data is not None and object_key.endswith(".zip")
        )

    def get_bytes(self, object_key: str) -> bytes:
        if object_key in self.object_bytes:
            return self.object_bytes[object_key]
        assert self.snapshot_data is not None
        return self.snapshot_data


class _PostServiceStub:
    def __init__(self) -> None:
        self.cleared = 0
        self.created_payloads = []

    def clear_all_posts(self) -> None:
        self.cleared += 1

    def get_post_by_slug(self, slug: str):  # type: ignore[no-untyped-def]
        return None

    def create_post(self, payload):  # type: ignore[no-untyped-def]
        self.created_payloads.append(payload)
        return payload

    def update_post_by_slug(self, slug: str, payload):  # type: ignore[no-untyped-def]
        raise AssertionError("apply import should recreate posts after clearing all rows")


def _service() -> ImportService:
    return ImportService(storage=_StorageStub(), post_service=_PostServiceStub())  # type: ignore[arg-type]


def test_collect_velog_bundles_reads_series_name_from_posts_payload(monkeypatch) -> None:
    service = _service()
    calls: list[tuple[str, dict[str, object]]] = []

    def fake_request(query: str, variables: dict[str, object]) -> dict[str, object]:
        calls.append((query, variables))
        if "query Posts" in query:
            return {
                "posts": [
                    {
                        "id": "post-1",
                        "title": "Series article",
                        "short_description": "Summary",
                        "thumbnail": "https://example.com/cover.png",
                        "url_slug": "series-article",
                        "released_at": "2026-03-06T00:00:00Z",
                        "updated_at": "2026-03-06T00:00:00Z",
                        "is_private": False,
                        "is_temp": False,
                        "tags": ["Tag"],
                        "series": {"id": "series-1", "name": "Imported Series"},
                    }
                ]
            }
        return {
            "post": {
                "id": "post-1",
                "body": "# Imported body",
            }
        }

    monkeypatch.setattr(service, "_request_velog_graphql", fake_request)

    bundles = service._collect_velog_bundles("traceoflight")  # noqa: SLF001

    assert len(bundles) == 1
    assert bundles[0].series_title == "Imported Series"
    assert calls[0][1] == {
        "username": "traceoflight",
        "limit": 50,
        "cursor": None,
    }


def test_collect_velog_bundles_pages_until_remaining_posts_exhausted(monkeypatch) -> None:
    service = _service()
    monkeypatch.setattr(import_service_module, "VELOG_POSTS_PAGE_SIZE", 2, raising=False)
    calls: list[tuple[str, dict[str, object]]] = []

    pages = {
        None: [
            {
                "id": "post-1",
                "title": "First article",
                "short_description": "Summary 1",
                "thumbnail": None,
                "url_slug": "first-article",
                "released_at": "2026-03-06T00:00:00Z",
                "updated_at": "2026-03-06T00:00:00Z",
                "is_private": False,
                "is_temp": False,
                "tags": ["Tag"],
                "series": {"id": "series-1", "name": "Imported Series"},
            },
            {
                "id": "post-2",
                "title": "Second article",
                "short_description": "Summary 2",
                "thumbnail": None,
                "url_slug": "second-article",
                "released_at": "2026-03-05T00:00:00Z",
                "updated_at": "2026-03-05T00:00:00Z",
                "is_private": False,
                "is_temp": False,
                "tags": ["Tag"],
                "series": None,
            },
        ],
        "post-2": [
            {
                "id": "post-3",
                "title": "Third article",
                "short_description": "Summary 3",
                "thumbnail": None,
                "url_slug": "third-article",
                "released_at": "2026-03-04T00:00:00Z",
                "updated_at": "2026-03-04T00:00:00Z",
                "is_private": False,
                "is_temp": False,
                "tags": [],
                "series": None,
            }
        ],
    }

    def fake_request(query: str, variables: dict[str, object]) -> dict[str, object]:
        calls.append((query, variables))
        if "query Posts" in query:
            return {
                "posts": pages[variables.get("cursor")]
            }
        return {
            "post": {
                "id": variables["url_slug"],
                "body": f"# {variables['url_slug']}",
            }
        }

    monkeypatch.setattr(service, "_request_velog_graphql", fake_request)

    bundles = service._collect_velog_bundles("traceoflight")  # noqa: SLF001

    assert [bundle.slug for bundle in bundles] == [
        "third-article",
        "second-article",
        "first-article",
    ]
    post_calls = [variables for query, variables in calls if "query Posts" in query]
    assert post_calls == [
        {"username": "traceoflight", "limit": 2, "cursor": None},
        {"username": "traceoflight", "limit": 2, "cursor": "post-2"},
    ]


def test_snapshot_zip_roundtrip_preserves_series_title() -> None:
    service = _service()
    snapshot = service._build_snapshot_zip(  # noqa: SLF001
        "traceoflight",
        [
            SnapshotBundle(
                external_post_id="post-1",
                external_slug="series-article",
                source_url="https://velog.io/@traceoflight/series-article",
                slug="series-article",
                title="Series article",
                excerpt="Summary",
                body_markdown="# Imported body",
                cover_image_url="https://example.com/cover.png",
                status="published",
                visibility="public",
                published_at="2026-03-06T00:00:00Z",
                tags=["tag"],
                series_title="Imported Series",
                order_key="2026-03-06T00:00:00Z",
            )
        ],
    )

    bundles = service._read_snapshot_bundles(snapshot)  # noqa: SLF001

    assert len(bundles) == 1
    assert bundles[0].series_title == "Imported Series"


def test_read_snapshot_bundles_dedupes_duplicate_slugs() -> None:
    service = _service()
    snapshot = service._build_snapshot_zip(  # noqa: SLF001
        "traceoflight",
        [
            SnapshotBundle(
                external_post_id="post-1-duplicate",
                external_slug="same-slug",
                source_url="https://velog.io/@traceoflight/same-slug",
                slug="same-slug",
                title="First duplicated post",
                excerpt="Summary",
                body_markdown="# Imported body",
                cover_image_url=None,
                status="published",
                visibility="public",
                published_at="2026-03-06T00:00:00Z",
                tags=[],
                series_title=None,
                order_key="2026-03-06T00:00:00Z",
            ),
            SnapshotBundle(
                external_post_id="post-2-duplicate",
                external_slug="same-slug",
                source_url="https://velog.io/@traceoflight/same-slug",
                slug="same-slug",
                title="Second duplicated post",
                excerpt="Summary",
                body_markdown="# Imported body",
                cover_image_url=None,
                status="published",
                visibility="public",
                published_at="2026-03-07T00:00:00Z",
                tags=[],
                series_title=None,
                order_key="2026-03-07T00:00:00Z",
            ),
        ],
    )

    bundles = service._read_snapshot_bundles(snapshot)  # noqa: SLF001

    assert [bundle.slug for bundle in bundles] == [
        "same-slug",
        "same-slug-post-2-d",
    ]


def test_bundle_to_post_create_sets_series_title() -> None:
    service = _service()
    bundle = SnapshotBundle(
        external_post_id="post-1",
        external_slug="series-article",
        source_url="https://velog.io/@traceoflight/series-article",
        slug="series-article",
        title="Series article",
        excerpt="Summary",
        body_markdown="# Imported body",
        cover_image_url="https://example.com/cover.png",
        status="published",
        visibility="public",
        published_at="2026-03-06T00:00:00Z",
        tags=["tag"],
        series_title="Imported Series",
        order_key="2026-03-06T00:00:00Z",
    )

    payload = service._bundle_to_post_create(bundle)  # noqa: SLF001

    assert payload.series_title == "Imported Series"


def test_run_snapshot_import_apply_clears_all_posts_before_recreating_rows() -> None:
    snapshot_service = _service()
    snapshot = snapshot_service._build_snapshot_zip(  # noqa: SLF001
        "traceoflight",
        [
            SnapshotBundle(
                external_post_id="post-1",
                external_slug="series-article",
                source_url="https://velog.io/@traceoflight/series-article",
                slug="series-article",
                title="Series article",
                excerpt="Summary",
                body_markdown="# Imported body",
                cover_image_url="https://example.com/cover.png",
                status="published",
                visibility="public",
                published_at="2026-03-06T00:00:00Z",
                tags=["tag"],
                series_title="Imported Series",
                order_key="2026-03-06T00:00:00Z",
            )
        ],
    )
    post_service = _PostServiceStub()
    service = ImportService(storage=_StorageStub(snapshot), post_service=post_service)  # type: ignore[arg-type]

    result = service.run_snapshot_import("snapshot-1", ImportMode.APPLY)

    assert post_service.cleared == 1
    assert len(post_service.created_payloads) == 1
    assert result.created_items == 1
    assert result.updated_items == 0


def test_run_snapshot_import_dry_run_does_not_clear_existing_posts() -> None:
    snapshot_service = _service()
    snapshot = snapshot_service._build_snapshot_zip(  # noqa: SLF001
        "traceoflight",
        [
            SnapshotBundle(
                external_post_id="post-1",
                external_slug="series-article",
                source_url="https://velog.io/@traceoflight/series-article",
                slug="series-article",
                title="Series article",
                excerpt="Summary",
                body_markdown="# Imported body",
                cover_image_url="https://example.com/cover.png",
                status="published",
                visibility="public",
                published_at="2026-03-06T00:00:00Z",
                tags=["tag"],
                series_title="Imported Series",
                order_key="2026-03-06T00:00:00Z",
            )
        ],
    )
    post_service = _PostServiceStub()
    service = ImportService(storage=_StorageStub(snapshot), post_service=post_service)  # type: ignore[arg-type]

    service.run_snapshot_import("snapshot-1", ImportMode.DRY_RUN)

    assert post_service.cleared == 0


def test_download_posts_backup_falls_back_when_media_metadata_row_is_missing() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, expire_on_commit=False)()
    session.add(
        Post(
            slug="backup-target",
            title="Backup target",
            excerpt="excerpt",
            body_markdown="body",
            cover_image_url="/media/image/5c6b1114-3c21-4614-98d7-81c1d51506bc-mendenhallcave.jpg",
            series_title=None,
            status=PostStatus.PUBLISHED,
            visibility=PostVisibility.PUBLIC,
            published_at=None,
        )
    )
    session.commit()

    storage = _StorageStub(
        object_bytes={
            "image/5c6b1114-3c21-4614-98d7-81c1d51506bc-mendenhallcave.jpg": b"image-bytes"
        }
    )
    service = ImportService(storage=storage, post_service=_PostServiceStub(), db=session)  # type: ignore[arg-type]

    _, archive_bytes = service.download_posts_backup()

    with ZipFile(io.BytesIO(archive_bytes)) as archive:
        media_manifest = json.loads(archive.read("media-manifest.json").decode("utf-8"))
        assert media_manifest == [
            {
                "object_key": "image/5c6b1114-3c21-4614-98d7-81c1d51506bc-mendenhallcave.jpg",
                "kind": "image",
                "original_filename": "5c6b1114-3c21-4614-98d7-81c1d51506bc-mendenhallcave.jpg",
                "mime_type": "image/jpeg",
                "size_bytes": 11,
                "width": None,
                "height": None,
                "duration_seconds": None,
            }
        ]
        assert (
            archive.read(
                "media/image/5c6b1114-3c21-4614-98d7-81c1d51506bc-mendenhallcave.jpg"
            )
            == b"image-bytes"
        )
