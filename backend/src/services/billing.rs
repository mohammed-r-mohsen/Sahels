use serde::Serialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    db::begin_tenant,
    error::{AppError, AppResult},
    middleware::AuthUser,
};

#[derive(Debug, Serialize)]
pub struct PlanDto {
    pub id: String,
    pub name_ar: String,
    pub price_sar: String,
}

pub async fn list_plans(pool: &PgPool) -> AppResult<Vec<PlanDto>> {
    let rows: Vec<(String, String, String)> = sqlx::query_as(
        "SELECT id, name_ar, price_sar::text FROM plans ORDER BY price_sar",
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(id, name_ar, price_sar)| PlanDto {
            id,
            name_ar,
            price_sar,
        })
        .collect())
}

#[derive(Debug, Serialize)]
pub struct SubscriptionInfo {
    pub plan_id: Option<String>,
    pub status: String,
    pub ends_at: Option<chrono::DateTime<chrono::Utc>>,
}

pub async fn my_subscription(pool: &PgPool, user: &AuthUser) -> AppResult<SubscriptionInfo> {
    let clinic_id = user.require_clinic()?;
    let mut tx = begin_tenant(pool, Some(clinic_id), user.is_super()).await?;

    let row: (Option<String>, String, Option<chrono::DateTime<chrono::Utc>>) =
        sqlx::query_as(
            "SELECT plan_id, subscription_status, subscription_ends_at FROM clinics WHERE id = $1",
        )
        .bind(clinic_id)
        .fetch_one(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(SubscriptionInfo {
        plan_id: row.0,
        status: row.1,
        ends_at: row.2,
    })
}

/// Placeholder: create a Moyasar payment intent record.
pub async fn create_subscription_payment(
    pool: &PgPool,
    user: &AuthUser,
    plan_id: &str,
) -> AppResult<Uuid> {
    crate::middleware::require_roles(user, &["clinic_admin"])?;
    let clinic_id = user.require_clinic()?;

    let price: String = sqlx::query_scalar("SELECT price_sar::text FROM plans WHERE id = $1")
        .bind(plan_id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound("الخطة غير موجودة".into()))?;

    let amount: f64 = price.parse().unwrap_or(0.0);

    let mut tx = begin_tenant(pool, Some(clinic_id), user.is_super()).await?;
    let id: Uuid = sqlx::query_scalar(
        r#"
        INSERT INTO payments (clinic_id, amount_sar, purpose, status, meta)
        VALUES ($1, $2, 'subscription', 'pending', jsonb_build_object('plan_id', $3))
        RETURNING id
        "#,
    )
    .bind(clinic_id)
    .bind(amount)
    .bind(plan_id)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(id)
}
