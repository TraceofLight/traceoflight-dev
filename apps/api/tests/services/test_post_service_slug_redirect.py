from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models import admin_credential, media, post, post_comment, project_profile, series, site_profile, slug_redirect, tag  # noqa: F401
from app.models.post import PostContentKind, PostLocale, PostStatus, PostVisibility
from app.models.slug_redirect import PostSlugRedirect
from app.repositories.post_repository import PostRepository
from app.repositories.slug_redirect_repository import SlugRedirectRepository
from app.schemas.post import PostCreate
from app.services.post_service import PostService


def _build_session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return Session(engine)


def _post_create_payload(slug: str) -> PostCreate:
    return PostCreate(
        slug=slug,
        title=f"Post {slug}",
        excerpt=None,
        body_markdown="body",
        cover_image_url=None,
        content_kind=PostContentKind.BLOG,
        status=PostStatus.PUBLISHED,
        visibility=PostVisibility.PUBLIC,
        locale=PostLocale.KO,
        translation_group_id=uuid.uuid4(),
        source_post_id=None,
        published_at=datetime.now(timezone.utc),
        tags=[],
    )


def test_update_post_with_slug_change_records_redirect() -> None:
    db = _build_session()
    post_repo = PostRepository(db)
    redirect_repo = SlugRedirectRepository(db)
    service = PostService(repo=post_repo, slug_redirect_repo=redirect_repo)

    created = service.create_post(_post_create_payload("original"))
    db.refresh(created)

    update_payload = _post_create_payload("renamed")
    update_payload.translation_group_id = created.translation_group_id
    service.update_post_by_slug("original", update_payload)

    rows = db.scalars(select(PostSlugRedirect)).all()
    assert len(rows) == 1
    assert rows[0].old_slug == "original"
    assert rows[0].target_post_id == created.id


def test_update_post_without_slug_change_does_not_record_redirect() -> None:
    db = _build_session()
    post_repo = PostRepository(db)
    redirect_repo = SlugRedirectRepository(db)
    service = PostService(repo=post_repo, slug_redirect_repo=redirect_repo)

    created = service.create_post(_post_create_payload("stable"))
    update_payload = _post_create_payload("stable")
    update_payload.translation_group_id = created.translation_group_id
    service.update_post_by_slug("stable", update_payload)

    rows = db.scalars(select(PostSlugRedirect)).all()
    assert rows == []


def test_update_post_to_slug_with_existing_redirect_drops_that_redirect() -> None:
    db = _build_session()
    post_repo = PostRepository(db)
    redirect_repo = SlugRedirectRepository(db)
    service = PostService(repo=post_repo, slug_redirect_repo=redirect_repo)

    x = service.create_post(_post_create_payload("a"))
    update_x = _post_create_payload("b")
    update_x.translation_group_id = x.translation_group_id
    service.update_post_by_slug("a", update_x)
    y = service.create_post(_post_create_payload("c"))
    update_y = _post_create_payload("a")
    update_y.translation_group_id = y.translation_group_id
    service.update_post_by_slug("c", update_y)

    rows = sorted(
        db.scalars(select(PostSlugRedirect)).all(), key=lambda row: row.old_slug
    )
    assert [(r.old_slug, r.target_post_id) for r in rows] == [("c", y.id)]


def test_create_post_drops_existing_redirect_on_claimed_slug() -> None:
    db = _build_session()
    post_repo = PostRepository(db)
    redirect_repo = SlugRedirectRepository(db)
    service = PostService(repo=post_repo, slug_redirect_repo=redirect_repo)

    x = service.create_post(_post_create_payload("a"))
    update_x = _post_create_payload("b")
    update_x.translation_group_id = x.translation_group_id
    service.update_post_by_slug("a", update_x)
    assert db.scalars(select(PostSlugRedirect)).all()

    service.create_post(_post_create_payload("a"))

    assert db.scalars(select(PostSlugRedirect)).all() == []
