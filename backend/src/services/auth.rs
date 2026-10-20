use chrono::{Duration, Utc};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    auth::{hash_password, issue_access, issue_refresh, verify_password},
    config::Config,
    error::{AppError, AppResult},
    models::{UserPublic, UserRow},
};

#[derive(Debug, serde::Serialize)]
pub struct TokenPair {
    pub access_token: String,
    pub refresh_token: String,
    pub token_type: &'static str,
    pub expires_in: i64,
    pub user: UserPublic,
}

fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

pub async fn register_clinic_admin(
    pool: &PgPool,
    cfg: &Config,
    clinic_name: &str,
    slug: &str,
    email: &str,
    password: &str,
    full_name: &str,
    phone: Option<&str>,
) -> AppResult<TokenPair> {
    let clinic_name = clinic_name.trim();
    let slug = slug.trim();
    let email = normalize_email(email)?;
    let full_name = full_name.trim();

    if password.chars().count() < 12 || password.len() > 1024 {
        return Err(AppError::BadRequest(
            "كلمة المرور يجب أن تكون 12 حرفاً على الأقل".into(),
        ));
    }
    if clinic_name.is_empty() || clinic_name.chars().count() > 160 {
        return Err(AppError::BadRequest("اسم العيادة غير صالح".into()));
    }
    if full_name.is_empty() || full_name.chars().count() > 120 {
        return Err(AppError::BadRequest("اسم المستخدم غير صالح".into()));
    }
    if !valid_slug(slug) {
        return Err(AppError::BadRequest(
            "معرّف العيادة يجب أن يتكون من أحرف إنجليزية صغيرة وأرقام وشرطات".into(),
        ));
    }
    let phone = phone.map(str::trim).filter(|value| !value.is_empty());
    if phone.is_some_and(|value| value.chars().count() > 32) {
        return Err(AppError::BadRequest("رقم الهاتف غير صالح".into()));
    }

    let mut tx = crate::db::begin_bypass(pool).await?;

    let clinic_id: Uuid = sqlx::query_scalar(
        r#"
        INSERT INTO clinics (name, slug, subscription_status, subscription_ends_at)
        VALUES ($1, $2, 'trial', NOW() + INTERVAL '14 days')
        RETURNING id
        "#,
    )
    .bind(clinic_name)
    .bind(slug)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| match e {
        sqlx::Error::Database(db) if db.constraint() == Some("clinics_slug_key") => {
            AppError::Conflict("معرّف العيادة مستخدم مسبقاً".into())
        }
        other => AppError::from(other),
    })?;

    let password_hash = hash_password(password)?;
    let user = sqlx::query_as::<_, UserRow>(
        r#"
        INSERT INTO users (clinic_id, email, password_hash, full_name, phone, role)
        VALUES ($1, $2, $3, $4, $5, 'clinic_admin')
        RETURNING id, clinic_id, email, password_hash, full_name, phone, role::text as role,
                  is_active, created_at
        "#,
    )
    .bind(clinic_id)
    .bind(&email)
    .bind(&password_hash)
    .bind(full_name)
    .bind(phone)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| match e {
    sqlx::Error::Database(db)
        if matches!(
            db.constraint(),
            Some("users_email_key" | "users_email_case_insensitive_uidx")
        ) =>
    {
        AppError::Conflict("البريد الإلكتروني مستخدم مسبقاً".into())
    }
        other => AppError::from(other),
    })?;

    tx.commit().await?;
    issue_tokens(pool, cfg, &user).await
}

pub async fn login(pool: &PgPool, cfg: &Config, email: &str, password: &str) -> AppResult<TokenPair> {
    let email = normalize_email(email)?;
    if password.is_empty() || password.len() > 1024 {
        return Err(AppError::Unauthorized);
    }
    let mut tx = crate::db::begin_bypass(pool).await?;

    let user = sqlx::query_as::<_, UserRow>(
        r#"
        SELECT id, clinic_id, email, password_hash, full_name, phone, role::text as role,
               is_active, created_at
        FROM users WHERE lower(email) = $1
        "#,
    )
    .bind(&email)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(AppError::Unauthorized)?;

    if !user.is_active {
        return Err(AppError::Unauthorized);
    }

    if !verify_password(password, &user.password_hash)? {
        return Err(AppError::Unauthorized);
    }

    // Subscription guard (skip for super_admin)
    if user.role != "super_admin" {
        if let Some(clinic_id) = user.clinic_id {
            let status: Option<String> = sqlx::query_scalar(
                "SELECT subscription_status FROM clinics WHERE id = $1",
            )
            .bind(clinic_id)
            .fetch_optional(&mut *tx)
            .await?;

            match status.as_deref() {
                Some("active") | Some("trial") | Some("past_due") => {}
                _ => return Err(AppError::SubscriptionInactive),
            }
        }
    }

    sqlx::query("UPDATE users SET last_login_at = NOW() WHERE id = $1")
        .bind(user.id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    issue_tokens(pool, cfg, &user).await
}

pub async fn refresh(pool: &PgPool, cfg: &Config, refresh_token: &str) -> AppResult<TokenPair> {
    let claims = crate::auth::decode_token(&cfg.jwt_secret, refresh_token)?;
    if claims.typ != "refresh" || claims.sub.is_nil() {
        return Err(AppError::Unauthorized);
    }

    let mut tx = crate::db::begin_tenant(
        pool,
        claims.clinic_id,
        claims.role == "super_admin",
    )
    .await?;
    sqlx::query("SELECT set_config('app.user_id', $1, true)")
        .bind(claims.sub.to_string())
        .execute(&mut *tx)
        .await?;
    let token_hash = hash_token(refresh_token);
    let row: Option<(Uuid,)> = sqlx::query_as(
        r#"
        SELECT user_id FROM refresh_tokens
        WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()
        FOR UPDATE
        "#,
    )
    .bind(&token_hash)
    .fetch_optional(&mut *tx)
    .await?;

    if row.as_ref().map(|(user_id,)| *user_id) != Some(claims.sub) {
        return Err(AppError::Unauthorized);
    }

    sqlx::query("UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND user_id = $2")
        .bind(&token_hash)
        .bind(claims.sub)
        .execute(&mut *tx)
        .await?;

    let user = sqlx::query_as::<_, UserRow>(
        r#"
        SELECT id, clinic_id, email, password_hash, full_name, phone, role::text as role,
               is_active, created_at
        FROM users WHERE id = $1 AND is_active = TRUE
        "#,
    )
    .bind(claims.sub)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(AppError::Unauthorized)?;

    tx.commit().await?;
    issue_tokens(pool, cfg, &user).await
}

async fn issue_tokens(pool: &PgPool, cfg: &Config, user: &UserRow) -> AppResult<TokenPair> {
    let access = issue_access(
        &cfg.jwt_secret,
        user.id,
        user.clinic_id,
        &user.role,
        &user.email,
        cfg.jwt_access_secs,
    )?;
    let refresh = issue_refresh(
        &cfg.jwt_secret,
        user.id,
        user.clinic_id,
        &user.role,
        &user.email,
        cfg.jwt_refresh_secs,
    )?;

    let token_hash = hash_token(&refresh);
    let expires_at = Utc::now() + Duration::seconds(cfg.jwt_refresh_secs);

    let mut tx = crate::db::begin_tenant(pool, user.clinic_id, user.role == "super_admin").await?;
    sqlx::query("SELECT set_config('app.user_id', $1, true)")
        .bind(user.id.to_string())
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        r#"
        INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
        VALUES ($1, $2, $3)
        "#,
    )
    .bind(user.id)
    .bind(&token_hash)
    .bind(expires_at)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    Ok(TokenPair {
        access_token: access,
        refresh_token: refresh,
        token_type: "Bearer",
        expires_in: cfg.jwt_access_secs,
        user: UserPublic {
            id: user.id,
            clinic_id: user.clinic_id,
            email: user.email.clone(),
            full_name: user.full_name.clone(),
            phone: user.phone.clone(),
            role: user.role.clone(),
        },
    })
}

pub async fn logout(pool: &PgPool, cfg: &Config, refresh_token: &str) -> AppResult<()> {
    let claims = crate::auth::decode_token(&cfg.jwt_secret, refresh_token)?;
    if claims.typ != "refresh" {
        return Err(AppError::Unauthorized);
    }
    let mut tx = crate::db::begin_tenant(pool, claims.clinic_id, claims.role == "super_admin").await?;
    sqlx::query("SELECT set_config('app.user_id', $1, true)")
        .bind(claims.sub.to_string())
        .execute(&mut *tx)
        .await?;
    let token_hash = hash_token(refresh_token);
    sqlx::query("UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND user_id = $2 AND revoked_at IS NULL")
        .bind(token_hash)
        .bind(claims.sub)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}

#[derive(Debug, serde::Serialize)]
pub struct CurrentSession {
    pub user_id: Uuid,
    pub clinic_id: Option<Uuid>,
    pub clinic_name: Option<String>,
    pub email: String,
    pub full_name: String,
    pub role: String,
}

pub async fn current_session(
    pool: &PgPool,
    user: &crate::middleware::AuthUser,
) -> AppResult<CurrentSession> {
    let mut tx = crate::db::begin_tenant(pool, user.clinic_id, user.is_super()).await?;
    sqlx::query("SELECT set_config('app.user_id', $1, true)")
        .bind(user.user_id.to_string())
        .execute(&mut *tx)
        .await?;
    let row = sqlx::query_as::<_, (String, String, String, Option<String>, Option<Uuid>)>(
        r#"
        SELECT u.full_name, u.email, u.role::text, c.name, u.clinic_id
        FROM users u
        LEFT JOIN clinics c ON c.id = u.clinic_id
        WHERE u.id = $1 AND u.is_active = TRUE
          AND u.clinic_id IS NOT DISTINCT FROM $2
        "#,
    )
    .bind(user.user_id)
    .bind(user.clinic_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(AppError::Unauthorized)?;
    tx.commit().await?;

    Ok(CurrentSession {
        user_id: user.user_id,
        clinic_id: row.4,
        clinic_name: row.3,
        email: row.1,
        full_name: row.0,
        role: row.2,
    })
}

fn normalize_email(email: &str) -> AppResult<String> {
    let email = email.trim().to_ascii_lowercase();
    let Some((local, domain)) = email.split_once('@') else {
        return Err(AppError::BadRequest("البريد الإلكتروني غير صالح".into()));
    };
    if email.len() > 254
        || local.is_empty()
        || domain.is_empty()
        || !domain.contains('.')
        || domain.starts_with('.')
        || domain.ends_with('.')
        || email.matches('@').count() != 1
        || email.chars().any(char::is_whitespace)
    {
        return Err(AppError::BadRequest("البريد الإلكتروني غير صالح".into()));
    }
    Ok(email)
}

fn valid_slug(slug: &str) -> bool {
    let bytes = slug.as_bytes();
    if !(3..=63).contains(&bytes.len()) {
        return false;
    }
    let is_alphanumeric = |byte: u8| byte.is_ascii_lowercase() || byte.is_ascii_digit();
    is_alphanumeric(bytes[0])
        && is_alphanumeric(bytes[bytes.len() - 1])
        && bytes
            .iter()
            .all(|byte| is_alphanumeric(*byte) || *byte == b'-')
        && !slug.contains("--")
}

#[cfg(test)]
mod tests {
    use super::{normalize_email, valid_slug};

    #[test]
    fn email_is_normalized_before_authentication() {
        assert_eq!(
            normalize_email("  Owner@Clinic.SA ").unwrap(),
            "owner@clinic.sa"
        );
        assert!(normalize_email("owner@localhost").is_err());
    }

    #[test]
    fn clinic_slug_is_lowercase_and_url_safe() {
        assert!(valid_slug("clinic-1"));
        assert!(!valid_slug("ab"));
        assert!(!valid_slug("-clinic"));
        assert!(!valid_slug("Clinic"));
        assert!(!valid_slug("clinic--one"));
        assert!(!valid_slug("clinic_one"));
    }
}
