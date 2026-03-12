from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.media import AssetKind, MediaAsset
from app.models.post import Post, PostContentKind, PostStatus, PostTopMediaKind, PostVisibility
from app.models.project_profile import ProjectProfile
from app.models.series import Series
from app.services.media_cleanup_service import purge_orphaned_media


class _StorageStub:
    def __init__(self, existing: set[str] | None = None) -> None:
        self.existing = set(existing or set())
        self.deleted: list[str] = []

    def object_exists(self, object_key: str) -> bool:
        return object_key in self.existing

    def delete_object(self, object_key: str) -> None:
        self.deleted.append(object_key)
        self.existing.discard(object_key)


def _session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)()


def _insert_media(
    session,
    *,
    object_key: str,
    updated_at: datetime,
    mime_type: str = "image/png",
    kind: AssetKind = AssetKind.IMAGE,
) -> MediaAsset:
    media = MediaAsset(
        bucket="traceoflight-test",
        object_key=object_key,
        original_filename=object_key.rsplit("/", 1)[-1],
        mime_type=mime_type,
        size_bytes=1,
        kind=kind,
    )
    session.add(media)
    session.commit()
    session.execute(
        MediaAsset.__table__.update()
        .where(MediaAsset.id == media.id)
        .values(created_at=updated_at, updated_at=updated_at)
    )
    session.commit()
    session.refresh(media)
    return media


def test_purge_orphaned_media_preserves_all_referenced_assets() -> None:
    session = _session()
    now = datetime.now(timezone.utc)
    _insert_media(session, object_key="image/cover.png", updated_at=now - timedelta(days=10))
    _insert_media(session, object_key="video/top.mp4", updated_at=now - timedelta(days=10), mime_type="video/mp4", kind=AssetKind.VIDEO)
    _insert_media(session, object_key="image/body.png", updated_at=now - timedelta(days=10))
    _insert_media(session, object_key="image/card.png", updated_at=now - timedelta(days=10))
    _insert_media(session, object_key="image/series.png", updated_at=now - timedelta(days=10))

    post = Post(
        slug="alpha",
        title="Alpha",
        excerpt="summary",
        body_markdown="![body](/media/image/body.png)",
        cover_image_url="/media/image/cover.png",
        top_media_kind=PostTopMediaKind.VIDEO,
        top_media_video_url="/media/video/top.mp4",
        content_kind=PostContentKind.PROJECT,
        status=PostStatus.PUBLISHED,
        visibility=PostVisibility.PUBLIC,
    )
    session.add(post)
    session.commit()

    session.add(
        ProjectProfile(
            post_id=post.id,
            period_label="2026.03 - 2026.04",
            role_summary="Lead",
            project_intro="intro",
            card_image_url="/media/image/card.png",
            highlights_json=["One"],
            resource_links_json=[],
        )
    )
    session.add(
        Series(
            slug="series-a",
            title="Series A",
            description="desc",
            cover_image_url="/media/image/series.png",
        )
    )
    session.commit()

    storage = _StorageStub({"image/cover.png", "video/top.mp4", "image/body.png", "image/card.png", "image/series.png"})
    deleted = purge_orphaned_media(session, storage=storage, retention_days=7)

    assert deleted == 0
    assert storage.deleted == []
    assert session.scalars(select(MediaAsset)).all()


def test_purge_orphaned_media_deletes_old_unreferenced_rows_and_objects() -> None:
    session = _session()
    now = datetime.now(timezone.utc)
    stale = _insert_media(session, object_key="image/orphan.png", updated_at=now - timedelta(days=8))
    fresh = _insert_media(session, object_key="image/recent.png", updated_at=now - timedelta(days=2))
    storage = _StorageStub({"image/orphan.png", "image/recent.png"})

    deleted = purge_orphaned_media(session, storage=storage, retention_days=7)

    remaining_keys = {row.object_key for row in session.scalars(select(MediaAsset)).all()}
    assert deleted == 1
    assert stale.object_key not in remaining_keys
    assert fresh.object_key in remaining_keys
    assert storage.deleted == ["image/orphan.png"]


def test_purge_orphaned_media_removes_db_row_even_when_storage_object_is_missing() -> None:
    session = _session()
    now = datetime.now(timezone.utc)
    stale = _insert_media(session, object_key="image/missing.png", updated_at=now - timedelta(days=9))
    storage = _StorageStub(set())

    deleted = purge_orphaned_media(session, storage=storage, retention_days=7)

    remaining_keys = {row.object_key for row in session.scalars(select(MediaAsset)).all()}
    assert deleted == 1
    assert stale.object_key not in remaining_keys
    assert storage.deleted == []
