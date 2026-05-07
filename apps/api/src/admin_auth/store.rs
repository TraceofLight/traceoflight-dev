//! Refresh-token state stored in Redis (per-jti record + per-family tombstone).

use redis::{AsyncCommands, aio::ConnectionManager};
use serde::{Deserialize, Serialize};

use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefreshState {
    pub jti: String,
    pub family_id: String,
    pub token_hash: String,
    pub expires_at: i64,
    pub credential_revision: i32,
    #[serde(default)]
    pub parent_jti: Option<String>,
    #[serde(default)]
    pub rotated_to_jti: Option<String>,
    #[serde(default)]
    pub used: bool,
    #[serde(default)]
    pub revoked: bool,
}

#[derive(Clone)]
pub struct RefreshStore {
    conn: ConnectionManager,
    key_prefix: String,
}

impl RefreshStore {
    pub fn new(conn: ConnectionManager, key_prefix: String) -> Self {
        Self { conn, key_prefix }
    }

    fn state_key(&self, jti: &str) -> String {
        format!("{}admin:refresh:{jti}", self.key_prefix)
    }
    fn family_key(&self, family_id: &str) -> String {
        format!("{}admin:refresh:family:{family_id}:revoked", self.key_prefix)
    }

    pub async fn get_state(&self, jti: &str) -> Result<Option<RefreshState>, AppError> {
        let mut conn = self.conn.clone();
        let raw: Option<String> = conn.get(self.state_key(jti)).await.map_err(redis_to_app)?;
        let Some(raw) = raw else { return Ok(None) };
        let state: RefreshState = serde_json::from_str(&raw)
            .map_err(|err| AppError::Internal(anyhow::anyhow!("invalid refresh state: {err}")))?;
        Ok(Some(state))
    }

    pub async fn set_state(&self, state: &RefreshState) -> Result<(), AppError> {
        let now_seconds = chrono::Utc::now().timestamp();
        let ttl_seconds = (state.expires_at - now_seconds).max(1);
        let json = serde_json::to_string(&state)
            .map_err(|err| AppError::Internal(anyhow::anyhow!("refresh state serialize: {err}")))?;
        let mut conn = self.conn.clone();
        let _: () = conn
            .set_ex(self.state_key(&state.jti), json, ttl_seconds as u64)
            .await
            .map_err(redis_to_app)?;
        Ok(())
    }

    pub async fn revoke_family(&self, family_id: &str, ttl_seconds: i64) -> Result<(), AppError> {
        let mut conn = self.conn.clone();
        let _: () = conn
            .set_ex(self.family_key(family_id), "1", ttl_seconds.max(1) as u64)
            .await
            .map_err(redis_to_app)?;
        Ok(())
    }

    pub async fn is_family_revoked(&self, family_id: &str) -> Result<bool, AppError> {
        let mut conn = self.conn.clone();
        let exists: i64 = conn
            .exists(self.family_key(family_id))
            .await
            .map_err(redis_to_app)?;
        Ok(exists > 0)
    }
}

fn redis_to_app(err: redis::RedisError) -> AppError {
    AppError::Internal(anyhow::anyhow!("redis error: {err}"))
}
