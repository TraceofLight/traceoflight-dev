from __future__ import annotations

from pydantic import BaseModel


class ResumeStatusRead(BaseModel):
    available: bool
