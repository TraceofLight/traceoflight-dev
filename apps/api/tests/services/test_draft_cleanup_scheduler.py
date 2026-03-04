from datetime import datetime, timedelta, timezone

from app.services import draft_cleanup_scheduler as scheduler


def _set_window(monkeypatch, start_hour: int, end_hour: int) -> None:
    monkeypatch.setattr(scheduler.settings, 'draft_cleanup_start_hour', start_hour, raising=False)
    monkeypatch.setattr(scheduler.settings, 'draft_cleanup_end_hour', end_hour, raising=False)
    monkeypatch.setattr(scheduler.random, 'uniform', lambda start, end: start)


def test_next_run_at_uses_today_window_when_before_dawn(monkeypatch) -> None:
    _set_window(monkeypatch, start_hour=1, end_hour=3)
    tz = timezone(timedelta(hours=9))
    now_local = datetime(2026, 3, 4, 0, 10, 0, tzinfo=tz)

    scheduled = scheduler._next_run_at(now_local=now_local)

    assert scheduled == datetime(2026, 3, 4, 1, 0, 0, tzinfo=tz)


def test_next_run_at_uses_tomorrow_window_when_after_dawn(monkeypatch) -> None:
    _set_window(monkeypatch, start_hour=1, end_hour=3)
    tz = timezone(timedelta(hours=9))
    now_local = datetime(2026, 3, 4, 4, 10, 0, tzinfo=tz)

    scheduled = scheduler._next_run_at(now_local=now_local)

    assert scheduled == datetime(2026, 3, 5, 1, 0, 0, tzinfo=tz)


def test_next_run_at_skips_same_day_after_run(monkeypatch) -> None:
    _set_window(monkeypatch, start_hour=1, end_hour=3)
    tz = timezone(timedelta(hours=9))
    now_local = datetime(2026, 3, 4, 2, 10, 0, tzinfo=tz)

    scheduled = scheduler._next_run_at(now_local=now_local, last_run_local_date=now_local.date())

    assert scheduled == datetime(2026, 3, 5, 1, 0, 0, tzinfo=tz)
