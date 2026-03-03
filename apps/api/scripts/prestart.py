from __future__ import annotations

import time

from sqlalchemy import create_engine, text

from app.core.config import settings


def wait_for_postgres(max_attempts: int = 30, sleep_seconds: int = 2) -> None:
    engine = create_engine(settings.database_url, pool_pre_ping=True)
    for attempt in range(1, max_attempts + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            print("PostgreSQL connection succeeded")
            return
        except Exception as exc:  # noqa: BLE001
            print(f"[{attempt}/{max_attempts}] PostgreSQL not ready: {exc}")
            time.sleep(sleep_seconds)

    raise RuntimeError("PostgreSQL did not become available in time")


if __name__ == "__main__":
    wait_for_postgres()