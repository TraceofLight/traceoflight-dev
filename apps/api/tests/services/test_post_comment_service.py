from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
from app.models.post import Post, PostStatus, PostVisibility
from app.services.post_comment_service import (
    CommentAuthError,
    CommentConflictError,
    PostCommentService,
)
from app.schemas.post_comment import (
    AdminCommentFeedQuery,
    PostCommentCreate,
    PostCommentDelete,
    PostCommentUpdate,
)


def _build_session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)()


def _seed_post(db: Session, slug: str = "sample-post") -> Post:
    post = Post(
        slug=slug,
        title=slug,
        excerpt="excerpt",
        body_markdown="# body",
        cover_image_url=None,
        status=PostStatus.PUBLISHED,
        visibility=PostVisibility.PUBLIC,
        published_at=datetime(2026, 3, 13, tzinfo=timezone.utc),
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return post


def _service(db: Session) -> PostCommentService:
    return PostCommentService(db)


def test_create_root_comment_hashes_guest_password() -> None:
    db = _build_session()
    _seed_post(db)
    service = _service(db)

    created = service.create_comment(
        "sample-post",
        PostCommentCreate(
            author_name="GuestA",
            password="secret123",
            visibility="public",
            body="first root",
        ),
        is_admin=False,
    )

    assert created.author_name == "GuestA"
    assert created.author_type == "guest"
    assert created.password_hash is None
    stored = service.repo.get_comment_model(created.id)
    assert stored is not None
    assert stored.password_hash is not None
    assert stored.password_hash != "secret123"
    assert stored.password_hash.startswith("$argon2")


def test_create_reply_to_reply_stays_in_same_root_thread() -> None:
    db = _build_session()
    _seed_post(db)
    service = _service(db)

    root = service.create_comment(
        "sample-post",
        PostCommentCreate(
            author_name="Root",
            password="secret123",
            visibility="public",
            body="root",
        ),
        is_admin=False,
    )
    reply = service.create_comment(
        "sample-post",
        PostCommentCreate(
            author_name="Reply",
            password="secret123",
            visibility="public",
            body="reply",
            reply_to_comment_id=root.id,
        ),
        is_admin=False,
    )
    nested_reply = service.create_comment(
        "sample-post",
        PostCommentCreate(
            author_name="Nested",
            password="secret123",
            visibility="public",
            body="nested",
            reply_to_comment_id=reply.id,
        ),
        is_admin=False,
    )

    assert reply.root_comment_id == root.id
    assert nested_reply.root_comment_id == root.id
    assert nested_reply.reply_to_comment_id == reply.id


def test_deleted_comment_cannot_receive_new_reply() -> None:
    db = _build_session()
    _seed_post(db)
    service = _service(db)

    root = service.create_comment(
        "sample-post",
        PostCommentCreate(
            author_name="Root",
            password="secret123",
            visibility="public",
            body="root",
        ),
        is_admin=False,
    )
    service.delete_comment(root.id, PostCommentDelete(password="secret123"), is_admin=False)

    try:
        service.create_comment(
            "sample-post",
            PostCommentCreate(
                author_name="Reply",
                password="secret123",
                visibility="public",
                body="reply",
                reply_to_comment_id=root.id,
            ),
            is_admin=False,
        )
    except CommentConflictError as exc:
        assert "deleted comments" in str(exc).lower()
    else:
        raise AssertionError("expected deleted comment reply to be rejected")


def test_guest_update_and_delete_require_matching_password() -> None:
    db = _build_session()
    _seed_post(db)
    service = _service(db)

    created = service.create_comment(
        "sample-post",
        PostCommentCreate(
            author_name="GuestA",
            password="secret123",
            visibility="public",
            body="first root",
        ),
        is_admin=False,
    )

    try:
        service.update_comment(
            created.id,
            PostCommentUpdate(password="wrong", body="edited"),
            is_admin=False,
        )
    except CommentAuthError:
        pass
    else:
        raise AssertionError("expected wrong password to fail update")

    updated = service.update_comment(
        created.id,
        PostCommentUpdate(password="secret123", body="edited"),
        is_admin=False,
    )
    deleted = service.delete_comment(
        created.id,
        PostCommentDelete(password="secret123"),
        is_admin=False,
    )

    assert updated.body == "edited"
    assert deleted.status == "deleted"


def test_private_comment_is_masked_for_public_but_visible_to_admin() -> None:
    db = _build_session()
    _seed_post(db)
    service = _service(db)

    service.create_comment(
        "sample-post",
        PostCommentCreate(
            author_name="GuestA",
            password="secret123",
            visibility="private",
            body="hidden body",
        ),
        is_admin=False,
    )

    public_view = service.list_post_comments("sample-post", include_private=False)
    admin_view = service.list_post_comments("sample-post", include_private=True)

    assert public_view.comment_count == 1
    assert public_view.items[0].body == "비공개된 댓글입니다."
    assert admin_view.items[0].body == "hidden body"


def test_admin_comment_uses_fixed_author_without_password() -> None:
    db = _build_session()
    _seed_post(db)
    service = _service(db)

    created = service.create_comment(
        "sample-post",
        PostCommentCreate(
            visibility="public",
            body="admin note",
        ),
        is_admin=True,
    )

    assert created.author_name == "@TraceofLight"
    assert created.author_type == "admin"
    stored = service.repo.get_comment_model(created.id)
    assert stored is not None
    assert stored.password_hash is None


def test_admin_feed_is_newest_first_and_includes_private_and_deleted_rows() -> None:
    db = _build_session()
    _seed_post(db, slug="post-a")
    _seed_post(db, slug="post-b")
    service = _service(db)

    first = service.create_comment(
        "post-a",
        PostCommentCreate(author_name="AA", password="secret123", visibility="private", body="older"),
        is_admin=False,
    )
    second = service.create_comment(
        "post-b",
        PostCommentCreate(visibility="public", body="newer"),
        is_admin=True,
    )
    first_model = service.repo.get_comment_model(first.id)
    second_model = service.repo.get_comment_model(second.id)
    assert first_model is not None
    assert second_model is not None
    first_model.created_at = datetime(2026, 3, 13, 0, 0, 0, tzinfo=timezone.utc)
    second_model.created_at = datetime(2026, 3, 13, 0, 0, 1, tzinfo=timezone.utc)
    db.commit()
    service.delete_comment(first.id, PostCommentDelete(password="secret123"), is_admin=False)

    feed = service.list_admin_comments(AdminCommentFeedQuery())

    assert [row.id for row in feed.items] == [second.id, first.id]
    assert feed.items[1].status == "deleted"
    assert feed.items[1].body == "삭제된 댓글입니다."
