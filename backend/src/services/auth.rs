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

    validate_password(password)?;
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
    issue_tokens(pool, cfg, &user, None, cfg.jwt_refresh_secs).await
}

pub async fn login(
    pool: &PgPool,
    cfg: &Config,
    email: &str,
    password: &str,
    totp_code: Option<&str>,
    remember_me: bool,
    user_agent: Option<&str>,
) -> AppResult<TokenPair> {
    let email = match normalize_email(email) {
        Ok(email) => email,
        Err(_) => {
            let mut tx = crate::db::begin_bypass(pool).await?;
            record_failed_login(&mut tx, None, None, &email.trim().to_ascii_lowercase()).await?;
            tx.commit().await?;
            return Err(AppError::Unauthorized);
        }
    };
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
    .await?;

    let Some(user) = user else {
        record_failed_login(&mut tx, None, None, &email).await?;
        tx.commit().await?;
        return Err(AppError::Unauthorized);
    };

    if !user.is_active {
        record_failed_login(&mut tx, Some(user.id), user.clinic_id, &email).await?;
        tx.commit().await?;
        return Err(AppError::Unauthorized);
    }

    if password.is_empty() || password.len() > 128 || !verify_password(password, &user.password_hash)? {
        record_failed_login(&mut tx, Some(user.id), user.clinic_id, &email).await?;
        tx.commit().await?;
        return Err(AppError::Unauthorized);
    }

    if matches!(user.role.as_str(), "clinic_admin" | "super_admin") {
        let mfa_enabled: bool = sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM user_mfa WHERE user_id = $1 AND enabled_at IS NOT NULL)",
        )
        .bind(user.id)
        .fetch_one(&mut *tx)
        .await?;
        if mfa_enabled {
            let Some(code) = totp_code.filter(|code| !code.trim().is_empty()) else {
                tx.commit().await?;
                return Err(AppError::MfaRequired);
            };
            if !verify_login_mfa(&mut tx, cfg, user.id, code).await? {
                record_failed_login(&mut tx, Some(user.id), user.clinic_id, &email).await?;
                tx.commit().await?;
                return Err(AppError::Unauthorized);
            }
        }
    }

    sqlx::query("UPDATE users SET last_login_at = NOW() WHERE id = $1")
        .bind(user.id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    let refresh_ttl = if remember_me {
        cfg.jwt_refresh_secs
    } else {
        cfg.jwt_refresh_secs.min(60 * 60 * 8)
    };
    issue_tokens(pool, cfg, &user, user_agent, refresh_ttl).await
}

async fn verify_login_mfa(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    cfg: &Config,
    user_id: Uuid,
    code: &str,
) -> AppResult<bool> {
    let encryption_key = cfg
        .integration_encryption_key
        .as_deref()
        .ok_or_else(|| AppError::Other(anyhow::anyhow!("MFA encryption key is not configured")))?;
    let secret: Option<String> = sqlx::query_scalar(
        r#"SELECT pgp_sym_decrypt(secret_encrypted, $2)::text
           FROM user_mfa WHERE user_id = $1 AND enabled_at IS NOT NULL"#,
    )
    .bind(user_id)
    .bind(encryption_key)
    .fetch_optional(&mut **tx)
    .await?;
    let Some(secret) = secret else { return Ok(false) };
    if crate::auth::mfa::verify_totp(&secret, code) {
        return Ok(true);
    }

    let normalized_code = code.trim().replace('-', "").to_ascii_lowercase();
    let recovery_codes: Vec<(Uuid, String)> = sqlx::query_as(
        "SELECT id, code_hash FROM mfa_recovery_codes WHERE user_id = $1 AND used_at IS NULL FOR UPDATE",
    )
    .bind(user_id)
    .fetch_all(&mut **tx)
    .await?;
    for (id, hash) in recovery_codes {
        if verify_password(&normalized_code, &hash)? {
            sqlx::query("UPDATE mfa_recovery_codes SET used_at = NOW() WHERE id = $1")
                .bind(id)
                .execute(&mut **tx)
                .await?;
            return Ok(true);
        }
    }
    Ok(false)
}

pub fn validate_password(password: &str) -> AppResult<()> {
    if password.chars().count() < 12 || password.len() > 128 {
        return Err(AppError::BadRequest("كلمة المرور يجب أن تكون بين 12 و128 حرفاً".into()));
    }
    let normalized = password.to_ascii_lowercase();
    const COMMON: &[&str] = &[
        "password", "password123", "qwerty123", "123456789012", "letmein12345",
        "welcome12345", "admin123456", "sahels2026",
    ];
    if COMMON.iter().any(|common| normalized == *common) {
        return Err(AppError::BadRequest("اختر كلمة مرور غير شائعة".into()));
    }
    let categories = [
        password
            .chars()
            .any(|character| character.is_lowercase() || (character.is_alphabetic() && !character.is_uppercase())),
        password.chars().any(char::is_uppercase),
        password.chars().any(char::is_numeric),
        password.chars().any(|character| !character.is_alphanumeric()),
    ]
    .into_iter()
    .filter(|present| *present)
    .count();
    if categories < 3 {
        return Err(AppError::BadRequest(
            "استخدم ثلاثة أنواع على الأقل من الأحرف الكبيرة والصغيرة والأرقام والرموز".into(),
        ));
    }
    Ok(())
}

async fn record_failed_login(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    user_id: Option<Uuid>,
    clinic_id: Option<Uuid>,
    email: &str,
) -> AppResult<()> {
    sqlx::query(
        "INSERT INTO auth_security_events (clinic_id, user_id, email_sha256, event) VALUES ($1, $2, $3, 'login_failed')",
    )
    .bind(clinic_id)
    .bind(user_id)
    .bind(hash_token(email))
    .execute(&mut **tx)
    .await?;
    Ok(())
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
    let row: Option<(Uuid, String, chrono::DateTime<Utc>, chrono::DateTime<Utc>)> = sqlx::query_as(
        r#"
        SELECT user_id, user_agent, expires_at, created_at FROM refresh_tokens
        WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()
        FOR UPDATE
        "#,
    )
    .bind(&token_hash)
    .fetch_optional(&mut *tx)
    .await?;

    if row.as_ref().map(|(user_id, _)| *user_id) != Some(claims.sub) {
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

    let (user_agent, refresh_ttl_secs) = row
        .map(|(_, user_agent, expires_at, created_at)| {
            (user_agent, (expires_at - created_at).num_seconds().max(1))
        })
        .ok_or(AppError::Unauthorized)?;
    tx.commit().await?;
    issue_tokens(pool, cfg, &user, Some(&user_agent), refresh_ttl_secs).await
}

async fn issue_tokens(
    pool: &PgPool,
    cfg: &Config,
    user: &UserRow,
    user_agent: Option<&str>,
    refresh_ttl_secs: i64,
) -> AppResult<TokenPair> {
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
        refresh_ttl_secs,
    )?;

    let token_hash = hash_token(&refresh);
    let expires_at = Utc::now() + Duration::seconds(refresh_ttl_secs);

    let mut tx = crate::db::begin_tenant(pool, user.clinic_id, user.role == "super_admin").await?;
    sqlx::query("SELECT set_config('app.user_id', $1, true)")
        .bind(user.id.to_string())
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        r#"
        INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent)
        VALUES ($1, $2, $3, $4)
        "#,
    )
    .bind(user.id)
    .bind(&token_hash)
    .bind(expires_at)
    .bind(user_agent.unwrap_or("Unknown device").chars().take(255).collect::<String>())
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

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct UserSession {
    pub id: Uuid,
    pub created_at: chrono::DateTime<Utc>,
    pub expires_at: chrono::DateTime<Utc>,
    pub user_agent: String,
}

pub async fn list_sessions(
    pool: &PgPool,
    user: &crate::middleware::AuthUser,
) -> AppResult<Vec<UserSession>> {
    let mut tx = crate::db::begin_tenant(pool, user.clinic_id, user.is_super()).await?;
    sqlx::query("SELECT set_config('app.user_id', $1, true)")
        .bind(user.user_id.to_string())
        .execute(&mut *tx)
        .await?;
    let rows = sqlx::query_as::<_, UserSession>(
        r#"SELECT id, created_at, expires_at, user_agent
           FROM refresh_tokens
           WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
           ORDER BY created_at DESC"#,
    )
    .bind(user.user_id)
    .fetch_all(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(rows)
}

pub async fn revoke_session(
    pool: &PgPool,
    user: &crate::middleware::AuthUser,
    session_id: Uuid,
) -> AppResult<()> {
    let mut tx = crate::db::begin_tenant(pool, user.clinic_id, user.is_super()).await?;
    sqlx::query("SELECT set_config('app.user_id', $1, true)")
        .bind(user.user_id.to_string())
        .execute(&mut *tx)
        .await?;
    let affected = sqlx::query(
        "UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL",
    )
    .bind(session_id)
    .bind(user.user_id)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if affected == 0 {
        return Err(AppError::NotFound("الجلسة غير موجودة".into()));
    }
    tx.commit().await?;
    Ok(())
}

pub async fn revoke_all_sessions(
    pool: &PgPool,
    user: &crate::middleware::AuthUser,
) -> AppResult<()> {
    let mut tx = crate::db::begin_tenant(pool, user.clinic_id, user.is_super()).await?;
    sqlx::query("SELECT set_config('app.user_id', $1, true)")
        .bind(user.user_id.to_string())
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL")
        .bind(user.user_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE users SET sessions_revoked_before = date_trunc('second', NOW()) WHERE id = $1")
        .bind(user.user_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}

pub async fn change_password(
    pool: &PgPool,
    user: &crate::middleware::AuthUser,
    current_password: &str,
    new_password: &str,
) -> AppResult<()> {
    validate_password(new_password)?;
    let mut tx = crate::db::begin_tenant(pool, user.clinic_id, user.is_super()).await?;
    sqlx::query("SELECT set_config('app.user_id', $1, true)")
        .bind(user.user_id.to_string())
        .execute(&mut *tx)
        .await?;
    let password_hash: String = sqlx::query_scalar(
        "SELECT password_hash FROM users WHERE id = $1 AND is_active = TRUE FOR UPDATE",
    )
    .bind(user.user_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(AppError::Unauthorized)?;
    if !verify_password(current_password, &password_hash)? {
        return Err(AppError::Unauthorized);
    }
    let new_hash = hash_password(new_password)?;
    sqlx::query(
        "UPDATE users SET password_hash = $2, sessions_revoked_before = date_trunc('second', NOW()), updated_at = NOW() WHERE id = $1",
    )
    .bind(user.user_id)
    .bind(new_hash)
    .execute(&mut *tx)
    .await?;
    sqlx::query("UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL")
        .bind(user.user_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}

#[derive(Debug, serde::Serialize)]
pub struct MfaSetupInfo {
    pub secret: String,
    pub otpauth_uri: String,
}

#[derive(Debug, serde::Serialize)]
pub struct MfaEnableResult {
    pub enabled: bool,
    pub recovery_codes: Vec<String>,
}

pub async fn setup_mfa(
    pool: &PgPool,
    cfg: &Config,
    user: &crate::middleware::AuthUser,
) -> AppResult<MfaSetupInfo> {
    crate::middleware::require_roles(user, &["clinic_admin", "super_admin"])?;
    let encryption_key = cfg
        .integration_encryption_key
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("مفتاح تشفير MFA غير مضبوط على الخادم".into()))?;
    let secret = crate::auth::mfa::generate_secret();
    let mut tx = crate::db::begin_tenant(pool, user.clinic_id, user.is_super()).await?;
    let already_enabled: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM user_mfa WHERE user_id = $1 AND enabled_at IS NOT NULL)",
    )
    .bind(user.user_id)
    .fetch_one(&mut *tx)
    .await?;
    if already_enabled {
        return Err(AppError::Conflict("المصادقة الثنائية مفعّلة بالفعل".into()));
    }
    sqlx::query(
        r#"INSERT INTO user_mfa (user_id, clinic_id, secret_encrypted, enabled_at, updated_at)
           VALUES ($1, $2, pgp_sym_encrypt($3, $4), NULL, NOW())
           ON CONFLICT (user_id) DO UPDATE SET
             clinic_id = EXCLUDED.clinic_id,
             secret_encrypted = EXCLUDED.secret_encrypted,
             enabled_at = NULL,
             updated_at = NOW()"#,
    )
    .bind(user.user_id)
    .bind(user.clinic_id)
    .bind(&secret)
    .bind(encryption_key)
    .execute(&mut *tx)
    .await?;
    sqlx::query("DELETE FROM mfa_recovery_codes WHERE user_id = $1")
        .bind(user.user_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;

    let account_label = format!("Sahel:{}", user.email);
    Ok(MfaSetupInfo {
        otpauth_uri: format!(
            "otpauth://totp/{}?secret={}&issuer=Sahel&algorithm=SHA1&digits=6&period=30",
            percent_encode_label(&account_label), secret
        ),
        secret,
    })
}

pub async fn enable_mfa(
    pool: &PgPool,
    cfg: &Config,
    user: &crate::middleware::AuthUser,
    code: &str,
) -> AppResult<MfaEnableResult> {
    crate::middleware::require_roles(user, &["clinic_admin", "super_admin"])?;
    let encryption_key = cfg
        .integration_encryption_key
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("مفتاح تشفير MFA غير مضبوط على الخادم".into()))?;
    let mut tx = crate::db::begin_tenant(pool, user.clinic_id, user.is_super()).await?;
    let secret: Option<String> = sqlx::query_scalar(
        r#"SELECT pgp_sym_decrypt(secret_encrypted, $2)::text
           FROM user_mfa WHERE user_id = $1 AND enabled_at IS NULL FOR UPDATE"#,
    )
    .bind(user.user_id)
    .bind(encryption_key)
    .fetch_optional(&mut *tx)
    .await?;
    let secret = secret.ok_or_else(|| AppError::NotFound("ابدأ إعداد المصادقة الثنائية أولاً".into()))?;
    if !crate::auth::mfa::verify_totp(&secret, code) {
        return Err(AppError::BadRequest("رمز المصادقة غير صحيح".into()));
    }

    sqlx::query("UPDATE user_mfa SET enabled_at = NOW(), updated_at = NOW() WHERE user_id = $1")
        .bind(user.user_id)
        .execute(&mut *tx)
        .await?;
    let mut recovery_codes = Vec::with_capacity(10);
    for _ in 0..10 {
        let code = random_recovery_code();
        let code_hash = hash_password(&code)?;
        sqlx::query(
            "INSERT INTO mfa_recovery_codes (user_id, clinic_id, code_hash) VALUES ($1, $2, $3)",
        )
        .bind(user.user_id)
        .bind(user.clinic_id)
        .bind(code_hash)
        .execute(&mut *tx)
        .await?;
        recovery_codes.push(code);
    }
    tx.commit().await?;
    Ok(MfaEnableResult {
        enabled: true,
        recovery_codes,
    })
}

fn random_recovery_code() -> String {
    let mut bytes = [0u8; 8];
    rand::RngCore::fill_bytes(&mut rand::rngs::OsRng, &mut bytes);
    let value = hex::encode(bytes);
    format!("{}-{}", &value[..8], &value[8..])
}

fn percent_encode_label(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~' | b':') {
            encoded.push(byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

#[derive(Debug, serde::Serialize)]
pub struct CurrentSession {
    pub user_id: Uuid,
    pub clinic_id: Option<Uuid>,
    pub clinic_name: Option<String>,
    pub email: String,
    pub full_name: String,
    pub role: String,
    pub mfa_enabled: bool,
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
    let row = sqlx::query_as::<_, (String, String, String, Option<String>, Option<Uuid>, bool)>(
        r#"
        SELECT u.full_name, u.email, u.role::text, c.name, u.clinic_id,
               EXISTS (SELECT 1 FROM user_mfa m WHERE m.user_id = u.id AND m.enabled_at IS NOT NULL)
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
        mfa_enabled: row.5,
    })
}

pub(crate) fn normalize_email(email: &str) -> AppResult<String> {
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
    use super::{normalize_email, valid_slug, validate_password};

    #[test]
    fn email_is_normalized_before_authentication() {
        assert_eq!(
            normalize_email("  Owner@Clinic.SA ").unwrap(),
            "owner@clinic.sa"
        );
        assert_eq!(normalize_email("Owner.Name@gmail.com").unwrap(), "owner.name@gmail.com");
        assert_eq!(normalize_email("Owner@hotmail.com").unwrap(), "owner@hotmail.com");
        assert!(normalize_email("owner@localhost").is_err());
    }

    #[test]
    fn password_policy_rejects_short_common_and_low_complexity_passwords() {
        assert!(validate_password("short").is_err());
        assert!(validate_password("password123").is_err());
        assert!(validate_password("abcdefghijkl").is_err());
        assert!(validate_password("Strong-Clinic-2026!").is_ok());
        assert!(validate_password("عيادة-سهل-2026!").is_ok());
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
