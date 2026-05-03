"""Time helpers shared across services."""

from __future__ import annotations

import time


def now_epoch_seconds() -> int:
    return int(time.time())
