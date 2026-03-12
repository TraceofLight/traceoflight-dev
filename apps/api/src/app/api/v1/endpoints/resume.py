from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter()

def _not_found_response() -> JSONResponse:
    return JSONResponse({"detail": "not found"}, status_code=404)


@router.get("/status", summary="Closed resume PDF status route")
def get_resume_status() -> JSONResponse:
    return _not_found_response()


@router.get("", summary="Closed resume PDF download route")
def get_resume_pdf() -> JSONResponse:
    return _not_found_response()


@router.post("", summary="Closed resume PDF upload route")
async def upload_resume_pdf() -> JSONResponse:
    return _not_found_response()
