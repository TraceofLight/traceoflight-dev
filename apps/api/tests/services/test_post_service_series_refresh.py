from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from app.services.post_service import PostService


@dataclass
class _PostStub:
    slug: str
    series_title: str | None
    published_at: datetime | None


class _RepoStub:
    def __init__(self) -> None:
        now = datetime.now(timezone.utc)
        self.current = _PostStub(slug="post-a", series_title="Series A", published_at=now)
        self.created = _PostStub(slug="post-a", series_title="Series A", published_at=now)
        self.updated = _PostStub(slug="post-a", series_title="Series B", published_at=now)
        self.deleted = True

    def list(self, **kwargs):  # type: ignore[no-untyped-def]
        del kwargs
        return []

    def get_by_slug(self, slug: str, status=None, visibility=None):  # type: ignore[no-untyped-def]
        del status, visibility
        if slug != self.current.slug:
            return None
        return self.current

    def create(self, payload):  # type: ignore[no-untyped-def]
        del payload
        return self.created

    def update_by_slug(self, current_slug: str, payload):  # type: ignore[no-untyped-def]
        del payload
        if current_slug != self.current.slug:
            return None
        return self.updated

    def delete_by_slug(self, slug: str, status=None, visibility=None):  # type: ignore[no-untyped-def]
        del status, visibility
        if slug != self.current.slug:
            return False
        return self.deleted


def test_post_service_requests_series_rebuild_on_create_update_delete(monkeypatch) -> None:
    repo = _RepoStub()
    service = PostService(repo=repo)
    refresh_reasons: list[str] = []

    monkeypatch.setattr(
        "app.services.post_service.request_series_projection_refresh",
        lambda reason: refresh_reasons.append(reason),
    )

    service.create_post(payload=object())  # type: ignore[arg-type]
    service.update_post_by_slug(slug="post-a", payload=object())  # type: ignore[arg-type]
    service.delete_post_by_slug(slug="post-a")

    assert refresh_reasons == [
        "post-created-series-assigned",
        "post-updated-series-changed",
        "post-deleted-series-assigned",
    ]
