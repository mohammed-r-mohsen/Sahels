mod analytics;
mod appointments;
mod auth;
mod billing;
mod clinics;
mod health;
mod messaging;
mod patients;

use axum::{Router, middleware, routing::get};

use crate::state::AppState;

pub fn api_router(state: AppState) -> Router {
    let operational_routes = Router::new()
        .nest("/clinic", clinics::router())
        .nest("/appointments", appointments::router())
        .nest("/patients", patients::router())
        .nest("/analytics", analytics::router())
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            crate::middleware::auth::require_active_subscription,
        ));

    Router::new()
        .route("/health", get(health::health))
        .nest("/auth", auth::router())
        .nest("/billing", billing::router())
        .nest("/webhooks", messaging::router())
        .merge(operational_routes)
        .with_state(state)
}
