from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from contextlib import suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import router as api_router
from app.core.config import settings
from app.core.logging import configure_logging
from app.services.draft_cleanup_scheduler import run_draft_cleanup_loop
from app.services.series_projection_cache import run_series_projection_loop

OPENAPI_TAGS = [
    {'name': 'health', 'description': 'Liveness and readiness probe endpoints.'},
    {'name': 'admin-auth', 'description': 'Operational admin credential verification and rotation endpoints.'},
    {'name': 'comments', 'description': 'Post comment threads, guest editing, and admin moderation endpoints.'},
    {'name': 'posts', 'description': 'Post query endpoints and internal write operations.'},
    {'name': 'projects', 'description': 'Project query endpoints backed by project posts.'},
    {'name': 'series', 'description': 'Series discovery endpoints and internal series management operations.'},
    {'name': 'tags', 'description': 'Tag query endpoints and internal tag management operations.'},
    {'name': 'media', 'description': 'Media upload URL issuance, proxy upload, and metadata registration.'},
    {'name': 'portfolio', 'description': 'Public portfolio PDF retrieval and internal portfolio upload operations.'},
    {'name': 'resume', 'description': 'Public resume PDF retrieval and internal resume upload operations.'},
]


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging()
    stop_event = asyncio.Event()
    cleanup_task = asyncio.create_task(run_draft_cleanup_loop(stop_event))
    series_projection_task = asyncio.create_task(run_series_projection_loop(stop_event))
    try:
        yield
    finally:
        stop_event.set()
        for task in (cleanup_task, series_projection_task):
            task.cancel()
        for task in (cleanup_task, series_projection_task):
            with suppress(asyncio.CancelledError):
                await task


app = FastAPI(
    title=settings.app_name,
    description='TraceofLight content API for post and media management.',
    lifespan=lifespan,
    openapi_tags=OPENAPI_TAGS,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router, prefix=settings.api_prefix)
