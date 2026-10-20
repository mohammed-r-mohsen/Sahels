use anyhow::{Context, ensure};
use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub redis_url: String,
    pub jwt_secret: String,
    pub jwt_access_secs: i64,
    pub jwt_refresh_secs: i64,
    pub bind_addr: String,
    pub meta_app_secret: Option<String>,
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

        Ok(Self {
            database_url: env::var("DATABASE_URL")
                .unwrap_or_else(|_| "postgres://sahels:sahels@localhost:5432/sahels".into()),
            redis_url: env::var("REDIS_URL")
                .unwrap_or_else(|_| "redis://127.0.0.1:6379".into()),
            jwt_secret,
            jwt_access_secs,
            jwt_refresh_secs,
            bind_addr: env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".into()),
            meta_app_secret: env::var("META_APP_SECRET").ok(),
            cors_origins: env::var("CORS_ORIGINS")
                .unwrap_or_else(|_| "http://localhost:3000".into())
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect(),
        })
    }
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
