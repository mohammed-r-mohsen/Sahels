use anyhow::{Context, ensure};
use std::env;

#[derive(Clone)]
pub struct Config {
    pub database_url: String,
    pub database_migration_url: String,
    pub sahel_app_password: String,
    pub postgres_exporter_password: String,
    pub redis_url: String,
    pub jwt_secret: String,
    pub jwt_access_secs: i64,
    pub jwt_refresh_secs: i64,
    pub bind_addr: String,
    pub meta_app_secret: Option<String>,
    pub integration_encryption_key: Option<String>,
    pub ollama_base_url: String,
    pub moyasar_secret_key: Option<String>,
    pub billing_callback_url: Option<String>,
    pub billing_success_url: Option<String>,
    pub cors_origins: Vec<String>,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let jwt_secret = env::var("JWT_SECRET").context("JWT_SECRET must be set")?;
        ensure!(
            jwt_secret.as_bytes().len() >= 32,
            "JWT_SECRET must contain at least 32 bytes"
        );
        ensure!(
            !jwt_secret.to_ascii_lowercase().contains("change_me")
                && !jwt_secret.to_ascii_lowercase().contains("dev-change-me"),
            "JWT_SECRET must be replaced with a randomly generated secret"
        );
        let jwt_access_secs = positive_integer("JWT_ACCESS_SECS", 900)?;
        let jwt_refresh_secs = positive_integer("JWT_REFRESH_SECS", 60 * 60 * 24 * 14)?;
        let sahel_app_password = required_hex_secret("SAHEL_APP_PASSWORD")?;
        let postgres_exporter_password = required_hex_secret("POSTGRES_EXPORTER_PASSWORD")?;
        let database_url = env::var("DATABASE_URL")
            .context("DATABASE_URL must use the restricted sahel_app role")?;
        let database_migration_url = env::var("DATABASE_MIGRATION_URL")
            .context("DATABASE_MIGRATION_URL must use a privileged migration role")?;
        let runtime_database = reqwest::Url::parse(&database_url)
            .context("DATABASE_URL must be a valid PostgreSQL URL")?;
        ensure!(
            runtime_database.username() == "sahel_app"
                && runtime_database.password() == Some(sahel_app_password.as_str()),
            "DATABASE_URL must authenticate as sahel_app using SAHEL_APP_PASSWORD"
        );
        let migration_database = reqwest::Url::parse(&database_migration_url)
            .context("DATABASE_MIGRATION_URL must be a valid PostgreSQL URL")?;
        let migration_password = migration_database.password().unwrap_or_default();
        ensure!(
            migration_database.username() == "sahels"
                && is_hex_secret(migration_password)
                && migration_password.len() >= 64,
            "DATABASE_MIGRATION_URL must use sahels and a unique 64-character hex password"
        );
        let redis_url = env::var("REDIS_URL").context("REDIS_URL must be set")?;
        let redis = reqwest::Url::parse(&redis_url).context("REDIS_URL must be valid")?;
        let redis_password = redis.password().unwrap_or_default();
        ensure!(
            is_hex_secret(redis_password) && redis_password.len() >= 64,
            "REDIS_URL must contain a unique 64-character hex password"
        );
        let integration_encryption_key = env::var("INTEGRATION_ENCRYPTION_KEY")
            .ok()
            .filter(|key| !key.trim().is_empty());
        if let Some(key) = &integration_encryption_key {
            ensure!(
                key.as_bytes().len() >= 32
                    && !key.to_ascii_lowercase().contains("change_me"),
                "INTEGRATION_ENCRYPTION_KEY must be a random value of at least 32 bytes"
            );
        }
        let ollama_base_url = env::var("OLLAMA_BASE_URL")
            .unwrap_or_else(|_| "http://ollama:11434".into())
            .trim_end_matches('/')
            .to_string();
        let parsed_ollama_url = reqwest::Url::parse(&ollama_base_url)
            .context("OLLAMA_BASE_URL must be a valid HTTP(S) URL")?;
        ensure!(
            matches!(parsed_ollama_url.scheme(), "http" | "https")
                && parsed_ollama_url.host_str().is_some(),
            "OLLAMA_BASE_URL must be a valid HTTP(S) URL"
        );

        Ok(Self {
            database_url,
            database_migration_url,
            sahel_app_password,
            postgres_exporter_password,
            redis_url,
            jwt_secret,
            jwt_access_secs,
            jwt_refresh_secs,
            bind_addr: env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".into()),
            meta_app_secret: env::var("META_APP_SECRET").ok(),
            integration_encryption_key,
            ollama_base_url,
            moyasar_secret_key: env::var("MOYASAR_SECRET_KEY")
                .ok()
                .filter(|value| !value.trim().is_empty()),
            billing_callback_url: env::var("BILLING_CALLBACK_URL")
                .ok()
                .filter(|value| !value.trim().is_empty()),
            billing_success_url: env::var("BILLING_SUCCESS_URL")
                .ok()
                .filter(|value| !value.trim().is_empty()),
            cors_origins: env::var("CORS_ORIGINS")
                .unwrap_or_else(|_| "http://localhost:3000".into())
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect(),
        })
    }
}

fn required_hex_secret(name: &str) -> anyhow::Result<String> {
    let value = env::var(name).with_context(|| format!("{name} must be set"))?;
    ensure!(
        is_hex_secret(&value) && value.len() >= 64,
        "{name} must contain at least 64 hexadecimal characters"
    );
    Ok(value)
}

fn is_hex_secret(value: &str) -> bool {
    value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn positive_integer(name: &str, default: i64) -> anyhow::Result<i64> {
    let value = match env::var(name) {
        Ok(value) => value
            .parse::<i64>()
            .with_context(|| format!("{name} must be a positive integer"))?,
        Err(env::VarError::NotPresent) => default,
        Err(error) => return Err(error.into()),
    };
    ensure!(value > 0, "{name} must be a positive integer");
    Ok(value)
}
