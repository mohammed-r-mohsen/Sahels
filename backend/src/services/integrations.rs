use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    db::begin_tenant,
    error::{AppError, AppResult},
    middleware::AuthUser,
};

#[derive(Debug, Clone, Serialize)]
pub struct ChannelSettings {
    pub enabled: bool,
    pub external_id: String,
    pub phone_number_id: Option<String>,
    pub business_account_id: Option<String>,
    pub page_id: Option<String>,
    pub access_token_configured: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct AiSettings {
    pub provider: &'static str,
    pub enabled: bool,
    pub ollama_base_url: String,
    pub arabic_model: String,
    pub booking_model: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct IntegrationSettings {
    pub whatsapp: ChannelSettings,
    pub instagram: ChannelSettings,
    pub ai: AiSettings,
}

#[derive(Deserialize)]
pub struct SaveChannelInput {
    pub enabled: bool,
    pub phone_number_id: Option<String>,
    pub business_account_id: Option<String>,
    pub instagram_account_id: Option<String>,
    pub page_id: Option<String>,
    pub access_token: Option<String>,
    #[serde(default)]
    pub clear_access_token: bool,
}

#[derive(Deserialize)]
pub struct SaveIntegrationsInput {
    pub whatsapp: SaveChannelInput,
    pub instagram: SaveChannelInput,
}

#[derive(Debug, Deserialize)]
pub struct SaveAiSettingsInput {
    pub enabled: bool,
    pub arabic_model: String,
    pub booking_model: String,
}

#[derive(Debug, sqlx::FromRow)]
struct ChannelRow {
    channel: String,
    enabled: bool,
    external_id: String,
    phone_number_id: Option<String>,
    business_account_id: Option<String>,
    page_id: Option<String>,
    access_token_configured: bool,
}

impl Default for ChannelSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            external_id: String::new(),
            phone_number_id: None,
            business_account_id: None,
            page_id: None,
            access_token_configured: false,
        }
    }
}

pub async fn get_settings(
    pool: &PgPool,
    user: &AuthUser,
    ollama_base_url: &str,
) -> AppResult<IntegrationSettings> {
    let clinic_id = user.require_clinic()?;
    let mut tx = begin_tenant(pool, Some(clinic_id), user.is_super()).await?;
    let channels = sqlx::query_as::<_, ChannelRow>(
        r#"
        SELECT channel, is_active AS enabled, external_id, phone_number_id, business_account_id,
               page_id, access_token_encrypted IS NOT NULL AS access_token_configured
        FROM clinic_channel_integrations
        WHERE clinic_id = $1
        "#,
    )
    .bind(clinic_id)
    .fetch_all(&mut *tx)
    .await?;
    let mut whatsapp = ChannelSettings::default();
    let mut instagram = ChannelSettings::default();
    for row in channels {
        let settings = ChannelSettings {
            enabled: row.enabled,
            external_id: row.external_id,
            phone_number_id: row.phone_number_id,
            business_account_id: row.business_account_id,
            page_id: row.page_id,
            access_token_configured: row.access_token_configured,
        };
        match row.channel.as_str() {
            "whatsapp" => whatsapp = settings,
            "instagram" => instagram = settings,
            _ => {}
        }
    }

    let ai: Option<(bool, String, String)> = sqlx::query_as(
        "SELECT enabled, arabic_model, booking_model FROM clinic_ai_settings WHERE clinic_id = $1",
    )
    .bind(clinic_id)
    .fetch_optional(&mut *tx)
    .await?;
    tx.commit().await?;

    let (enabled, arabic_model, booking_model) =
        ai.unwrap_or_else(|| (false, "allam:7b".to_owned(), "qwen2.5:7b".to_owned()));
    Ok(IntegrationSettings {
        whatsapp,
        instagram,
        ai: AiSettings {
            provider: "ollama",
            enabled,
            ollama_base_url: ollama_base_url.to_owned(),
            arabic_model,
            booking_model,
        },
    })
}

pub async fn save_settings(
    pool: &PgPool,
    user: &AuthUser,
    input: SaveIntegrationsInput,
    encryption_key: Option<&str>,
) -> AppResult<()> {
    crate::middleware::require_roles(user, &["clinic_admin"])?;
    let clinic_id = user.require_clinic()?;
    let mut tx = begin_tenant(pool, Some(clinic_id), user.is_super()).await?;
    save_channel(&mut tx, clinic_id, "whatsapp", &input.whatsapp, encryption_key).await?;
    save_channel(&mut tx, clinic_id, "instagram", &input.instagram, encryption_key).await?;
    tx.commit().await?;
    Ok(())
}

async fn save_channel(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    clinic_id: Uuid,
    channel: &str,
    input: &SaveChannelInput,
    encryption_key: Option<&str>,
) -> AppResult<()> {
    validate_channel_input(channel, input)?;
    let access_token = input
        .access_token
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    if access_token.is_some_and(|token| token.len() > 4096) {
        return Err(AppError::BadRequest("رمز القناة أطول من المسموح".into()));
    }
    if access_token.is_some() && encryption_key.is_none() {
        return Err(AppError::BadRequest(
            "إعداد تشفير بيانات التكامل غير مكتمل على الخادم".into(),
        ));
    }
    let existing_has_token: bool = sqlx::query_scalar(
        r#"
        SELECT EXISTS (
          SELECT 1 FROM clinic_channel_integrations
          WHERE clinic_id = $1 AND channel = $2 AND access_token_encrypted IS NOT NULL
        )
        "#,
    )
    .bind(clinic_id)
    .bind(channel)
    .fetch_one(&mut **tx)
    .await?;
    let clear_token = input.clear_access_token;
    if input.enabled && (clear_token || (access_token.is_none() && !existing_has_token)) {
        return Err(AppError::BadRequest(
            "أدخل رمز وصول صالحًا قبل تفعيل القناة".into(),
        ));
    }
    if input.enabled && encryption_key.is_none() {
        return Err(AppError::BadRequest(
            "أضف INTEGRATION_ENCRYPTION_KEY إلى إعدادات الخادم لتفعيل القناة".into(),
        ));
    }

    let external_id = if channel == "whatsapp" {
        input.phone_number_id.as_deref().map(str::trim)
    } else {
        input.instagram_account_id.as_deref().map(str::trim)
    }
    .filter(|value| !value.is_empty());
    let phone_number_id = input.phone_number_id.as_deref().map(str::trim);
    let business_account_id = input.business_account_id.as_deref().map(str::trim);
    let page_id = input.page_id.as_deref().map(str::trim);

    sqlx::query(
        r#"
        INSERT INTO clinic_channel_integrations (
          clinic_id, channel, external_id, phone_number_id, business_account_id, page_id,
          access_token_encrypted, is_active, updated_at
        )
        VALUES (
          $1, $2, COALESCE(NULLIF($3, ''), ''),
          NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''),
          CASE WHEN $8::boolean THEN NULL
               WHEN $7::text IS NOT NULL THEN pgp_sym_encrypt($7, $9)
               ELSE NULL END,
          $10, NOW()
        )
        ON CONFLICT (clinic_id, channel) DO UPDATE SET
          external_id = COALESCE(NULLIF(EXCLUDED.external_id, ''), clinic_channel_integrations.external_id),
          phone_number_id = COALESCE(EXCLUDED.phone_number_id, clinic_channel_integrations.phone_number_id),
          business_account_id = COALESCE(EXCLUDED.business_account_id, clinic_channel_integrations.business_account_id),
          page_id = COALESCE(EXCLUDED.page_id, clinic_channel_integrations.page_id),
          access_token_encrypted = CASE
            WHEN $8::boolean THEN NULL
            WHEN $7::text IS NOT NULL THEN pgp_sym_encrypt($7, $9)
            ELSE clinic_channel_integrations.access_token_encrypted
          END,
          is_active = $10,
          updated_at = NOW()
        "#,
    )
    .bind(clinic_id)
    .bind(channel)
    .bind(external_id.unwrap_or(""))
    .bind(phone_number_id)
    .bind(business_account_id)
    .bind(page_id)
    .bind(access_token)
    .bind(clear_token)
    .bind(encryption_key.unwrap_or(""))
    .bind(input.enabled)
    .execute(&mut **tx)
    .await
    .map_err(|error| match error {
        sqlx::Error::Database(db)
            if db
                .constraint()
                .is_some_and(|name| name.contains("external")) =>
        {
            AppError::Conflict("هذا المعرّف مرتبط بعيادة أخرى".into())
        }
        other => AppError::from(other),
    })?;
    Ok(())
}

fn validate_channel_input(channel: &str, input: &SaveChannelInput) -> AppResult<()> {
    for value in [
        input.phone_number_id.as_deref(),
        input.business_account_id.as_deref(),
        input.instagram_account_id.as_deref(),
        input.page_id.as_deref(),
    ]
    .into_iter()
    .flatten()
    {
        if value.trim().chars().count() > 200 || value.chars().any(char::is_whitespace) {
            return Err(AppError::BadRequest("معرّف Meta غير صالح".into()));
        }
    }
    if channel == "whatsapp"
        && input.enabled
        && input
            .phone_number_id
            .as_deref()
            .map_or(true, |value| value.trim().is_empty())
    {
        return Err(AppError::BadRequest(
            "معرّف رقم واتساب مطلوب لتفعيل القناة".into(),
        ));
    }
    if channel == "instagram"
        && input.enabled
        && input
            .instagram_account_id
            .as_deref()
            .map_or(true, |value| value.trim().is_empty())
    {
        return Err(AppError::BadRequest(
            "معرّف حساب إنستغرام مطلوب لتفعيل القناة".into(),
        ));
    }
    Ok(())
}

pub async fn save_ai_settings(
    pool: &PgPool,
    user: &AuthUser,
    input: SaveAiSettingsInput,
) -> AppResult<()> {
    crate::middleware::require_roles(user, &["clinic_admin"])?;
    for (label, value) in [
        ("نموذج اللغة العربية", input.arabic_model.as_str()),
        ("نموذج الحجوزات", input.booking_model.as_str()),
    ] {
        if value.trim().is_empty()
            || value.trim().len() > 120
            || value.chars().any(char::is_whitespace)
        {
            return Err(AppError::BadRequest(format!("{label} غير صالح")));
        }
    }
    let clinic_id = user.require_clinic()?;
    let mut tx = begin_tenant(pool, Some(clinic_id), user.is_super()).await?;
    sqlx::query(
        r#"
        INSERT INTO clinic_ai_settings (clinic_id, enabled, arabic_model, booking_model, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (clinic_id) DO UPDATE SET
          enabled = EXCLUDED.enabled,
          arabic_model = EXCLUDED.arabic_model,
          booking_model = EXCLUDED.booking_model,
          updated_at = NOW()
        "#,
    )
    .bind(clinic_id)
    .bind(input.enabled)
    .bind(input.arabic_model.trim())
    .bind(input.booking_model.trim())
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{SaveChannelInput, validate_channel_input};

    #[test]
    fn enabled_channels_require_their_meta_account_identifier() {
        let input = SaveChannelInput {
            enabled: true,
            phone_number_id: None,
            business_account_id: None,
            instagram_account_id: None,
            page_id: None,
            access_token: None,
            clear_access_token: false,
        };
        assert!(validate_channel_input("whatsapp", &input).is_err());
        assert!(validate_channel_input("instagram", &input).is_err());
    }
}
