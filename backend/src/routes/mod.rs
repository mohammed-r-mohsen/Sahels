mod analytics;
mod appointments;
mod auth;
mod billing;
mod clinics;
mod health;
mod messaging;
mod patients;

use axum::{Router, routing::get};

use crate::state::AppState;

pub fn api_router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health::health))
        .nest("/auth", auth::router())
        .nest("/clinic", clinics::router())
        .nest("/appointments", appointments::router())
        .nest("/patients", patients::router())
        .nest("/billing", billing::router())
        .nest("/webhooks", messaging::router())
        .nest("/analytics", analytics::router())
        .with_state(state)
}
