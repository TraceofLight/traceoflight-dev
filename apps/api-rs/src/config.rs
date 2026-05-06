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
    pub minio: MinioSettings,
    pub admin: AdminSettings,
    pub redis_url: Option<String>,
    pub indexnow: IndexNowSettings,
    pub series_projection_debounce_seconds: f32,
}

#[derive(Debug, Clone)]
pub struct IndexNowSettings {
    pub key: String,
    pub host: String,
    pub endpoint: String,
}

impl IndexNowSettings {
    pub fn is_configured(&self) -> bool {
        !self.key.trim().is_empty() && !self.host.trim().is_empty()
    }
}

#[derive(Debug, Clone)]
pub struct AdminSettings {
    pub login_id: String,
    pub login_password: String,
    pub login_password_hash: String,
    pub session_secret: String,
    pub access_max_age_seconds: i64,
    pub refresh_max_age_seconds: i64,
}

#[derive(Debug, Clone)]
pub struct MinioSettings {
    pub endpoint: String,
    pub access_key: String,
    pub secret_key: String,
    pub bucket: String,
    pub secure: bool,
    pub presigned_expire_seconds: u64,
    pub region: String,
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

        let minio = MinioSettings {
            endpoint: env::var("MINIO_ENDPOINT").unwrap_or_default(),
            access_key: env::var("MINIO_ACCESS_KEY").unwrap_or_default(),
            secret_key: env::var("MINIO_SECRET_KEY").unwrap_or_default(),
            bucket: env::var("MINIO_BUCKET").unwrap_or_default(),
            secure: matches!(
                env::var("MINIO_SECURE").unwrap_or_default().to_lowercase().as_str(),
                "true" | "1" | "yes"
            ),
            presigned_expire_seconds: env::var("MINIO_PRESIGNED_EXPIRE_SECONDS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(900),
            region: env::var("MINIO_REGION").unwrap_or_else(|_| "us-east-1".into()),
        };

        let admin = AdminSettings {
            login_id: env::var("ADMIN_LOGIN_ID").unwrap_or_default(),
            login_password: env::var("ADMIN_LOGIN_PASSWORD").unwrap_or_default(),
            login_password_hash: env::var("ADMIN_LOGIN_PASSWORD_HASH").unwrap_or_default(),
            session_secret: env::var("ADMIN_SESSION_SECRET").unwrap_or_default(),
            access_max_age_seconds: env::var("ADMIN_ACCESS_TOKEN_MAX_AGE_SECONDS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(900)
                .max(60),
            refresh_max_age_seconds: env::var("ADMIN_REFRESH_TOKEN_MAX_AGE_SECONDS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(1_209_600)
                .max(60),
        };

        let redis_url = env::var("REDIS_URL")
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        let indexnow = IndexNowSettings {
            key: env::var("INDEXNOW_KEY").unwrap_or_default(),
            host: env::var("INDEXNOW_HOST").unwrap_or_default(),
            endpoint: env::var("INDEXNOW_ENDPOINT")
                .unwrap_or_else(|_| "https://api.indexnow.org/indexnow".into()),
        };

        let series_projection_debounce_seconds: f32 =
            env::var("SERIES_PROJECTION_REBUILD_DEBOUNCE_SECONDS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(0.5_f32)
                .max(0.1_f32);

        Ok(Settings {
            api_rs_port,
            api_prefix,
            database_url,
            database_max_connections,
            log_format,
            cors_allow_origins,
            internal_api_secret,
            reading_words_per_minute,
            minio,
            admin,
            redis_url,
            indexnow,
            series_projection_debounce_seconds,
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
