from __future__ import annotations

from pydantic import BaseModel


class BackupLoadRead(BaseModel):
    restored_posts: int
    restored_media: int
    restored_series_overrides: int
