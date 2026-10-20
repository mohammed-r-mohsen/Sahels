use axum::{
    Json, Router,
    extract::State,
    routing::{get, post},
};
use serde::Deserialize;

use crate::{
    error::AppResult,
    middleware::AuthUser,
    services::billing,
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/plans", get(plans))
        .route("/subscription", get(subscription))
        .route("/subscribe", post(subscribe))
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
) -> AppResult<Json<serde_json::Value>> {
    let payment_id =
        billing::create_subscription_payment(&state.db, &user, &body.plan_id).await?;
    Ok(Json(serde_json::json!({
        "payment_id": payment_id,
        "provider": "moyasar",
        "status": "pending",
        "message": "أنشئ سجل الدفع — اربط Moyasar في الخطوة التالية"
    })))
}
