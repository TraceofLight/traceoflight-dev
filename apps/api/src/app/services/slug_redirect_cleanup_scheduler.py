from __future__ import annotations

import asyncio
import logging
import random
from contextlib import suppress
from datetime import date, datetime, time, timedelta

from app.core.config import settings
from app.db.session import SessionLocal
from app.repositories.slug_redirect_repository import SlugRedirectRepository

logger = logging.getLogger(__name__)


def _normalize_hour(value: int) -> int:
    return max(0, min(23, int(value)))


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


def purge_expired_redirects() -> dict[str, int]:
    min_age_days = max(1, int(settings.slug_redirect_min_age_days))
    idle_days = max(1, int(settings.slug_redirect_idle_days))

    db = SessionLocal()
    try:
        repo = SlugRedirectRepository(db)
        deleted_posts = repo.purge_expired_post_redirects(
            min_age_days=min_age_days, idle_days=idle_days,
        )
        deleted_series = repo.purge_expired_series_redirects(
            min_age_days=min_age_days, idle_days=idle_days,
        )
    finally:
        db.close()
    return {
        "deleted_post_redirects": deleted_posts,
        "deleted_series_redirects": deleted_series,
    }


async def run_slug_redirect_cleanup_loop(stop_event: asyncio.Event) -> None:
    last_run_local_date: date | None = None

    while not stop_event.is_set():
        now_local = datetime.now().astimezone()
        next_run_at = _next_run_at(now_local, last_run_local_date)
        delay_seconds = max(1.0, (next_run_at - now_local).total_seconds())
        logger.info('slug redirect cleanup scheduled for %s', next_run_at.isoformat())

        with suppress(asyncio.TimeoutError):
            await asyncio.wait_for(stop_event.wait(), timeout=delay_seconds)
            break

        try:
            summary = await asyncio.to_thread(purge_expired_redirects)
            logger.info(
                'slug redirect cleanup completed: deleted_post_redirects=%s deleted_series_redirects=%s',
                summary["deleted_post_redirects"],
                summary["deleted_series_redirects"],
            )
        except asyncio.CancelledError:
            raise
        except Exception:  # pragma: no cover
            logger.exception('slug redirect cleanup failed')
        finally:
            last_run_local_date = datetime.now().astimezone().date()
