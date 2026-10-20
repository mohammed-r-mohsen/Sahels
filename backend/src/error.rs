use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("unauthorized")]
    Unauthorized,
    #[error("forbidden")]
    Forbidden,
    #[error("not found: {0}")]
    NotFound(String),
    #[error("conflict: {0}")]
    Conflict(String),
    #[error("bad request: {0}")]
    BadRequest(String),
    #[error("subscription inactive")]
    SubscriptionInactive,
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
    #[error(transparent)]
    Jwt(#[from] jsonwebtoken::errors::Error),
    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, message) = match &self {
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized", self.to_string()),
            AppError::Forbidden => (StatusCode::FORBIDDEN, "forbidden", self.to_string()),
            AppError::NotFound(m) => (StatusCode::NOT_FOUND, "not_found", m.clone()),
            AppError::Conflict(m) => (StatusCode::CONFLICT, "conflict", m.clone()),
            AppError::BadRequest(m) => (StatusCode::BAD_REQUEST, "bad_request", m.clone()),
            AppError::SubscriptionInactive => (
                StatusCode::PAYMENT_REQUIRED,
                "subscription_inactive",
                "اشتراك العيادة غير نشط".into(),
            ),
            AppError::Sqlx(e) => {
                tracing::error!(error = %e, "database error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "db_error",
                    "خطأ في قاعدة البيانات".into(),
                )
            }
            AppError::Jwt(_) => (StatusCode::UNAUTHORIZED, "invalid_token", "رمز غير صالح".into()),
            AppError::Other(e) => {
                tracing::error!(error = %e, "internal error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal",
                    "خطأ داخلي".into(),
                )
            }
        };

        (status, Json(json!({ "error": code, "message": message }))).into_response()
    }
}

pub type AppResult<T> = Result<T, AppError>;
