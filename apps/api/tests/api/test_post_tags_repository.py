from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
from app.models.post import Post
from app.models.post import PostContentKind
from app.models.post import PostStatus, PostVisibility
from app.models.project_profile import ProjectProfile
from app.repositories.post_repository import PostRepository
from app.schemas.post import PostCreate


def _build_session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    return session_factory()


def _payload(slug: str, tags: list[str]) -> PostCreate:
    return PostCreate(
        slug=slug,
        title=slug,
        excerpt=None,
        body_markdown=f"# {slug}",
        cover_image_url=None,
        status=PostStatus.PUBLISHED,
        visibility=PostVisibility.PUBLIC,
        published_at=None,
        tags=tags,
    )


def _project_payload(slug: str, tags: list[str]) -> PostCreate:
    return PostCreate(
        slug=slug,
        title=slug,
        excerpt="project excerpt",
        body_markdown=f"# {slug}",
        cover_image_url="/media/project-card.png",
        top_media_kind="image",
        top_media_image_url="/media/project-detail.png",
        top_media_youtube_url=None,
        top_media_video_url=None,
        status=PostStatus.PUBLISHED,
        visibility=PostVisibility.PUBLIC,
        published_at=None,
        tags=tags,
        content_kind=PostContentKind.PROJECT,
        project_profile={
            "period_label": "2026.03 - ongoing",
            "role_summary": "Lead developer",
            "project_intro": "project intro",
            "card_image_url": "/media/project-card.png",
            "highlights": ["one", "two"],
            "resource_links": [{"label": "GitHub", "href": "https://github.com/traceoflight"}],
        },
    )


def test_create_post_deduplicates_tags_by_slug() -> None:
    db = _build_session()
    repo = PostRepository(db)

    created = repo.create(_payload("first-post", ["Fast API", "fast-api", "Python"]))

    assert [tag.slug for tag in created.tags] == ["fast-api", "python"]


def test_update_post_replaces_tag_links() -> None:
    db = _build_session()
    repo = PostRepository(db)

    repo.create(_payload("first-post", ["fastapi", "python"]))
    updated = repo.update_by_slug(
        "first-post",
        _payload("first-post", ["astro"]),
    )

    assert updated is not None
    assert [tag.slug for tag in updated.tags] == ["astro"]


def test_list_posts_supports_any_and_all_tag_matching() -> None:
    db = _build_session()
    repo = PostRepository(db)

    repo.create(_payload("post-a", ["fastapi", "astro"]))
    repo.create(_payload("post-b", ["fastapi"]))
    repo.create(_payload("post-c", ["python"]))

    any_match = repo.list(tags=["fastapi", "astro"], tag_match="any")
    all_match = repo.list(tags=["fastapi", "astro"], tag_match="all")

    assert [post.slug for post in any_match] == ["post-b", "post-a"]
    assert [post.slug for post in all_match] == ["post-a"]


def test_list_published_posts_orders_by_published_at_before_created_at() -> None:
    db = _build_session()
    repo = PostRepository(db)

    db.add_all(
        [
            Post(
                slug="restored-old-post",
                title="restored-old-post",
                excerpt=None,
                body_markdown="# restored-old-post",
                cover_image_url=None,
                status=PostStatus.PUBLISHED,
                visibility=PostVisibility.PUBLIC,
                published_at=datetime(2023, 5, 16, tzinfo=timezone.utc),
                created_at=datetime(2026, 3, 11, tzinfo=timezone.utc),
                updated_at=datetime(2026, 3, 11, tzinfo=timezone.utc),
            ),
            Post(
                slug="latest-published-post",
                title="latest-published-post",
                excerpt=None,
                body_markdown="# latest-published-post",
                cover_image_url=None,
                status=PostStatus.PUBLISHED,
                visibility=PostVisibility.PUBLIC,
                published_at=datetime(2025, 7, 28, tzinfo=timezone.utc),
                created_at=datetime(2025, 7, 28, tzinfo=timezone.utc),
                updated_at=datetime(2025, 7, 28, tzinfo=timezone.utc),
            ),
            Post(
                slug="mid-published-post",
                title="mid-published-post",
                excerpt=None,
                body_markdown="# mid-published-post",
                cover_image_url=None,
                status=PostStatus.PUBLISHED,
                visibility=PostVisibility.PUBLIC,
                published_at=datetime(2024, 2, 1, tzinfo=timezone.utc),
                created_at=datetime(2024, 2, 1, tzinfo=timezone.utc),
                updated_at=datetime(2024, 2, 1, tzinfo=timezone.utc),
            ),
        ]
    )
    db.commit()

    listed = repo.list(status=PostStatus.PUBLISHED, visibility=PostVisibility.PUBLIC)

    assert [post.slug for post in listed] == [
        "latest-published-post",
        "mid-published-post",
        "restored-old-post",
    ]


def test_list_posts_excludes_project_content_from_default_blog_queries() -> None:
    db = _build_session()
    repo = PostRepository(db)

    repo.create(_payload("blog-post", ["til"]))
    repo.create(_project_payload("project-post", ["cpp"]))

    listed = repo.list(status=PostStatus.PUBLISHED, visibility=PostVisibility.PUBLIC)

    assert [post.slug for post in listed] == ["blog-post"]


def test_get_project_post_by_slug_returns_profile_metadata() -> None:
    db = _build_session()
    repo = PostRepository(db)

    created = repo.create(_project_payload("project-post", ["cpp"]))
    fetched = repo.get_by_slug("project-post")

    assert created.content_kind == PostContentKind.PROJECT
    assert fetched is not None
    assert fetched.project_profile is not None
    assert fetched.project_profile.period_label == "2026.03 - ongoing"
    assert fetched.project_profile.resource_links_json == [
        {"label": "GitHub", "href": "https://github.com/traceoflight"}
    ]
