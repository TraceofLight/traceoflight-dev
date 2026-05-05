"""IndexNow ping service.

Notifies participating search engines (Bing, Yandex, Naver, Seznam, ...) that
a set of URLs has been added or updated. The protocol is fire-and-forget:
HTTP 2xx means accepted into the crawler queue, not that indexing happened.

Google does not participate in IndexNow; that side relies on the existing
sitemap/crawl cycle.

Reference: https://www.indexnow.org/documentation
"""

from __future__ import annotations

import json
import logging
import threading
import urllib.error
import urllib.request
from collections.abc import Iterable
from typing import Protocol

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT_SECONDS = 5.0


class _Submitter(Protocol):
    def __call__(self, *, endpoint: str, payload: bytes) -> int: ...


def _http_post(*, endpoint: str, payload: bytes) -> int:
    request = urllib.request.Request(
        endpoint,
        data=payload,
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=DEFAULT_TIMEOUT_SECONDS) as response:  # noqa: S310 — fixed endpoint, not user input
        return int(response.status)


class IndexNowService:
    """Submits URL change notifications to the IndexNow protocol.

    The service is a no-op when `key` or `host` is unset, so wiring it up in
    development environments without secrets is safe.
    """

    def __init__(
        self,
        *,
        key: str | None,
        host: str | None,
        endpoint: str,
        key_location: str | None = None,
        submitter: _Submitter | None = None,
        run_async: bool = True,
    ) -> None:
        self.key = key
        self.host = host
        self.endpoint = endpoint
        self.key_location = key_location
        self._submitter = submitter or _http_post
        self._run_async = run_async

    def is_configured(self) -> bool:
        return bool(self.key) and bool(self.host)

    def submit_urls(self, urls: Iterable[str]) -> bool:
        if not self.is_configured():
            return False
        url_list = [u for u in urls if u]
        if not url_list:
            return False
        payload = self._build_payload(url_list)
        if self._run_async:
            threading.Thread(
                target=self._submit_sync,
                args=(payload,),
                daemon=True,
            ).start()
            return True
        return self._submit_sync(payload)

    def _build_payload(self, url_list: list[str]) -> bytes:
        body: dict[str, object] = {
            "host": self.host,
            "key": self.key,
            "urlList": url_list,
        }
        if self.key_location:
            body["keyLocation"] = self.key_location
        return json.dumps(body).encode("utf-8")

    def _submit_sync(self, payload: bytes) -> bool:
        try:
            status = self._submitter(endpoint=self.endpoint, payload=payload)
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            logger.warning("indexnow ping transport error: %s", exc)
            return False
        if 200 <= status < 300:
            return True
        logger.warning("indexnow ping non-2xx response: status=%s", status)
        return False
