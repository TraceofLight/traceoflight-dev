//! Translation provider abstraction + Google Translate API (v2/Basic) impl.
//!
//! Basic v2 was chosen over Advanced v3 because the only Advanced feature
//! that meaningfully helps a personal blog is glossary support, and the
//! single-string API key matches the existing Jenkins secret pattern. If
//! glossary becomes necessary later, swap the `GoogleTranslateProvider`
//! impl while keeping the `TranslationProvider` trait stable.

use std::time::Duration;

use serde::Deserialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum TranslationError {
    #[error("translation transport failed: {0}")]
    Transport(String),

    #[error("translation provider returned status {status}: {body}")]
    Provider { status: u16, body: String },

    #[error("translation response decode failed: {0}")]
    DecodeFailed(String),

    #[error("translation response had no candidate")]
    Empty,

    #[error("translation provider not configured")]
    NotConfigured,
}

pub trait TranslationProvider: Send + Sync {
    /// Translate a single string from `source_lang` (`"ko"`) to
    /// `target_lang` (one of `"en"`, `"ja"`, `"zh"`). Empty input returns
    /// empty output without making a network call.
    fn translate_text(
        &self,
        text: &str,
        source_lang: &str,
        target_lang: &str,
    ) -> impl std::future::Future<Output = Result<String, TranslationError>> + Send;
}

pub struct GoogleTranslateProvider {
    api_key: String,
    http: reqwest::Client,
}

impl GoogleTranslateProvider {
    pub fn new(api_key: String) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .expect("reqwest defaults are valid");
        Self { api_key, http }
    }
}

impl TranslationProvider for GoogleTranslateProvider {
    async fn translate_text(
        &self,
        text: &str,
        source_lang: &str,
        target_lang: &str,
    ) -> Result<String, TranslationError> {
        if text.is_empty() {
            return Ok(String::new());
        }
        if self.api_key.trim().is_empty() {
            return Err(TranslationError::NotConfigured);
        }
        let url = format!(
            "https://translation.googleapis.com/language/translate/v2?key={}",
            self.api_key
        );
        let body = serde_json::json!({
            "q": text,
            "source": source_lang,
            "target": target_lang,
            "format": "text",
        });
        let response = self
            .http
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|err| TranslationError::Transport(err.to_string()))?;
        let status = response.status();
        if !status.is_success() {
            let body_text = response.text().await.unwrap_or_default();
            return Err(TranslationError::Provider {
                status: status.as_u16(),
                body: body_text,
            });
        }
        let parsed: GoogleResponse = response
            .json()
            .await
            .map_err(|err| TranslationError::DecodeFailed(err.to_string()))?;
        parsed
            .data
            .translations
            .into_iter()
            .next()
            .map(|t| t.translated_text)
            .ok_or(TranslationError::Empty)
    }
}

#[derive(Deserialize)]
struct GoogleResponse {
    data: GoogleData,
}

#[derive(Deserialize)]
struct GoogleData {
    translations: Vec<GoogleTranslation>,
}

#[derive(Deserialize)]
struct GoogleTranslation {
    #[serde(rename = "translatedText")]
    translated_text: String,
}
