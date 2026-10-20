use hmac::{Hmac, Mac};
use sha2::Sha256;
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::{AppError, AppResult};

type HmacSha256 = Hmac<Sha256>;

/// Verify Meta webhook signature: X-Hub-Signature-256 = sha256=<hex>
pub fn verify_meta_signature(
    app_secret: &str,
    raw_body: &[u8],
    signature_header: &str,
) -> AppResult<()> {
    let sig = signature_header
        .strip_prefix("sha256=")
        .ok_or_else(|| AppError::Unauthorized)?;

    let mut mac = HmacSha256::new_from_slice(app_secret.as_bytes())
        .map_err(|e| AppError::Other(anyhow::anyhow!(e)))?;
    mac.update(raw_body);
    let expected = hex::encode(mac.finalize().into_bytes());

    if !constant_time_eq(expected.as_bytes(), sig.as_bytes()) {
        return Err(AppError::Unauthorized);
    }
    Ok(())
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b.iter()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

pub async fn resolve_clinic_by_phone_number_id(
    pool: &PgPool,
    phone_number_id: &str,
) -> AppResult<(Uuid, String)> {
    let mut tx = crate::db::begin_bypass(pool).await?;
    let row: Option<(Uuid, String)> = sqlx::query_as(
        r#"
        SELECT clinic_id, access_token FROM clinic_tokens
        WHERE channel = 'whatsapp' AND external_id = $1 AND is_active
        "#,
    )
    .bind(phone_number_id)
    .fetch_optional(&mut *tx)
    .await?;
    tx.commit().await?;

    row.ok_or_else(|| AppError::NotFound("عيادة غير مرتبطة بهذا الرقم".into()))
}

#[derive(Debug, serde::Deserialize)]
pub struct InboundMessage {
    pub phone_number_id: String,
    pub from: String,
    pub body: String,
    pub message_id: Option<String>,
}

/// Persist inbound message and return clinic_id for AI/routing.
pub async fn ingest_inbound(pool: &PgPool, msg: InboundMessage) -> AppResult<Uuid> {
    let (clinic_id, _token) =
        resolve_clinic_by_phone_number_id(pool, &msg.phone_number_id).await?;

    let mut tx = crate::db::begin_tenant(pool, Some(clinic_id), false).await?;

    let patient_id: Uuid = sqlx::query_scalar(
        r#"
        INSERT INTO patients (clinic_id, phone, source)
        VALUES ($1, $2, 'whatsapp')
        ON CONFLICT (clinic_id, phone) DO UPDATE SET phone = EXCLUDED.phone
        RETURNING id
        "#,
    )
    .bind(clinic_id)
    .bind(&msg.from)
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO message_logs (clinic_id, patient_id, channel, direction, body, meta)
        VALUES ($1, $2, 'whatsapp', 'in', $3, jsonb_build_object('message_id', $4))
        "#,
    )
    .bind(clinic_id)
    .bind(patient_id)
    .bind(&msg.body)
    .bind(msg.message_id.as_deref().unwrap_or(""))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(clinic_id)
}
