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

OPENAPI_TAGS = [
    {'name': 'health', 'description': 'Liveness and readiness probe endpoints.'},
    {'name': 'posts', 'description': 'Post query endpoints and internal write operations.'},
    {'name': 'media', 'description': 'Media upload URL issuance, proxy upload, and metadata registration.'},
]


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging()
    stop_event = asyncio.Event()
    cleanup_task = asyncio.create_task(run_draft_cleanup_loop(stop_event))
    try:
        yield
    finally:
        stop_event.set()
        cleanup_task.cancel()
        with suppress(asyncio.CancelledError):
            await cleanup_task


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
