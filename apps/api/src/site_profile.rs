//! Footer profile (email + GitHub URL) shown across the public site. A single
//! row keyed by `default`; missing rows fall back to compile-time defaults.

use chrono::Utc;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, DatabaseConnection, DbErr, EntityTrait};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::entities::site_profile;
use crate::error::AppError;

const DEFAULT_KEY: &str = "default";
const DEFAULT_EMAIL: &str = "rickyjun96@gmail.com";
const DEFAULT_GITHUB_URL: &str = "https://github.com/TraceofLight";

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct SiteProfileRead {
    pub email: String,
    pub github_url: String,
}

pub async fn get_site_profile(pool: &DatabaseConnection) -> Result<SiteProfileRead, DbErr> {
    let row = site_profile::Entity::find_by_id(DEFAULT_KEY.to_owned())
        .one(pool)
        .await?;

    Ok(row
        .map(site_profile_read)
        .unwrap_or_else(|| SiteProfileRead {
            email: DEFAULT_EMAIL.into(),
            github_url: DEFAULT_GITHUB_URL.into(),
        }))
}

pub async fn update_site_profile(
    pool: &DatabaseConnection,
    payload: SiteProfileRead,
) -> Result<SiteProfileRead, AppError> {
    let email = normalize_email(&payload.email).map_err(|m| AppError::BadRequest(m.into()))?;
    let github_url =
        normalize_github_url(&payload.github_url).map_err(|m| AppError::BadRequest(m.into()))?;

    let existing = site_profile::Entity::find_by_id(DEFAULT_KEY.to_owned())
        .one(pool)
        .await?;

    let saved = if let Some(existing) = existing {
        let mut active: site_profile::ActiveModel = existing.into();
        active.email = Set(email);
        active.github_url = Set(github_url);
        active.updated_at = Set(Utc::now());
        active.update(pool).await?
    } else {
        site_profile::ActiveModel {
            key: Set(DEFAULT_KEY.to_owned()),
            email: Set(email),
            github_url: Set(github_url),
            ..Default::default()
        }
        .insert(pool)
        .await?
    };

    Ok(site_profile_read(saved))
}

fn site_profile_read(model: site_profile::Model) -> SiteProfileRead {
    SiteProfileRead {
        email: model.email,
        github_url: model.github_url,
    }
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
