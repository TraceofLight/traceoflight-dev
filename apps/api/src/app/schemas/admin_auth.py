from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class AdminAuthLoginRequest(BaseModel):
    login_id: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=255)


class AdminAuthLoginResponse(BaseModel):
    ok: bool = True
    credential_source: Literal["operational", "master"]
    credential_revision: int
    access_token: str
    refresh_token: str
    access_max_age_seconds: int
    refresh_max_age_seconds: int


class AdminRefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1, max_length=1024)


class AdminRefreshResponse(BaseModel):
    ok: bool = True
    credential_revision: int
    access_token: str
    refresh_token: str
    access_max_age_seconds: int
    refresh_max_age_seconds: int


class AdminLogoutRequest(BaseModel):
    refresh_token: str = Field(min_length=1, max_length=1024)


class AdminCredentialUpdateRequest(BaseModel):
    login_id: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=255)


class AdminCredentialUpdateResponse(BaseModel):
    login_id: str
    credential_revision: int


class AdminCredentialRevisionResponse(BaseModel):
    credential_revision: int
