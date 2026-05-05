from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import uuid

from app.services.post_service import PostService


@dataclass
class _PostStub:
    slug: str
    status: str
    locale: str = "ko"
    series_title: str | None = None
    published_at: datetime | None = None
    source_post_id: uuid.UUID | None = None


class _DbStub:
    def commit(self) -> None:
        pass


class _RepoStub:
    def __init__(self, post: _PostStub) -> None:
        self.current = post
        self.created = post
        self.updated = post
        self.db = _DbStub()

    def get_by_slug(self, slug: str, status=None, visibility=None, locale=None):  # type: ignore[no-untyped-def]
        del status, visibility, locale
        return self.current if slug == self.current.slug else None

    def create(self, payload):  # type: ignore[no-untyped-def]
        del payload
        return self.created

    def update_by_slug(self, current_slug: str, payload):  # type: ignore[no-untyped-def]
        del payload
        return self.updated if current_slug == self.current.slug else None


@dataclass
class _IndexNowStub:
    submissions: list[list[str]] = field(default_factory=list)
    configured: bool = True
    host: str = "www.traceoflight.dev"

    def is_configured(self) -> bool:
        return self.configured

    def submit_urls(self, urls):  # type: ignore[no-untyped-def]
        self.submissions.append(list(urls))


def _make_service(post: _PostStub, *, indexnow: _IndexNowStub | None = None) -> PostService:
    repo = _RepoStub(post)
    return PostService(
        repo=repo,  # type: ignore[arg-type]
        translation_service=None,
        indexnow_service=indexnow,  # type: ignore[arg-type]
    )


def test_publishing_a_post_pings_indexnow_with_localized_url():
    post = _PostStub(
        slug="my-post",
        status="published",
        locale="ko",
        published_at=datetime.now(timezone.utc),
    )
    indexnow = _IndexNowStub()
    service = _make_service(post, indexnow=indexnow)

    service._ping_indexnow(post)  # exercised by create_post / update_post in production

    assert indexnow.submissions == [["https://www.traceoflight.dev/ko/blog/my-post/"]]


def test_draft_post_is_not_pinged_to_indexnow():
    post = _PostStub(slug="my-post", status="draft", locale="ko")
    indexnow = _IndexNowStub()
    service = _make_service(post, indexnow=indexnow)

    service._ping_indexnow(post)

    assert indexnow.submissions == []


def test_archived_post_is_not_pinged_to_indexnow():
    post = _PostStub(slug="my-post", status="archived", locale="ko")
    indexnow = _IndexNowStub()
    service = _make_service(post, indexnow=indexnow)

    service._ping_indexnow(post)

    assert indexnow.submissions == []


def test_unconfigured_indexnow_service_is_silently_skipped():
    post = _PostStub(slug="my-post", status="published", locale="ko")
    indexnow = _IndexNowStub(configured=False)
    service = _make_service(post, indexnow=indexnow)

    service._ping_indexnow(post)

    assert indexnow.submissions == []


def test_each_locale_pings_its_own_url():
    indexnow = _IndexNowStub()
    service = _make_service(
        _PostStub(slug="my-post", status="published", locale="ko"),
        indexnow=indexnow,
    )

    for locale, expected_path in [
        ("ko", "/ko/blog/my-post/"),
        ("en", "/en/blog/my-post/"),
        ("ja", "/ja/blog/my-post/"),
        ("zh", "/zh/blog/my-post/"),
    ]:
        service._ping_indexnow(_PostStub(slug="my-post", status="published", locale=locale))
        assert indexnow.submissions[-1] == [
            f"https://www.traceoflight.dev{expected_path}"
        ]


def test_indexnow_submission_failure_does_not_propagate():
    class _Boom(_IndexNowStub):
        def submit_urls(self, urls):  # type: ignore[no-untyped-def]
            raise RuntimeError("network down")

    post = _PostStub(slug="my-post", status="published", locale="ko")
    service = _make_service(post, indexnow=_Boom())

    # Must not raise.
    service._ping_indexnow(post)
