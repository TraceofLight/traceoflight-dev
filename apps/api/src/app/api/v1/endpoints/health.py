from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()


@router.get(
    '/health',
    summary='Health check',
    description='Simple liveness probe used by load balancer and container health checks.',
    responses={
        200: {'description': 'Service is alive'},
    },
)
def health_check() -> dict[str, str]:
    """Return service liveness status."""
    return {'status': 'ok'}
