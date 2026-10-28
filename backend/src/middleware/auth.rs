use axum::{
    extract::{FromRequestParts, Request, State},
    http::request::Parts,
    middleware::Next,
    response::Response,
};
use axum_extra::{
    TypedHeader,
    headers::{Authorization, authorization::Bearer},
};

use crate::{
    auth::decode_token,
    error::{AppError, AppResult},
    state::AppState,
};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id: Uuid,
    pub clinic_id: Option<Uuid>,
    pub role: String,
    pub email: String,
}

impl AuthUser {
    pub fn is_super(&self) -> bool {
        self.role == "super_admin"
    }

    pub fn require_clinic(&self) -> AppResult<Uuid> {
        self.clinic_id
            .ok_or_else(|| AppError::Forbidden)
    }
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let TypedHeader(Authorization(bearer)) =
            TypedHeader::<Authorization<Bearer>>::from_request_parts(parts, state)
                .await
                .map_err(|_| AppError::Unauthorized)?;

        user_from_access_token(state, bearer.token()).await
    }
}

/// Optional guard used as middleware layer when needed.
pub async fn require_auth(
    State(state): State<AppState>,
    TypedHeader(Authorization(bearer)): TypedHeader<Authorization<Bearer>>,
    mut req: Request,
    next: Next,
) -> AppResult<Response> {
    req.extensions_mut()
        .insert(user_from_access_token(&state, bearer.token()).await?);
    Ok(next.run(req).await)
}

async fn user_from_access_token(state: &AppState, token: &str) -> AppResult<AuthUser> {
    let claims = decode_token(&state.config.jwt_secret, token)?;
    if claims.typ != "access" {
        return Err(AppError::Unauthorized);
    }
    let user = sqlx::query_as::<_, (Option<Uuid>, String, String, bool)>(
        "SELECT clinic_id, role::text, email, is_active FROM users WHERE id = $1",
    )
    .bind(claims.sub)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::Unauthorized)?;

    if !user.3 || user.0 != claims.clinic_id {
        return Err(AppError::Unauthorized);
    }
    Ok(AuthUser {
        user_id: claims.sub,
        clinic_id: user.0,
        role: user.1,
        email: user.2,
    })
}

pub fn require_roles(user: &AuthUser, allowed: &[&str]) -> AppResult<()> {
    if user.is_super() || allowed.iter().any(|r| *r == user.role) {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}

pub async fn require_active_subscription(
    State(state): State<AppState>,
    user: AuthUser,
    req: Request,
    next: Next,
) -> AppResult<Response> {
    if user.is_super() {
        return Ok(next.run(req).await);
    }
    let clinic_id = user.require_clinic()?;
    let mut tx = crate::db::begin_tenant(&state.db, Some(clinic_id), false).await?;
    let (status, ends_at): (String, Option<chrono::DateTime<chrono::Utc>>) = sqlx::query_as(
        "SELECT subscription_status, subscription_ends_at FROM clinics WHERE id = $1",
    )
    .bind(clinic_id)
    .fetch_one(&mut *tx)
    .await?;
    let expired = ends_at.is_some_and(|ends_at| ends_at <= chrono::Utc::now());
    let eligible = matches!(status.as_str(), "active" | "trial" | "past_due");
    if expired && eligible {
        sqlx::query("UPDATE clinics SET subscription_status = 'suspended' WHERE id = $1")
            .bind(clinic_id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    if !eligible || expired {
        return Err(AppError::SubscriptionInactive);
    }
    Ok(next.run(req).await)
}
