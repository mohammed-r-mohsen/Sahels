use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    config::Config,
    db::{begin_bypass, begin_tenant},
    error::{AppError, AppResult},
    middleware::AuthUser,
};

#[derive(Debug, Serialize)]
pub struct CheckoutSession {
    pub payment_id: Uuid,
    pub checkout_url: String,
    pub status: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct InvoiceDto {
    pub id: Uuid,
    pub amount_sar: String,
    pub currency: String,
    pub provider: String,
    pub status: String,
    pub purpose: String,
    pub plan_id: Option<String>,
    pub checkout_url: Option<String>,
    pub created_at: DateTime<Utc>,
    pub paid_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize)]
pub struct PaymentVerification {
    pub payment_id: Uuid,
    pub status: String,
}

#[derive(Debug, Deserialize)]
struct MoyasarInvoice {
    id: String,
    status: String,
    amount: Option<i64>,
    currency: Option<String>,
    url: Option<String>,
}

pub async fn create_subscription_payment(
    pool: &PgPool,
    client: &reqwest::Client,
    config: &Config,
    user: &AuthUser,
    plan_id: &str,
) -> AppResult<CheckoutSession> {
    crate::middleware::require_roles(user, &["clinic_admin"])?;
    let clinic_id = user.require_clinic()?;
    let secret_key = moyasar_key(config)?;
    let callback_base = setting(config.billing_callback_url.as_deref(), "BILLING_CALLBACK_URL")?;
    let success_base = setting(config.billing_success_url.as_deref(), "BILLING_SUCCESS_URL")?;
    validate_public_url(callback_base)?;
    validate_public_url(success_base)?;

    let plan: Option<(i64, String)> = sqlx::query_as(
        "SELECT ROUND(price_sar * 100)::bigint, name_ar FROM plans WHERE id = $1",
    )
    .bind(plan_id)
    .fetch_optional(pool)
    .await?;
    let (amount_minor, plan_name) =
        plan.ok_or_else(|| AppError::NotFound("الخطة غير موجودة".into()))?;

    let mut tx = begin_tenant(pool, Some(clinic_id), user.is_super()).await?;
    let payment_id: Uuid = sqlx::query_scalar(
        r#"INSERT INTO payments (clinic_id, amount_sar, currency, provider, purpose, status, meta)
           VALUES ($1, $2::numeric / 100, 'SAR', 'moyasar', 'subscription', 'pending',
                   jsonb_build_object('plan_id', $3))
           RETURNING id"#,
    )
    .bind(clinic_id)
    .bind(amount_minor)
    .bind(plan_id)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;

    let response = client
        .post("https://api.moyasar.com/v1/invoices")
        .basic_auth(secret_key, Some(""))
        .json(&serde_json::json!({
            "amount": amount_minor,
            "currency": "SAR",
            "description": format!("اشتراك سهيل - {plan_name}"),
            "callback_url": payment_url(callback_base, payment_id)?,
            "success_url": payment_url(success_base, payment_id)?,
            "metadata": {"payment_id": payment_id, "clinic_id": clinic_id, "plan_id": plan_id}
        }))
        .send()
        .await
        .map_err(|error| AppError::Other(error.into()))?;
    if !response.status().is_success() {
        mark_payment_failed(pool, clinic_id, payment_id).await?;
        tracing::error!(status = %response.status(), %payment_id, "Moyasar invoice creation failed");
        return Err(AppError::Other(anyhow::anyhow!("تعذر إنشاء فاتورة لدى Moyasar")));
    }
    let invoice: MoyasarInvoice = response
        .json()
        .await
        .map_err(|error| AppError::Other(error.into()))?;
    let checkout_url = invoice
        .url
        .filter(|url| !url.trim().is_empty())
        .ok_or_else(|| AppError::Other(anyhow::anyhow!("Moyasar invoice has no checkout URL")))?;

    let mut tx = begin_tenant(pool, Some(clinic_id), user.is_super()).await?;
    sqlx::query(
        r#"UPDATE payments SET provider_id = $3,
           meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('checkout_url', $4)
           WHERE id = $1 AND clinic_id = $2 AND status = 'pending'"#,
    )
    .bind(payment_id)
    .bind(clinic_id)
    .bind(invoice.id)
    .bind(&checkout_url)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    Ok(CheckoutSession {
        payment_id,
        checkout_url,
        status: "pending".into(),
    })
}

pub async fn list_invoices(pool: &PgPool, user: &AuthUser) -> AppResult<Vec<InvoiceDto>> {
    crate::middleware::require_roles(user, &["clinic_admin"])?;
    let clinic_id = user.require_clinic()?;
    let mut tx = begin_tenant(pool, Some(clinic_id), user.is_super()).await?;
    let invoices = sqlx::query_as::<_, InvoiceDto>(
        r#"SELECT id, amount_sar::text AS amount_sar, currency, provider, status, purpose,
           meta->>'plan_id' AS plan_id, meta->>'checkout_url' AS checkout_url, created_at, paid_at
           FROM payments WHERE clinic_id = $1 ORDER BY created_at DESC LIMIT 50"#,
    )
    .bind(clinic_id)
    .fetch_all(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(invoices)
}

pub async fn verify_payment(
    pool: &PgPool,
    client: &reqwest::Client,
    config: &Config,
    user: &AuthUser,
    payment_id: Uuid,
) -> AppResult<PaymentVerification> {
    crate::middleware::require_roles(user, &["clinic_admin"])?;
    verify_payment_for_clinic(pool, client, config, user.require_clinic()?, payment_id).await
}

pub async fn handle_moyasar_callback(
    pool: &PgPool,
    client: &reqwest::Client,
    config: &Config,
    payment_id: Uuid,
) -> AppResult<PaymentVerification> {
    let mut tx = begin_bypass(pool).await?;
    let clinic_id: Option<Uuid> = sqlx::query_scalar(
        "SELECT clinic_id FROM payments WHERE id = $1 AND provider = 'moyasar'",
    )
    .bind(payment_id)
    .fetch_optional(&mut *tx)
    .await?;
    tx.commit().await?;
    let clinic_id = clinic_id.ok_or_else(|| AppError::NotFound("فاتورة الدفع غير معروفة".into()))?;
    verify_payment_for_clinic(pool, client, config, clinic_id, payment_id).await
}

async fn verify_payment_for_clinic(
    pool: &PgPool,
    client: &reqwest::Client,
    config: &Config,
    clinic_id: Uuid,
    payment_id: Uuid,
) -> AppResult<PaymentVerification> {
    let mut tx = begin_tenant(pool, Some(clinic_id), false).await?;
    let payment: Option<(Option<String>, i64, String)> = sqlx::query_as(
        r#"SELECT provider_id, ROUND(amount_sar * 100)::bigint, status
           FROM payments WHERE id = $1 AND clinic_id = $2 AND provider = 'moyasar'"#,
    )
    .bind(payment_id)
    .bind(clinic_id)
    .fetch_optional(&mut *tx)
    .await?;
    tx.commit().await?;
    let (provider_id, amount_minor, local_status) =
        payment.ok_or_else(|| AppError::NotFound("الفاتورة غير موجودة".into()))?;
    if local_status == "paid" {
        return Ok(PaymentVerification { payment_id, status: local_status });
    }
    let provider_id = provider_id.ok_or_else(|| AppError::Conflict("فاتورة الدفع لم تكتمل لدى البوابة".into()))?;
    let response = client
        .get(format!("https://api.moyasar.com/v1/invoices/{provider_id}"))
        .basic_auth(moyasar_key(config)?, Some(""))
        .send()
        .await
        .map_err(|error| AppError::Other(error.into()))?;
    if !response.status().is_success() {
        return Err(AppError::Other(anyhow::anyhow!("تعذر التحقق من الفاتورة لدى Moyasar")));
    }
    let invoice: MoyasarInvoice = response
        .json()
        .await
        .map_err(|error| AppError::Other(error.into()))?;
    if invoice.id != provider_id || invoice.amount != Some(amount_minor) || invoice.currency.as_deref() != Some("SAR") {
        return Err(AppError::Forbidden);
    }

    match invoice.status.as_str() {
        "paid" => {
            let mut tx = begin_tenant(pool, Some(clinic_id), false).await?;
            let row: Option<(String, Option<String>)> = sqlx::query_as(
                "SELECT status, meta->>'plan_id' FROM payments WHERE id = $1 AND clinic_id = $2 FOR UPDATE",
            )
            .bind(payment_id)
            .bind(clinic_id)
            .fetch_optional(&mut *tx)
            .await?;
            let Some((status, plan_id)) = row else {
                return Err(AppError::NotFound("الفاتورة غير موجودة".into()));
            };
            if status != "paid" {
                let plan_id = plan_id.ok_or_else(|| AppError::Other(anyhow::anyhow!("payment plan is missing")))?;
                sqlx::query("UPDATE payments SET status = 'paid', paid_at = NOW() WHERE id = $1 AND clinic_id = $2")
                    .bind(payment_id).bind(clinic_id).execute(&mut *tx).await?;
                sqlx::query(
                    r#"UPDATE clinics SET plan_id = $2, subscription_status = 'active',
                       subscription_ends_at = GREATEST(COALESCE(subscription_ends_at, NOW()), NOW()) + INTERVAL '1 month'
                       WHERE id = $1"#,
                )
                .bind(clinic_id).bind(plan_id).execute(&mut *tx).await?;
            }
            tx.commit().await?;
            Ok(PaymentVerification { payment_id, status: "paid".into() })
        }
        "failed" | "canceled" | "expired" | "voided" => {
            mark_payment_failed(pool, clinic_id, payment_id).await?;
            Ok(PaymentVerification { payment_id, status: "failed".into() })
        }
        _ => Ok(PaymentVerification { payment_id, status: "pending".into() }),
    }
}

async fn mark_payment_failed(pool: &PgPool, clinic_id: Uuid, payment_id: Uuid) -> AppResult<()> {
    let mut tx = begin_tenant(pool, Some(clinic_id), false).await?;
    sqlx::query("UPDATE payments SET status = 'failed' WHERE id = $1 AND clinic_id = $2 AND status = 'pending'")
        .bind(payment_id).bind(clinic_id).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(())
}

fn moyasar_key(config: &Config) -> AppResult<&str> {
    let key = setting(config.moyasar_secret_key.as_deref(), "MOYASAR_SECRET_KEY")?;
    if !key.starts_with("sk_test_") && !key.starts_with("sk_live_") {
        return Err(AppError::BadRequest("استخدم مفتاح Moyasar السري sk_test أو sk_live".into()));
    }
    Ok(key)
}

fn setting<'a>(value: Option<&'a str>, name: &str) -> AppResult<&'a str> {
    value.map(str::trim).filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::BadRequest(format!("لم يتم إعداد {name} على الخادم")))
}

fn validate_public_url(value: &str) -> AppResult<()> {
    let url = reqwest::Url::parse(value).map_err(|_| AppError::BadRequest("رابط الدفع غير صالح".into()))?;
    let local_http = url.scheme() == "http" && matches!(url.host_str(), Some("localhost" | "127.0.0.1"));
    if (url.scheme() != "https" && !local_http) || url.host_str().is_none() {
        return Err(AppError::BadRequest("رابط الدفع يجب أن يستخدم HTTPS".into()));
    }
    Ok(())
}

fn payment_url(base: &str, payment_id: Uuid) -> AppResult<String> {
    let mut url = reqwest::Url::parse(base).map_err(|_| AppError::BadRequest("رابط الدفع غير صالح".into()))?;
    url.query_pairs_mut().append_pair("payment_id", &payment_id.to_string());
    Ok(url.into())
}