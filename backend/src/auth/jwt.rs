use chrono::{Duration, Utc};
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: Uuid,
    pub clinic_id: Option<Uuid>,
    pub role: String,
    pub email: String,
    pub exp: i64,
    pub iat: i64,
    pub typ: String, // "access" | "refresh"
}

pub fn issue_access(
    secret: &str,
    user_id: Uuid,
    clinic_id: Option<Uuid>,
    role: &str,
    email: &str,
    ttl_secs: i64,
) -> AppResult<String> {
    issue(secret, user_id, clinic_id, role, email, ttl_secs, "access")
}

pub fn issue_refresh(
    secret: &str,
    user_id: Uuid,
    clinic_id: Option<Uuid>,
    role: &str,
    email: &str,
    ttl_secs: i64,
) -> AppResult<String> {
    issue(secret, user_id, clinic_id, role, email, ttl_secs, "refresh")
}

fn issue(
    secret: &str,
    user_id: Uuid,
    clinic_id: Option<Uuid>,
    role: &str,
    email: &str,
    ttl_secs: i64,
    typ: &str,
) -> AppResult<String> {
    let now = Utc::now();
    let claims = Claims {
        sub: user_id,
        clinic_id,
        role: role.to_string(),
        email: email.to_string(),
        iat: now.timestamp(),
        exp: (now + Duration::seconds(ttl_secs)).timestamp(),
        typ: typ.to_string(),
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(AppError::from)
}

pub fn decode_token(secret: &str, token: &str) -> AppResult<Claims> {
    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )?;
    Ok(data.claims)
}
