//! Footer profile (email + GitHub URL) shown across the public site. A single
//! row keyed by `default`; missing rows fall back to compile-time defaults.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use utoipa::ToSchema;

use crate::error::AppError;

const DEFAULT_KEY: &str = "default";
const DEFAULT_EMAIL: &str = "rickyjun96@gmail.com";
const DEFAULT_GITHUB_URL: &str = "https://github.com/TraceofLight";

#[derive(Debug, Serialize, Deserialize, FromRow, ToSchema)]
pub struct SiteProfileRead {
    pub email: String,
    pub github_url: String,
}

pub async fn get_site_profile(pool: &PgPool) -> Result<SiteProfileRead, sqlx::Error> {
    let row = sqlx::query_as::<_, SiteProfileRead>(
        "SELECT email, github_url FROM site_profiles WHERE key = $1",
    )
    .bind(DEFAULT_KEY)
    .fetch_optional(pool)
    .await?;

    Ok(row.unwrap_or_else(|| SiteProfileRead {
        email: DEFAULT_EMAIL.into(),
        github_url: DEFAULT_GITHUB_URL.into(),
    }))
}

pub async fn update_site_profile(
    pool: &PgPool,
    payload: SiteProfileRead,
) -> Result<SiteProfileRead, AppError> {
    let email = normalize_email(&payload.email).map_err(|m| AppError::BadRequest(m.into()))?;
    let github_url =
        normalize_github_url(&payload.github_url).map_err(|m| AppError::BadRequest(m.into()))?;

    let saved = sqlx::query_as::<_, SiteProfileRead>(
        r#"
        INSERT INTO site_profiles (key, email, github_url)
        VALUES ($1, $2, $3)
        ON CONFLICT (key) DO UPDATE SET
            email      = EXCLUDED.email,
            github_url = EXCLUDED.github_url,
            updated_at = NOW()
        RETURNING email, github_url
        "#,
    )
    .bind(DEFAULT_KEY)
    .bind(&email)
    .bind(&github_url)
    .fetch_one(pool)
    .await?;
    Ok(saved)
}

fn normalize_email(value: &str) -> Result<String, &'static str> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("email is required");
    }
    if trimmed.len() < 3 || trimmed.len() > 255 {
        return Err("email length must be between 3 and 255");
    }
    if trimmed.chars().any(char::is_whitespace) {
        return Err("email must not contain whitespace");
    }
    let Some(at_idx) = trimmed.find('@') else {
        return Err("email must be a valid address");
    };
    let local = &trimmed[..at_idx];
    let domain = &trimmed[at_idx + 1..];
    if local.is_empty() || domain.is_empty() || !domain.contains('.') {
        return Err("email must be a valid address");
    }
    Ok(trimmed.to_string())
}

fn normalize_github_url(value: &str) -> Result<String, &'static str> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("github_url is required");
    }
    if trimmed.len() < 8 || trimmed.len() > 500 {
        return Err("github_url length must be between 8 and 500");
    }
    let lower = trimmed.to_ascii_lowercase();
    let after_scheme = if let Some(rest) = lower.strip_prefix("https://") {
        Some(rest)
    } else {
        lower.strip_prefix("http://")
    };
    let Some(after_scheme) = after_scheme else {
        return Err("github_url must be an absolute http or https URL");
    };
    let netloc = after_scheme.split('/').next().unwrap_or("");
    if netloc.is_empty() {
        return Err("github_url must be an absolute http or https URL");
    }
    Ok(trimmed.to_string())
}
