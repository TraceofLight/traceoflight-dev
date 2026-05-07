//! Fire-and-forget IndexNow ping issued from write handlers when a public URL
//! changes. Failures are logged at WARN; nothing surfaces to the response.

use std::sync::Arc;
use std::time::Duration;

use serde_json::json;
use tracing::warn;

use crate::config::IndexNowSettings;

const TIMEOUT_SECONDS: u64 = 5;

#[derive(Clone)]
pub struct IndexNowClient {
    settings: Arc<IndexNowSettings>,
}

impl IndexNowClient {
    pub fn new(settings: IndexNowSettings) -> Self {
        Self {
            settings: Arc::new(settings),
        }
    }

    pub fn is_configured(&self) -> bool {
        self.settings.is_configured()
    }

    /// Fire-and-forget: spawn a background task that POSTs the URL list to the
    /// IndexNow endpoint. Returns immediately so the caller (write handlers)
    /// stays low-latency. Failures are logged at WARN; nothing surfaces to
    /// the response.
    pub fn submit_urls(&self, urls: Vec<String>) {
        if !self.is_configured() {
            return;
        }
        let urls: Vec<String> = urls.into_iter().filter(|u| !u.is_empty()).collect();
        if urls.is_empty() {
            return;
        }
        let settings = self.settings.clone();
        tokio::spawn(async move {
            let payload = json!({
                "host": settings.host,
                "key": settings.key,
                "urlList": urls,
            });
            let client = match reqwest::Client::builder()
                .timeout(Duration::from_secs(TIMEOUT_SECONDS))
                .build()
            {
                Ok(c) => c,
                Err(err) => {
                    warn!(error = %err, "indexnow client init failed");
                    return;
                }
            };
            match client
                .post(&settings.endpoint)
                .header("content-type", "application/json")
                .json(&payload)
                .send()
                .await
            {
                Ok(resp) if resp.status().is_success() => {}
                Ok(resp) => warn!(status = %resp.status(), "indexnow ping non-2xx response"),
                Err(err) => warn!(error = %err, "indexnow ping transport error"),
            }
        });
    }

    /// Build the canonical post URL the FE serves for a given (locale, slug).
    /// Mirrors `https://{host}/{locale}/blog/{slug}/`.
    pub fn post_url(&self, locale: &str, slug: &str) -> Option<String> {
        let host = self.settings.host.trim();
        if host.is_empty() || slug.is_empty() {
            return None;
        }
        Some(format!("https://{host}/{locale}/blog/{slug}/"))
    }
}
