use axum::{Json, Router, extract::State, routing::get};
use serde::Serialize;

use crate::{
    db::begin_tenant,
    error::AppResult,
    middleware::AuthUser,
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new().route("/overview", get(overview))
}

#[derive(Debug, Serialize)]
pub struct Overview {
    pub appointments_today: i64,
    pub completed_month: i64,
    pub no_show_month: i64,
    pub waiting_list: i64,
    pub by_source: Vec<SourceCount>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct SourceCount {
    pub source: String,
    pub count: i64,
}

async fn overview(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<Overview>> {
    let clinic_id = user.require_clinic()?;
    let mut tx = begin_tenant(&state.db, Some(clinic_id), user.is_super()).await?;

    let appointments_today: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM appointments
        WHERE clinic_id = $1
          AND starts_at::date = (NOW() AT TIME ZONE 'Asia/Riyadh')::date
          AND status NOT IN ('cancelled')
        "#,
    )
    .bind(clinic_id)
    .fetch_one(&mut *tx)
    .await?;

    let completed_month: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM appointments
        WHERE clinic_id = $1 AND status = 'completed'
          AND starts_at >= date_trunc('month', NOW())
        "#,
    )
    .bind(clinic_id)
    .fetch_one(&mut *tx)
    .await?;

    let no_show_month: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM appointments
        WHERE clinic_id = $1 AND status = 'no_show'
          AND starts_at >= date_trunc('month', NOW())
        "#,
    )
    .bind(clinic_id)
    .fetch_one(&mut *tx)
    .await?;

    let waiting_list: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM waiting_list WHERE clinic_id = $1 AND status = 'waiting'",
    )
    .bind(clinic_id)
    .fetch_one(&mut *tx)
    .await?;

    let by_source = sqlx::query_as::<_, SourceCount>(
        r#"
        SELECT source, COUNT(*)::bigint as count
        FROM appointments
        WHERE clinic_id = $1 AND starts_at >= date_trunc('month', NOW())
        GROUP BY source ORDER BY count DESC
        "#,
    )
    .bind(clinic_id)
    .fetch_all(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(Json(Overview {
        appointments_today,
        completed_month,
        no_show_month,
        waiting_list,
        by_source,
    }))
}
