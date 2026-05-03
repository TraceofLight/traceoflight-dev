from __future__ import annotations

import json
from dataclasses import dataclass

from redis.asyncio import Redis

from app.core.time import now_epoch_seconds


@dataclass(frozen=True)
class RefreshState:
    jti: str
    family_id: str
    token_hash: str
    expires_at: int
    credential_revision: int
    parent_jti: str | None = None
    rotated_to_jti: str | None = None
    used: bool = False
    revoked: bool = False


class AdminRefreshStore:
    def __init__(self, redis: Redis) -> None:
        self.redis = redis

    async def get_state(self, jti: str) -> RefreshState | None:
        raw = await self.redis.get(self._state_key(jti))
        if raw is None:
            return None
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        parsed = json.loads(raw)
        return RefreshState(
            jti=str(parsed["jti"]),
            family_id=str(parsed["family_id"]),
            token_hash=str(parsed["token_hash"]),
            expires_at=int(parsed["expires_at"]),
            credential_revision=int(parsed["credential_revision"]),
            parent_jti=parsed.get("parent_jti"),
            rotated_to_jti=parsed.get("rotated_to_jti"),
            used=bool(parsed.get("used", False)),
            revoked=bool(parsed.get("revoked", False)),
        )

    async def set_state(self, state: RefreshState) -> None:
        ttl_seconds = max(1, state.expires_at - now_epoch_seconds())
        await self.redis.set(
            self._state_key(state.jti),
            json.dumps(
                {
                    "jti": state.jti,
                    "family_id": state.family_id,
                    "token_hash": state.token_hash,
                    "expires_at": state.expires_at,
                    "credential_revision": state.credential_revision,
                    "parent_jti": state.parent_jti,
                    "rotated_to_jti": state.rotated_to_jti,
                    "used": state.used,
                    "revoked": state.revoked,
                },
                separators=(",", ":"),
            ),
            ex=ttl_seconds,
        )

    async def revoke_family(self, family_id: str, ttl_seconds: int) -> None:
        await self.redis.set(self._family_key(family_id), "1", ex=max(1, ttl_seconds))

    async def is_family_revoked(self, family_id: str) -> bool:
        return bool(await self.redis.exists(self._family_key(family_id)))

    def _state_key(self, jti: str) -> str:
        return f"admin:refresh:{jti}"

    def _family_key(self, family_id: str) -> str:
        return f"admin:refresh:family:{family_id}:revoked"
