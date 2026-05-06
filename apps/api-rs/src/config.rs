use std::env;

#[derive(Debug, Clone)]
pub struct Settings {
    pub api_rs_port: u16,
    pub api_prefix: String,
    pub database_url: String,
    pub database_max_connections: u32,
    pub log_format: LogFormat,
    pub cors_allow_origins: Vec<String>,
    pub internal_api_secret: String,
    pub reading_words_per_minute: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogFormat {
    Pretty,
    Json,
}

impl Settings {
    pub fn from_env() -> anyhow::Result<Self> {
        let api_rs_port: u16 = env::var("API_RS_PORT")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(6655);

        let api_prefix =
            env::var("API_PREFIX").unwrap_or_else(|_| "/api/v1/web-service".into());

        let database_url = build_database_url()?;

        let database_max_connections: u32 = env::var("DATABASE_MAX_CONNECTIONS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(10);

        let log_format = match env::var("LOG_FORMAT").as_deref() {
            Ok("json") => LogFormat::Json,
            _ => LogFormat::Pretty,
        };

        let cors_allow_origins = env::var("CORS_ALLOW_ORIGINS")
            .unwrap_or_default()
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        let internal_api_secret = env::var("INTERNAL_API_SECRET").unwrap_or_default();

        let reading_words_per_minute: u32 = env::var("READING_WORDS_PER_MINUTE")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(200)
            .max(1);

        Ok(Settings {
            api_rs_port,
            api_prefix,
            database_url,
            database_max_connections,
            log_format,
            cors_allow_origins,
            internal_api_secret,
            reading_words_per_minute,
        })
    }
}

fn build_database_url() -> anyhow::Result<String> {
    if let Ok(url) = env::var("DATABASE_URL") {
        return Ok(url);
    }
    let user = env::var("POSTGRES_USER")
        .map_err(|_| anyhow::anyhow!("DATABASE_URL or POSTGRES_USER must be set"))?;
    let password = env::var("POSTGRES_PASSWORD")
        .map_err(|_| anyhow::anyhow!("POSTGRES_PASSWORD must be set"))?;
    let db = env::var("POSTGRES_DB")
        .map_err(|_| anyhow::anyhow!("POSTGRES_DB must be set"))?;
    let host = env::var("POSTGRES_HOST").unwrap_or_else(|_| "localhost".into());
    let port = env::var("POSTGRES_PORT").unwrap_or_else(|_| "5432".into());
    Ok(format!("postgres://{user}:{password}@{host}:{port}/{db}"))
}
