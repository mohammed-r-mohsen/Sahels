use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::error::AppResult;

/// Apply tenant context for RLS on a connection/transaction.
pub async fn set_tenant(
    tx: &mut Transaction<'_, Postgres>,
    clinic_id: Option<Uuid>,
    is_super: bool,
) -> AppResult<()> {
    if is_super {
        sqlx::query("SELECT set_config('app.is_super', 'true', true)")
            .execute(&mut **tx)
            .await?;
    } else {
        sqlx::query("SELECT set_config('app.is_super', 'false', true)")
            .execute(&mut **tx)
            .await?;
    }

    if let Some(cid) = clinic_id {
        sqlx::query("SELECT set_config('app.clinic_id', $1, true)")
            .bind(cid.to_string())
            .execute(&mut **tx)
            .await?;
    } else {
        sqlx::query("SELECT set_config('app.clinic_id', '', true)")
            .execute(&mut **tx)
            .await?;
    }

    sqlx::query("SET LOCAL ROLE sahel_app")
            .execute(&mut **tx)
            .await?;

    Ok(())
}

pub async fn begin_tenant(
    pool: &PgPool,
    clinic_id: Option<Uuid>,
    is_super: bool,
) -> AppResult<Transaction<'_, Postgres>> {
    let mut tx = pool.begin().await?;
    set_tenant(&mut tx, clinic_id, is_super).await?;
    Ok(tx)
}

/// Bypass RLS for identity bootstrap (login / register / refresh / webhooks resolve).
pub async fn begin_bypass(pool: &PgPool) -> AppResult<Transaction<'_, Postgres>> {
    begin_tenant(pool, None, true).await
}
