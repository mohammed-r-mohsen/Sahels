use serde::Serialize;
use sqlx::PgPool;
use crate::{
    db::begin_tenant,
    error::AppResult,
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

pub async fn suspend_expired_subscriptions(pool: &PgPool) -> AppResult<u64> {
    let mut tx = begin_bypass(pool).await?;
    let affected = sqlx::query(
        r#"UPDATE clinics
           SET subscription_status = 'suspended', updated_at = NOW()
           WHERE subscription_status IN ('active', 'trial', 'past_due')
             AND subscription_ends_at IS NOT NULL
             AND subscription_ends_at <= NOW()"#,
    )
    .execute(&mut *tx)
    .await?
    .rows_affected();
    tx.commit().await?;
    Ok(affected)
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

