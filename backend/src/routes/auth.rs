use axum::{
    Json, Router,
    extract::{Path, State},
    http::HeaderMap,
    routing::{delete, get, post, put},
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
        .route("/sessions", get(sessions))
        .route("/sessions/{id}", delete(revoke_session))
        .route("/sessions/revoke-all", post(revoke_all_sessions))
        .route("/password", put(change_password))
        .route("/mfa/setup", post(mfa_setup))
        .route("/mfa/enable", post(mfa_enable))
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
    #[serde(default)]
    pub remember_me: bool,
    pub totp_code: Option<String>,
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
    headers: HeaderMap,
    Json(body): Json<LoginBody>,
) -> AppResult<Json<auth_svc::TokenPair>> {
    let user_agent = headers.get(axum::http::header::USER_AGENT).and_then(|value| value.to_str().ok());
    let tokens = auth_svc::login(
        &state.db,
        &state.config,
        &body.email,
        &body.password,
        body.totp_code.as_deref(),
        body.remember_me,
        user_agent,
    )
    .await?;
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

async fn sessions(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<Vec<auth_svc::UserSession>>> {
    Ok(Json(auth_svc::list_sessions(&state.db, &user).await?))
}

async fn revoke_session(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<uuid::Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    auth_svc::revoke_session(&state.db, &user, id).await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn revoke_all_sessions(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    auth_svc::revoke_all_sessions(&state.db, &user).await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

#[derive(Debug, Deserialize)]
struct ChangePasswordBody {
    current_password: String,
    new_password: String,
}

async fn change_password(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<ChangePasswordBody>,
) -> AppResult<Json<serde_json::Value>> {
    auth_svc::change_password(
        &state.db,
        &user,
        &body.current_password,
        &body.new_password,
    )
    .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn mfa_setup(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<auth_svc::MfaSetupInfo>> {
    Ok(Json(auth_svc::setup_mfa(&state.db, &state.config, &user).await?))
}

#[derive(Debug, Deserialize)]
struct MfaCodeBody {
    code: String,
}

async fn mfa_enable(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<MfaCodeBody>,
) -> AppResult<Json<auth_svc::MfaEnableResult>> {
    Ok(Json(
        auth_svc::enable_mfa(&state.db, &state.config, &user, &body.code).await?,
    ))
}
