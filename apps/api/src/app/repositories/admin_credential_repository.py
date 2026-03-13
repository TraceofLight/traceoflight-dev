from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.admin_credential import AdminCredential, OPERATIONAL_ADMIN_CREDENTIAL_KEY


class AdminCredentialRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_operational(self) -> AdminCredential | None:
        return self.db.scalar(
            select(AdminCredential).where(AdminCredential.key == OPERATIONAL_ADMIN_CREDENTIAL_KEY)
        )

    def save_operational(
        self,
        *,
        login_id: str,
        password_hash: str,
        credential_revision: int,
    ) -> AdminCredential:
        credential = self.get_operational()
        if credential is None:
            credential = AdminCredential(
                key=OPERATIONAL_ADMIN_CREDENTIAL_KEY,
                login_id=login_id,
                password_hash=password_hash,
                credential_revision=credential_revision,
            )
            self.db.add(credential)
            self.db.flush()
            return credential

        credential.login_id = login_id
        credential.password_hash = password_hash
        credential.credential_revision = credential_revision
        self.db.flush()
        return credential
