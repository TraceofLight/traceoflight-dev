from __future__ import annotations

import asyncio
import logging
import random
from contextlib import suppress
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import delete

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.post import Post, PostStatus

logger = logging.getLogger(__name__)


def _normalize_hour(value: int) -> int:
    return max(0, min(23, int(value)))


def _seconds_until_next_run(now_local: datetime) -> float:
    next_run_at = _next_run_at(now_local)
    return max(1.0, (next_run_at - now_local).total_seconds())


def _next_run_at(now_local: datetime, last_run_local_date: date | None = None) -> datetime:
    start_hour = _normalize_hour(settings.draft_cleanup_start_hour)
    end_hour = _normalize_hour(settings.draft_cleanup_end_hour)
    if end_hour < start_hour:
        start_hour, end_hour = end_hour, start_hour

    candidate_date = now_local.date()
    if last_run_local_date is not None and candidate_date <= last_run_local_date:
        candidate_date = last_run_local_date + timedelta(days=1)

    while True:
        window_start = datetime.combine(
            candidate_date,
            time(hour=start_hour, minute=0, second=0),
            tzinfo=now_local.tzinfo,
        )
        window_end = datetime.combine(
            candidate_date,
            time(hour=end_hour, minute=59, second=59),
            tzinfo=now_local.tzinfo,
        )

        if candidate_date == now_local.date():
            if now_local > window_end:
                candidate_date += timedelta(days=1)
                continue
            schedule_start = max(window_start, now_local + timedelta(seconds=1))
        else:
            schedule_start = window_start

        if schedule_start > window_end:
            candidate_date += timedelta(days=1)
            continue

        start_ts = schedule_start.timestamp()
        end_ts = max(window_end.timestamp(), start_ts + 1)
        target_ts = random.uniform(start_ts, end_ts)
        return datetime.fromtimestamp(target_ts, tz=now_local.tzinfo)


def purge_expired_drafts() -> int:
    retention_days = max(1, int(settings.draft_retention_days))
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)

    with SessionLocal() as db:
        stmt = delete(Post).where(Post.status == PostStatus.DRAFT, Post.updated_at < cutoff)
        result = db.execute(stmt)
        db.commit()
        deleted = int(result.rowcount or 0)
        return deleted


async def run_draft_cleanup_loop(stop_event: asyncio.Event) -> None:
    last_run_local_date: date | None = None

    while not stop_event.is_set():
        now_local = datetime.now().astimezone()
        next_run_at = _next_run_at(now_local, last_run_local_date)
        delay_seconds = max(1.0, (next_run_at - now_local).total_seconds())
        logger.info('draft cleanup scheduled for %s', next_run_at.isoformat())

        with suppress(asyncio.TimeoutError):
            await asyncio.wait_for(stop_event.wait(), timeout=delay_seconds)
            break

        try:
            deleted_count = purge_expired_drafts()
            logger.info('draft cleanup completed: deleted=%s', deleted_count)
        except Exception:  # pragma: no cover - log and continue
            logger.exception('draft cleanup failed')
        finally:
            last_run_local_date = datetime.now().astimezone().date()
