from __future__ import annotations

from app.services import import_service as import_service_module
from app.services.import_service import ImportService, SnapshotBundle


class _StorageStub:
    pass


class _PostServiceStub:
    pass


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
