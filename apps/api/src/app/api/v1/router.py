from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.endpoints.comments import router as comments_router
from app.api.v1.endpoints.admin_auth import router as admin_auth_router
from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.imports import router as imports_router
from app.api.v1.endpoints.media import router as media_router
from app.api.v1.endpoints.portfolio import router as portfolio_router
from app.api.v1.endpoints.posts import router as posts_router
from app.api.v1.endpoints.projects import router as projects_router
from app.api.v1.endpoints.resume import router as resume_router
from app.api.v1.endpoints.series import router as series_router
from app.api.v1.endpoints.tags import router as tags_router

router = APIRouter()
router.include_router(health_router, tags=['health'])
router.include_router(admin_auth_router, tags=['admin-auth'])
router.include_router(comments_router, tags=['comments'])
router.include_router(imports_router, prefix='/imports', tags=['imports'])
router.include_router(posts_router, prefix='/posts', tags=['posts'])
router.include_router(projects_router, prefix='/projects', tags=['projects'])
router.include_router(series_router, prefix='/series', tags=['series'])
router.include_router(tags_router, prefix='/tags', tags=['tags'])
router.include_router(media_router, prefix='/media', tags=['media'])
router.include_router(portfolio_router, prefix='/portfolio', tags=['portfolio'])
router.include_router(resume_router, prefix='/resume', tags=['resume'])
