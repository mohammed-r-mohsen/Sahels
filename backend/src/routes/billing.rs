use axum::{
    Json, Router,
    extract::{Query, State},
    routing::{get, post},
};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    error::AppResult,
    middleware::AuthUser,
    services::{billing, billing_gateway},
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/plans", get(plans))
        .route("/subscription", get(subscription))
        .route("/subscribe", post(subscribe))
        .route("/invoices", get(invoices))
        .route("/verify/{payment_id}", post(verify_payment))
        .route("/callback", get(moyasar_callback).post(moyasar_callback))
}

async fn plans(State(state): State<AppState>) -> AppResult<Json<Vec<billing::PlanDto>>> {
    Ok(Json(billing::list_plans(&state.db).await?))
}

async fn subscription(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<billing::SubscriptionInfo>> {
    Ok(Json(
        billing::my_subscription(&state.db, &user).await?,
    ))
}

#[derive(Debug, Deserialize)]
pub struct SubscribeBody {
    pub plan_id: String,
}

async fn subscribe(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<SubscribeBody>,
) -> AppResult<Json<billing_gateway::CheckoutSession>> {
    let checkout = billing_gateway::create_subscription_payment(
        &state.db,
        &reqwest::Client::new(),
        &state.config,
        &user,
        &body.plan_id,
    )
    .await?;
    Ok(Json(checkout))
}

async fn invoices(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<Vec<billing_gateway::InvoiceDto>>> {
    Ok(Json(billing_gateway::list_invoices(&state.db, &user).await?))
}

async fn verify_payment(
    State(state): State<AppState>,
    user: AuthUser,
    axum::extract::Path(payment_id): axum::extract::Path<Uuid>,
) -> AppResult<Json<billing_gateway::PaymentVerification>> {
    Ok(Json(
        billing_gateway::verify_payment(
            &state.db,
            &reqwest::Client::new(),
            &state.config,
            &user,
            payment_id,
        )
        .await?,
    ))
}

#[derive(Debug, Deserialize)]
struct CallbackQuery {
    payment_id: Uuid,
}

async fn moyasar_callback(
    State(state): State<AppState>,
    Query(query): Query<CallbackQuery>,
) -> AppResult<Json<billing_gateway::PaymentVerification>> {
    Ok(Json(
        billing_gateway::handle_moyasar_callback(
            &state.db,
            &reqwest::Client::new(),
            &state.config,
            query.payment_id,
        )
        .await?,
    ))
}
