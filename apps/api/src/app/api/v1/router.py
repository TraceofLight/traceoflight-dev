from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.media import router as media_router
from app.api.v1.endpoints.posts import router as posts_router
from app.api.v1.endpoints.tags import router as tags_router

router = APIRouter()
router.include_router(health_router, tags=['health'])
router.include_router(posts_router, prefix='/posts', tags=['posts'])
router.include_router(tags_router, prefix='/tags', tags=['tags'])
router.include_router(media_router, prefix='/media', tags=['media'])
