from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
import uuid
from dataclasses import dataclass
from typing import Literal


TokenType = Literal["access", "refresh"]


def _b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("utf-8").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}".encode("utf-8"))


@dataclass(frozen=True)
class AdminTokenPayload:
    sub: Literal["admin"]
    type: TokenType
    jti: str
    exp: int
    iat: int
    credential_revision: int


@dataclass(frozen=True)
class AdminTokenPair:
    access_token: str
    refresh_token: str
    access_max_age_seconds: int
    refresh_max_age_seconds: int


class AdminTokenCodec:
    def __init__(
        self,
        *,
        secret: str,
        access_max_age_seconds: int,
        refresh_max_age_seconds: int,
    ) -> None:
        self.secret = secret.encode("utf-8")
        self.access_max_age_seconds = access_max_age_seconds
        self.refresh_max_age_seconds = refresh_max_age_seconds

    def issue_pair(self, *, credential_revision: int, family_id: str | None = None) -> tuple[AdminTokenPair, str]:
        issued_at = int(time.time())
        access_payload = AdminTokenPayload(
            sub="admin",
            type="access",
            jti=str(uuid.uuid4()),
            iat=issued_at,
            exp=issued_at + self.access_max_age_seconds,
            credential_revision=credential_revision,
        )
        refresh_jti = str(uuid.uuid4())
        resolved_family_id = family_id or str(uuid.uuid4())
        refresh_payload = AdminTokenPayload(
            sub="admin",
            type="refresh",
            jti=refresh_jti,
            iat=issued_at,
            exp=issued_at + self.refresh_max_age_seconds,
            credential_revision=credential_revision,
        )
        return (
            AdminTokenPair(
                access_token=self._issue_token(access_payload),
                refresh_token=self._issue_token(refresh_payload),
                access_max_age_seconds=self.access_max_age_seconds,
                refresh_max_age_seconds=self.refresh_max_age_seconds,
            ),
            resolved_family_id,
        )

    def issue_rotated_pair(
        self,
        *,
        credential_revision: int,
        family_id: str,
    ) -> AdminTokenPair:
        pair, _ = self.issue_pair(credential_revision=credential_revision, family_id=family_id)
        return pair

    def decode_payload_unsafe(self, token: str) -> AdminTokenPayload | None:
        parts = token.split(".")
        if len(parts) != 2:
            return None
        try:
            raw = _b64url_decode(parts[0]).decode("utf-8")
            parsed = json.loads(raw)
        except (ValueError, json.JSONDecodeError):
            return None
        return self._parse_payload(parsed)

    def verify_token(self, token: str, expected_type: TokenType) -> AdminTokenPayload | None:
        parts = token.split(".")
        if len(parts) != 2:
            return None
        encoded_payload, signature = parts
        expected_signature = self._sign(encoded_payload)
        if not hmac.compare_digest(signature, expected_signature):
            return None
        payload = self.decode_payload_unsafe(token)
        if payload is None or payload.type != expected_type:
            return None
        return payload

    def hash_token(self, token: str) -> str:
        return hmac.new(self.secret, token.encode("utf-8"), hashlib.sha256).hexdigest()

    def _issue_token(self, payload: AdminTokenPayload) -> str:
        encoded_payload = _b64url_encode(
            json.dumps(
                {
                    "sub": payload.sub,
                    "type": payload.type,
                    "jti": payload.jti,
                    "exp": payload.exp,
                    "iat": payload.iat,
                    "credentialRevision": payload.credential_revision,
                },
                separators=(",", ":"),
            ).encode("utf-8")
        )
        return f"{encoded_payload}.{self._sign(encoded_payload)}"

    def _sign(self, encoded_payload: str) -> str:
        return _b64url_encode(hmac.new(self.secret, encoded_payload.encode("utf-8"), hashlib.sha256).digest())

    def _parse_payload(self, payload: object) -> AdminTokenPayload | None:
        if not isinstance(payload, dict):
            return None
        token_type = payload.get("type")
        if payload.get("sub") != "admin":
            return None
        if token_type not in ("access", "refresh"):
            return None
        jti = payload.get("jti")
        exp = payload.get("exp")
        issued_at = payload.get("iat")
        credential_revision = payload.get("credentialRevision")
        if not isinstance(jti, str) or not jti:
            return None
        if not isinstance(exp, int):
            return None
        if not isinstance(issued_at, int):
            return None
        if not isinstance(credential_revision, int):
            return None
        return AdminTokenPayload(
            sub="admin",
            type=token_type,
            jti=jti,
            exp=exp,
            iat=issued_at,
            credential_revision=credential_revision,
        )
