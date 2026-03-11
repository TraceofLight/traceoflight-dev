from __future__ import annotations

from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.post import Post, PostContentKind, PostStatus, PostTopMediaKind, PostVisibility
from app.models.project_profile import ProjectProfile
from app.services.import_service import ImportService, ImportValidationError
from app.services.imports.backup_archive import build_posts_backup_zip, parse_posts_backup_zip
from app.services.imports.backup_restore import BackupRestoreCoordinator


class _StorageStub:
    def __init__(
        self,
        *,
        fail_on_put_number: int | None = None,
        object_bytes: dict[str, bytes] | None = None,
    ) -> None:
        self.bucket = "traceoflight-test"
        self.fail_on_put_number = fail_on_put_number
        self.object_bytes = object_bytes or {}
        self.put_calls: list[str] = []
        self.delete_calls: list[str] = []

    def ensure_bucket(self) -> None:
        return None

    def put_bytes(self, object_key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
        self.put_calls.append(object_key)
        if self.fail_on_put_number is not None and len(self.put_calls) == self.fail_on_put_number:
            raise RuntimeError("simulated storage put failure")
        self.object_bytes[object_key] = data

    def get_bytes(self, object_key: str) -> bytes:
        return self.object_bytes[object_key]

    def object_exists(self, object_key: str) -> bool:
        return object_key in self.object_bytes

    def delete_object(self, object_key: str) -> None:
        self.delete_calls.append(object_key)
        self.object_bytes.pop(object_key, None)


def _session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)()


def _seed_post(session, slug: str = "existing-post") -> None:
    session.add(
        Post(
            slug=slug,
            title="Existing post",
            excerpt="existing",
            body_markdown="body",
            cover_image_url=None,
            series_title=None,
            status=PostStatus.PUBLISHED,
            visibility=PostVisibility.PUBLIC,
            published_at=None,
        )
    )
    session.commit()


def _build_backup_zip() -> bytes:
    return build_posts_backup_zip(
        posts=[
            {
                "slug": "restored-post",
                "title": "Restored post",
                "excerpt": "restored",
                "content_kind": "project",
                "status": "published",
                "visibility": "public",
                "published_at": "2026-03-06T00:00:00Z",
                "tags": ["python"],
                "series_title": None,
                "cover_image_url": "/media/image/cover.png",
                "top_media_kind": "youtube",
                "top_media_image_url": None,
                "top_media_youtube_url": "https://www.youtube.com/watch?v=abc123",
                "top_media_video_url": None,
                "project_profile": {
                    "period_label": "2026.03 - 2026.04",
                    "role_summary": "Graphics engineer",
                    "project_intro": "Project intro",
                    "card_image_url": "/media/image/card.png",
                    "highlights": ["Highlight A"],
                    "resource_links": [
                        {"label": "GitHub", "href": "https://github.com/example/repo"}
                    ],
                },
                "body_markdown": "![cover](/media/image/cover.png)",
            }
        ],
        media_manifest=[
            {
                "object_key": "image/cover.png",
                "kind": "image",
                "original_filename": "cover.png",
                "mime_type": "image/png",
                "size_bytes": 5,
                "width": None,
                "height": None,
                "duration_seconds": None,
            },
            {
                "object_key": "image/body.png",
                "kind": "image",
                "original_filename": "body.png",
                "mime_type": "image/png",
                "size_bytes": 4,
                "width": None,
                "height": None,
                "duration_seconds": None,
            },
        ],
        media_payloads={
            "image/cover.png": b"cover",
            "image/body.png": b"body",
        },
        series_overrides=[],
        generated_at=datetime(2026, 3, 6, tzinfo=timezone.utc),
    )


def test_backup_restore_restores_project_and_top_media_fields() -> None:
    session = _session()
    coordinator = BackupRestoreCoordinator(
        storage=_StorageStub(),
        db=session,
        rebuild_series_projection=lambda: None,
    )

    result = coordinator.restore(parse_posts_backup_zip(_build_backup_zip()))

    restored_post = session.scalar(select(Post).where(Post.slug == "restored-post"))
    restored_profile = session.scalar(select(ProjectProfile).where(ProjectProfile.post_id == restored_post.id))

    assert result.restored_posts == 1
    assert restored_post is not None
    assert restored_post.content_kind == PostContentKind.PROJECT
    assert restored_post.top_media_kind == PostTopMediaKind.YOUTUBE
    assert restored_post.top_media_youtube_url == "https://www.youtube.com/watch?v=abc123"
    assert restored_profile is not None
    assert restored_profile.period_label == "2026.03 - 2026.04"
    assert restored_profile.role_summary == "Graphics engineer"
    assert restored_profile.project_intro == "Project intro"
    assert restored_profile.card_image_url == "/media/image/card.png"
    assert restored_profile.highlights_json == ["Highlight A"]
    assert restored_profile.resource_links_json == [
        {"label": "GitHub", "href": "https://github.com/example/repo"}
    ]


def test_load_posts_backup_rejects_invalid_archive_before_clearing_posts() -> None:
    session = _session()
    _seed_post(session)
    service = ImportService(
        storage=_StorageStub(),
        db=session,
    )

    with pytest.raises(ImportValidationError):
        service.load_posts_backup("broken.zip", b"not-a-zip")

    assert session.scalar(select(Post).where(Post.slug == "existing-post")) is not None


def test_backup_restore_cleanup_runs_when_media_staging_fails() -> None:
    session = _session()
    _seed_post(session)
    storage = _StorageStub(fail_on_put_number=2)
    coordinator = BackupRestoreCoordinator(
        storage=storage,
        db=session,
        rebuild_series_projection=lambda: None,
    )

    with pytest.raises(RuntimeError, match="simulated storage put failure"):
        coordinator.restore(parse_posts_backup_zip(_build_backup_zip()))

    assert len(storage.delete_calls) == 1
    assert storage.delete_calls[0].endswith("/image/cover.png")
    assert session.scalar(select(Post).where(Post.slug == "existing-post")) is not None


def test_backup_restore_rolls_back_database_if_restore_step_fails_after_clear(monkeypatch) -> None:
    session = _session()
    _seed_post(session)
    coordinator = BackupRestoreCoordinator(
        storage=_StorageStub(),
        db=session,
        rebuild_series_projection=lambda: None,
    )
    parsed = parse_posts_backup_zip(_build_backup_zip())

    def fail_after_delete(*args, **kwargs):  # type: ignore[no-untyped-def]
        session.execute(Post.__table__.delete())
        raise RuntimeError("simulated db failure")

    monkeypatch.setattr(coordinator, "_replace_database_contents", fail_after_delete)

    with pytest.raises(RuntimeError, match="simulated db failure"):
        coordinator.restore(parsed)

    assert session.scalar(select(Post).where(Post.slug == "existing-post")) is not None


def test_backup_restore_restores_previous_media_objects_if_db_work_fails_after_promotion(
    monkeypatch,
) -> None:
    session = _session()
    _seed_post(session)
    storage = _StorageStub(
        object_bytes={
            "image/cover.png": b"old-cover",
            "image/body.png": b"old-body",
        }
    )
    coordinator = BackupRestoreCoordinator(
        storage=storage,
        db=session,
        rebuild_series_projection=lambda: None,
    )
    parsed = parse_posts_backup_zip(_build_backup_zip())

    def fail_after_promote(*args, **kwargs):  # type: ignore[no-untyped-def]
        raise RuntimeError("simulated db failure after promote")

    monkeypatch.setattr(coordinator, "_replace_database_contents", fail_after_promote)

    with pytest.raises(RuntimeError, match="simulated db failure after promote"):
        coordinator.restore(parsed)

    assert storage.object_bytes["image/cover.png"] == b"old-cover"
    assert storage.object_bytes["image/body.png"] == b"old-body"
