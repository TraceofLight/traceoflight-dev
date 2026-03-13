from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from app.core.config import settings
from app.repositories.admin_credential_repository import AdminCredentialRepository


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


class AdminAuthService:
    def __init__(self, repo: AdminCredentialRepository) -> None:
        self.repo = repo
        self._password_hasher = PasswordHasher()

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
