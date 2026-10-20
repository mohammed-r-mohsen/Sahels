use axum::{
    Json, Router,
    extract::State,
    routing::{get, post},
};
use serde::Deserialize;
use validator::Validate;

use crate::{
    error::{AppError, AppResult},
    middleware::AuthUser,
    services::auth as auth_svc,
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/register", post(register))
        .route("/login", post(login))
        .route("/refresh", post(refresh))
        .route("/logout", post(logout))
        .route("/me", get(me))
}

#[derive(Debug, Deserialize, Validate)]
pub struct RegisterBody {
    #[validate(length(min = 2))]
    pub clinic_name: String,
    #[validate(length(min = 3, max = 63))]
    pub slug: String,
    #[validate(length(min = 5))]
    pub email: String,
    #[validate(length(min = 12, max = 128))]
    pub password: String,
    #[validate(length(min = 2, max = 120))]
    pub full_name: String,
    #[validate(length(max = 32))]
    pub phone: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LoginBody {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct RefreshBody {
    pub refresh_token: String,
}

async fn register(
    State(state): State<AppState>,
    Json(body): Json<RegisterBody>,
) -> AppResult<Json<auth_svc::TokenPair>> {
    body.validate()
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

    let tokens = auth_svc::register_clinic_admin(
        &state.db,
        &state.config,
        &body.clinic_name,
        &body.slug,
        &body.email,
        &body.password,
        &body.full_name,
        body.phone.as_deref(),
    )
    .await?;
    Ok(Json(tokens))
}

async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginBody>,
) -> AppResult<Json<auth_svc::TokenPair>> {
    let tokens = auth_svc::login(&state.db, &state.config, &body.email, &body.password).await?;
    Ok(Json(tokens))
}

async fn refresh(
    State(state): State<AppState>,
    Json(body): Json<RefreshBody>,
) -> AppResult<Json<auth_svc::TokenPair>> {
    let tokens = auth_svc::refresh(&state.db, &state.config, &body.refresh_token).await?;
    Ok(Json(tokens))
}

async fn logout(
    State(state): State<AppState>,
    Json(body): Json<RefreshBody>,
) -> AppResult<Json<serde_json::Value>> {
    auth_svc::logout(&state.db, &state.config, &body.refresh_token).await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn me(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<auth_svc::CurrentSession>> {
    Ok(Json(auth_svc::current_session(&state.db, &user).await?))
}
