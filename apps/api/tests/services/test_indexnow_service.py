from __future__ import annotations

import json

from app.services.indexnow_service import IndexNowService


def _make_service(*, key=None, host=None, status=200, raise_exc=None, key_location=None):
    captured: dict[str, object] = {}

    def submitter(*, endpoint: str, payload: bytes) -> int:
        captured["endpoint"] = endpoint
        captured["payload"] = json.loads(payload.decode("utf-8"))
        if raise_exc is not None:
            raise raise_exc
        return status

    service = IndexNowService(
        key=key,
        host=host,
        endpoint="https://api.indexnow.org/indexnow",
        key_location=key_location,
        submitter=submitter,
        run_async=False,
    )
    return service, captured


def test_unconfigured_service_skips_submission():
    service, captured = _make_service(key=None, host="www.example.com")
    accepted = service.submit_urls(["https://www.example.com/post"])
    assert accepted is False
    assert captured == {}


def test_empty_url_list_skips_submission():
    service, captured = _make_service(key="k", host="www.example.com")
    accepted = service.submit_urls([])
    assert accepted is False
    assert captured == {}


def test_configured_service_posts_url_list_with_host_and_key():
    service, captured = _make_service(key="abc123", host="www.traceoflight.dev")
    accepted = service.submit_urls([
        "https://www.traceoflight.dev/ko/blog/post-1/",
        "https://www.traceoflight.dev/en/blog/post-1/",
    ])
    assert accepted is True
    assert captured["endpoint"] == "https://api.indexnow.org/indexnow"
    body = captured["payload"]
    assert body["host"] == "www.traceoflight.dev"
    assert body["key"] == "abc123"
    assert body["urlList"] == [
        "https://www.traceoflight.dev/ko/blog/post-1/",
        "https://www.traceoflight.dev/en/blog/post-1/",
    ]
    assert "keyLocation" not in body


def test_optional_key_location_is_forwarded_when_set():
    service, captured = _make_service(
        key="abc123",
        host="www.traceoflight.dev",
        key_location="https://www.traceoflight.dev/abc123.txt",
    )
    service.submit_urls(["https://www.traceoflight.dev/ko/blog/x/"])
    body = captured["payload"]
    assert body["keyLocation"] == "https://www.traceoflight.dev/abc123.txt"


def test_non_2xx_response_is_swallowed_as_failure():
    service, _ = _make_service(key="k", host="www.x.com", status=429)
    accepted = service.submit_urls(["https://www.x.com/p"])
    assert accepted is False


def test_transport_exception_is_swallowed_as_failure():
    service, _ = _make_service(key="k", host="www.x.com", raise_exc=TimeoutError())
    accepted = service.submit_urls(["https://www.x.com/p"])
    assert accepted is False


def test_blank_urls_in_input_are_filtered_out():
    service, captured = _make_service(key="k", host="www.x.com")
    service.submit_urls([
        "",
        "https://www.x.com/a",
        None,  # type: ignore[list-item]
    ])
    assert captured["payload"]["urlList"] == ["https://www.x.com/a"]
