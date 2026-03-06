from __future__ import annotations

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
    assert calls[0][1] == {"username": "traceoflight"}


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
