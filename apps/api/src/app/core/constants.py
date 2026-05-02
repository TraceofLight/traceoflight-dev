"""Shared validation constraints reused across schemas."""

from __future__ import annotations

from typing import Final


class CommentConstraints:
    AUTHOR_NAME_MAX_LENGTH: Final[int] = 24
    PASSWORD_MIN_LENGTH: Final[int] = 4
    PASSWORD_MAX_LENGTH: Final[int] = 64
    BODY_MIN_LENGTH: Final[int] = 2
    BODY_MAX_LENGTH: Final[int] = 2000
