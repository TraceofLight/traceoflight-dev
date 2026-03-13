from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from redis.asyncio import Redis

from app.core.config import settings
from app.repositories.admin_credential_repository import AdminCredentialRepository
from app.services.admin_refresh_store import AdminRefreshStore, RefreshState
from app.services.admin_token_codec import AdminTokenCodec, AdminTokenPair


MIN_ADMIN_LOGIN_ID_LENGTH = 3
MIN_ADMIN_PASSWORD_LENGTH = 8


@dataclass(frozen=True)
class AdminCredentialVerifyResult:
    ok: bool
    credential_source: str | None = None
    revision: int = 0


@dataclass(frozen=True)
class AdminCredentialUpdateResult:
    login_id: str
    revision: int


@dataclass(frozen=True)
class AdminLoginResult:
    ok: bool
    credential_source: str | None = None
    revision: int = 0
    token_pair: AdminTokenPair | None = None


@dataclass(frozen=True)
class AdminRefreshResult:
    kind: str
    revision: int = 0
    token_pair: AdminTokenPair | None = None


class AdminAuthService:
    def __init__(self, repo: AdminCredentialRepository, redis: Redis) -> None:
        self.repo = repo
        self._password_hasher = PasswordHasher()
        self._codec = AdminTokenCodec(
            secret=settings.admin_session_secret.strip(),
            access_max_age_seconds=max(60, settings.admin_access_token_max_age_seconds),
            refresh_max_age_seconds=max(60, settings.admin_refresh_token_max_age_seconds),
        )
        self._refresh_store = AdminRefreshStore(redis)

    async def verify_credentials(self, login_id: str, password: str) -> AdminCredentialVerifyResult:
        normalized_login_id = login_id.strip()
        if not normalized_login_id or not password:
            return AdminCredentialVerifyResult(ok=False)

        operational = self.repo.get_operational()
        if (
            operational is not None
            and secrets.compare_digest(normalized_login_id, operational.login_id)
            and self._verify_hash(operational.password_hash, password)
        ):
            return AdminCredentialVerifyResult(
                ok=True,
                credential_source="operational",
                revision=operational.credential_revision,
            )

        active_revision = operational.credential_revision if operational is not None else 0
        if self._verify_master_credentials(normalized_login_id, password):
            return AdminCredentialVerifyResult(
                ok=True,
                credential_source="master",
                revision=active_revision,
            )

        return AdminCredentialVerifyResult(ok=False, revision=active_revision)

    async def update_operational_credentials(self, login_id: str, password: str) -> AdminCredentialUpdateResult:
        normalized_login_id = login_id.strip()
        self._validate_operational_credentials(normalized_login_id, password)

        current = self.repo.get_operational()
        next_revision = 1 if current is None else current.credential_revision + 1
        password_hash = self._password_hasher.hash(password)
        saved = self.repo.save_operational(
            login_id=normalized_login_id,
            password_hash=password_hash,
            credential_revision=next_revision,
        )
        self.repo.db.commit()
        return AdminCredentialUpdateResult(login_id=saved.login_id, revision=saved.credential_revision)

    async def get_active_credential_revision(self) -> int:
        current = self.repo.get_operational()
        if current is None:
            return 0
        return current.credential_revision

    async def login(self, login_id: str, password: str) -> AdminLoginResult:
        verification = await self.verify_credentials(login_id, password)
        if not verification.ok or verification.credential_source is None:
            return AdminLoginResult(ok=False, revision=verification.revision)

        token_pair, family_id = self._codec.issue_pair(credential_revision=verification.revision)
        refresh_payload = self._codec.verify_token(token_pair.refresh_token, "refresh")
        if refresh_payload is None:
            return AdminLoginResult(ok=False, revision=verification.revision)

        await self._refresh_store.set_state(
            RefreshState(
                jti=refresh_payload.jti,
                family_id=family_id,
                token_hash=self._codec.hash_token(token_pair.refresh_token),
                expires_at=refresh_payload.exp,
                credential_revision=verification.revision,
            )
        )
        return AdminLoginResult(
            ok=True,
            credential_source=verification.credential_source,
            revision=verification.revision,
            token_pair=token_pair,
        )

    async def rotate_refresh_token(self, refresh_token: str) -> AdminRefreshResult:
        unsafe_payload = self._codec.decode_payload_unsafe(refresh_token)
        state_from_unsafe = (
            None if unsafe_payload is None else await self._refresh_store.get_state(unsafe_payload.jti)
        )

        payload = self._codec.verify_token(refresh_token, "refresh")
        if payload is None:
            if state_from_unsafe is not None:
                await self._revoke_family_from_state(state_from_unsafe)
                return AdminRefreshResult(kind="reuse_detected", revision=state_from_unsafe.credential_revision)
            return AdminRefreshResult(kind="invalid")

        now_epoch_seconds = self._now_epoch_seconds()
        if payload.exp <= now_epoch_seconds:
            if state_from_unsafe is not None:
                await self._refresh_store.set_state(
                    RefreshState(**{**state_from_unsafe.__dict__, "revoked": True})
                )
            return AdminRefreshResult(kind="expired", revision=payload.credential_revision)

        state = await self._refresh_store.get_state(payload.jti)
        if state is None:
            return AdminRefreshResult(kind="invalid", revision=payload.credential_revision)
        if payload.credential_revision != await self.get_active_credential_revision():
            await self._refresh_store.set_state(RefreshState(**{**state.__dict__, "revoked": True}))
            return AdminRefreshResult(kind="invalid", revision=payload.credential_revision)
        if state.expires_at <= now_epoch_seconds:
            await self._refresh_store.set_state(RefreshState(**{**state.__dict__, "revoked": True}))
            return AdminRefreshResult(kind="expired", revision=state.credential_revision)

        token_hash = self._codec.hash_token(refresh_token)
        if not secrets.compare_digest(token_hash, state.token_hash):
            await self._revoke_family_from_state(state)
            return AdminRefreshResult(kind="reuse_detected", revision=state.credential_revision)

        if await self._refresh_store.is_family_revoked(state.family_id):
            return AdminRefreshResult(kind="reuse_detected", revision=state.credential_revision)

        if state.used:
            child_state = (
                None if not state.rotated_to_jti else await self._refresh_store.get_state(state.rotated_to_jti)
            )
            if (
                child_state is not None
                and not child_state.revoked
                and child_state.expires_at > now_epoch_seconds
                and not await self._refresh_store.is_family_revoked(child_state.family_id)
            ):
                return AdminRefreshResult(kind="stale", revision=state.credential_revision)
            await self._revoke_family_from_state(state)
            return AdminRefreshResult(kind="reuse_detected", revision=state.credential_revision)

        if state.revoked:
            await self._revoke_family_from_state(state)
            return AdminRefreshResult(kind="reuse_detected", revision=state.credential_revision)

        next_pair = self._codec.issue_rotated_pair(
            credential_revision=state.credential_revision,
            family_id=state.family_id,
        )
        next_payload = self._codec.verify_token(next_pair.refresh_token, "refresh")
        if next_payload is None:
            return AdminRefreshResult(kind="invalid", revision=state.credential_revision)

        await self._refresh_store.set_state(
            RefreshState(
                jti=next_payload.jti,
                family_id=state.family_id,
                token_hash=self._codec.hash_token(next_pair.refresh_token),
                expires_at=next_payload.exp,
                credential_revision=state.credential_revision,
                parent_jti=state.jti,
            )
        )
        await self._refresh_store.set_state(
            RefreshState(
                **{
                    **state.__dict__,
                    "used": True,
                    "revoked": True,
                    "rotated_to_jti": next_payload.jti,
                }
            )
        )
        return AdminRefreshResult(
            kind="rotated",
            revision=state.credential_revision,
            token_pair=next_pair,
        )

    async def revoke_refresh_token_family(self, refresh_token: str) -> None:
        payload = self._codec.verify_token(refresh_token, "refresh")
        if payload is None:
            return
        state = await self._refresh_store.get_state(payload.jti)
        if state is None:
            return
        await self._revoke_family_from_state(state)

    def _verify_master_credentials(self, login_id: str, password: str) -> bool:
        configured_login_id = settings.admin_login_id.strip()
        configured_password_hash = settings.admin_login_password_hash.strip()
        configured_password = settings.admin_login_password.strip()
        if not configured_login_id or (not configured_password_hash and not configured_password):
            return False
        if not secrets.compare_digest(login_id, configured_login_id):
            return False
        if configured_password_hash:
            return self._verify_hash(configured_password_hash, password)
        return secrets.compare_digest(password, configured_password)

    def _verify_hash(self, hash_value: str, password: str) -> bool:
        if hash_value.startswith("$argon2"):
            try:
                return self._password_hasher.verify(hash_value, password)
            except (VerifyMismatchError, InvalidHashError):
                return False

        if hash_value.startswith("sha256:"):
            actual_hash = hashlib.sha256(password.encode("utf-8")).hexdigest()
            return secrets.compare_digest(actual_hash, hash_value.removeprefix("sha256:"))

        return False

    def _validate_operational_credentials(self, login_id: str, password: str) -> None:
        if len(login_id) < MIN_ADMIN_LOGIN_ID_LENGTH:
            raise ValueError("login_id must be at least 3 characters")
        if any(char.isspace() for char in login_id):
            raise ValueError("login_id must not contain whitespace")
        if len(password) < MIN_ADMIN_PASSWORD_LENGTH:
            raise ValueError("password must be at least 8 characters")

    async def _revoke_family_from_state(self, state: RefreshState) -> None:
        ttl_seconds = max(1, state.expires_at - self._now_epoch_seconds())
        await self._refresh_store.revoke_family(state.family_id, ttl_seconds)

    def _now_epoch_seconds(self) -> int:
        import time

        return int(time.time())
