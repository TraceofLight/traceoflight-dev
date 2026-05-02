"""Shared internal-secret authentication helpers.

This module consolidates the previously duplicated
``is_trusted_internal_request`` / ``ensure_trusted_internal_request`` helpers
that lived in several endpoint modules. Endpoints should import the
helpers from here (directly or via the FastAPI ``Depends`` wrappers below)
instead of redefining them.
"""

from __future__ import annotations

import secrets

from fastapi import Header, HTTPException, Request

from app.core.config import settings


INTERNAL_SECRET_HEADER_DESCRIPTION = (
    "Internal shared secret for privileged filtering and write operations."
)

_INTERNAL_SECRET_HEADER_NAME = "x-internal-api-secret"


def is_trusted_internal_request(
    request: Request,
    request_secret: str | None = None,
) -> bool:
    """Return True iff the supplied request carries a valid internal secret.

    The check is timing-safe and treats an empty configured secret as
    "no internal callers allowed".
    """

    configured_secret = settings.internal_api_secret.strip()
    if not configured_secret:
        return False
    if request_secret is None:
        request_secret = request.headers.get(_INTERNAL_SECRET_HEADER_NAME, "")
    request_secret = request_secret.strip()
    if not request_secret:
        return False
    return secrets.compare_digest(request_secret, configured_secret)


def ensure_trusted_internal_request(
    request: Request,
    request_secret: str | None = None,
) -> None:
    """Raise HTTP 401 unless the request carries a valid internal secret."""

    if is_trusted_internal_request(request, request_secret):
        return
    raise HTTPException(status_code=401, detail="unauthorized")


def require_internal_secret(
    request: Request,
    x_internal_api_secret: str | None = Header(
        default=None,
        alias=_INTERNAL_SECRET_HEADER_NAME,
        description=INTERNAL_SECRET_HEADER_DESCRIPTION,
    ),
) -> None:
    """FastAPI dependency that enforces the internal-secret header.

    Use as ``Depends(require_internal_secret)`` on routes that must only be
    callable by trusted internal services.
    """

    ensure_trusted_internal_request(request, x_internal_api_secret)


def optional_internal_secret(
    request: Request,
    x_internal_api_secret: str | None = Header(
        default=None,
        alias=_INTERNAL_SECRET_HEADER_NAME,
        description=INTERNAL_SECRET_HEADER_DESCRIPTION,
    ),
) -> bool:
    """FastAPI dependency that returns whether the caller is trusted.

    Use as ``trusted: bool = Depends(optional_internal_secret)`` on routes
    that adjust their behaviour based on caller trust without rejecting
    anonymous callers.
    """

    return is_trusted_internal_request(request, x_internal_api_secret)
