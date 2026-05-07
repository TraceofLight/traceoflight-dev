//! Redis-backed translation job queue. Producer is sync-fire-and-forget
//! from post/series write paths; consumer is the worker tokio task.

use redis::{AsyncCommands, aio::ConnectionManager};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const QUEUE_SUFFIX: &str = "translations:queue";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EntityKind {
    Post,
    Series,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranslationJob {
    pub entity: EntityKind,
    pub source_id: Uuid,
    /// Target locale string ("en", "ja", "zh"). Stored as string so the
    /// queue payload doesn't tie itself to a Rust enum across versions.
    pub target_locale: String,
}

#[derive(Clone)]
pub struct TranslationQueue {
    conn: ConnectionManager,
    queue_key: String,
}

impl TranslationQueue {
    pub fn new(conn: ConnectionManager, key_prefix: &str) -> Self {
        Self {
            conn,
            queue_key: format!("{key_prefix}{QUEUE_SUFFIX}"),
        }
    }

    pub fn key(&self) -> &str {
        &self.queue_key
    }

    /// Enqueue at the tail (RPUSH). Returns the new list length on success.
    /// Errors are surfaced to the caller; producer-side callers wrap this
    /// in a fire-and-forget tokio::spawn and log on failure so a queue
    /// outage doesn't break user-facing saves.
    pub async fn push(&self, job: &TranslationJob) -> Result<i64, redis::RedisError> {
        let payload = serde_json::to_string(job).expect("TranslationJob always serializes");
        let mut conn = self.conn.clone();
        conn.rpush(&self.queue_key, payload).await
    }

    /// Block-pop one job (BLPOP with timeout). Returns Ok(None) on timeout
    /// without an error so the worker loop can periodically re-check
    /// shutdown signals.
    pub async fn blocking_pop(
        &self,
        timeout_seconds: f64,
    ) -> Result<Option<TranslationJob>, redis::RedisError> {
        let mut conn = self.conn.clone();
        let result: Option<(String, String)> =
            conn.blpop(&self.queue_key, timeout_seconds).await?;
        let Some((_key, payload)) = result else {
            return Ok(None);
        };
        match serde_json::from_str(&payload) {
            Ok(job) => Ok(Some(job)),
            Err(err) => {
                // Don't take down the worker over a malformed payload —
                // log and skip. Operationally this means a poison message
                // gets logged once and discarded.
                tracing::warn!(
                    error = %err,
                    payload = %payload,
                    "translation queue: dropping unparseable job payload"
                );
                Ok(None)
            }
        }
    }
}
