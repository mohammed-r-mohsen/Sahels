mod auth;
mod config;
mod db;
mod error;
mod middleware;
mod models;
mod routes;
mod services;
mod state;

use std::sync::Arc;

use axum::http::{HeaderValue, Method};
use sqlx::postgres::PgPoolOptions;
use tower_http::{
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};
use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

use crate::{config::Config, routes::api_router, state::AppState};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| {
            "sahel_api=info,tower_http=info,sqlx=warn".into()
        }))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::from_env()?;
    tracing::info!("connecting to postgres…");

    let db = PgPoolOptions::new()
        .max_connections(20)
        .connect(&config.database_url)
        .await?;

    sqlx::migrate!("./migrations").run(&db).await?;
    tracing::info!("migrations applied");

    let redis_client = redis::Client::open(config.redis_url.as_str())?;
    let redis = redis_client.get_connection_manager().await?;
    tracing::info!("redis connected");

    let state = AppState {
        db,
        redis,
        config: Arc::new(config.clone()),
    };

    let reminder_pool = state.db.clone();
    let reminder_client = reqwest::Client::new();
    let reminder_encryption_key = config.integration_encryption_key.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            interval.tick().await;
            if let Err(error) = services::messaging::run_reminder_cycle(
                &reminder_pool,
                &reminder_client,
                reminder_encryption_key.as_deref(),
            )
            .await
            {
                tracing::error!(error = %error, "appointment reminder worker failed");
            }
        }
    });

    let cors = if config.cors_origins.iter().any(|o| o == "*") {
        CorsLayer::new()
            .allow_origin(Any)
            .allow_methods([
                Method::GET,
                Method::POST,
                Method::PUT,
                Method::PATCH,
                Method::DELETE,
                Method::OPTIONS,
            ])
            .allow_headers(Any)
    } else {
        let origins: Vec<HeaderValue> = config
            .cors_origins
            .iter()
            .filter_map(|o| o.parse().ok())
            .collect();
        CorsLayer::new()
            .allow_origin(origins)
            .allow_methods([
                Method::GET,
                Method::POST,
                Method::PUT,
                Method::PATCH,
                Method::DELETE,
                Method::OPTIONS,
            ])
            .allow_headers(Any)
    };

    let app = api_router(state)
        .layer(TraceLayer::new_for_http())
        .layer(cors);

    let listener = tokio::net::TcpListener::bind(&config.bind_addr).await?;
    tracing::info!("Sahel API listening on {}", config.bind_addr);
    axum::serve(listener, app).await?;
    Ok(())
}
