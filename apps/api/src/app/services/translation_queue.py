"""Thin sync wrapper around rq for translation jobs."""

from __future__ import annotations

import uuid
from typing import Any

from rq import Queue
from rq.job import Job

_JOB_FUNC_PATH = "app.services.translation_worker.translate_to_locale"


class TranslationQueue:
    """Enqueue translation jobs onto a Redis-backed rq queue.

    Jobs are referenced by their fully-qualified function path so the worker
    process can import them without a shared in-memory registry.
    """

    def __init__(self, *, connection: Any, name: str = "translations") -> None:
        self._queue = Queue(name=name, connection=connection)

    def enqueue_translation_job(
        self,
        *,
        source_post_id: uuid.UUID | str,
        target_locale: str,
        kind: str = "post",
    ) -> Job:
        return self._queue.enqueue(_JOB_FUNC_PATH, kind, str(source_post_id), target_locale)
