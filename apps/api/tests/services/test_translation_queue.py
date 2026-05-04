from __future__ import annotations

import uuid

import fakeredis
import pytest

from app.services.translation_queue import TranslationQueue


@pytest.fixture
def fake_redis() -> fakeredis.FakeStrictRedis:
    return fakeredis.FakeStrictRedis()


def test_enqueue_translation_job_pushes_to_named_queue(fake_redis) -> None:
    queue = TranslationQueue(connection=fake_redis, name="translations")
    source_id = uuid.uuid4()

    queue.enqueue_translation_job(source_post_id=source_id, target_locale="en")

    # rq stores queue contents at "rq:queue:<name>"
    queued_ids = fake_redis.lrange("rq:queue:translations", 0, -1)
    assert len(queued_ids) == 1


def test_enqueued_job_uses_full_function_path(fake_redis) -> None:
    queue = TranslationQueue(connection=fake_redis, name="translations")
    source_id = uuid.uuid4()

    job = queue.enqueue_translation_job(
        source_post_id=source_id,
        target_locale="ja",
    )

    assert job.func_name == "app.services.translation_worker.translate_post_to_locale"
    assert job.args == (str(source_id), "ja")


def test_enqueue_normalizes_uuid_to_string(fake_redis) -> None:
    """Job args must be JSON-serializable (string), not raw UUID objects."""
    queue = TranslationQueue(connection=fake_redis, name="translations")
    source_id = uuid.uuid4()

    job = queue.enqueue_translation_job(
        source_post_id=source_id,
        target_locale="zh",
    )

    assert isinstance(job.args[0], str)


def test_translation_queue_uses_configured_name(fake_redis) -> None:
    queue = TranslationQueue(connection=fake_redis, name="custom-queue")
    queue.enqueue_translation_job(
        source_post_id=uuid.uuid4(),
        target_locale="en",
    )

    assert fake_redis.llen("rq:queue:custom-queue") == 1
    assert fake_redis.llen("rq:queue:translations") == 0
