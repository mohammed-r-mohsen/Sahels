use axum::{Json, Router, extract::{Query, State}, routing::get};
use serde::{Deserialize, Serialize};
use serde::Serialize;

use crate::{
    db::begin_tenant,
    error::AppResult,
    middleware::AuthUser,
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/overview", get(overview))
        .route("/no-show-risk", get(no_show_risk))
        .route("/booking-reports", get(booking_reports))
}

#[derive(Debug, Serialize)]
pub struct BookingSummary {
    pub bookings: i64,
    pub cancelled: i64,
    pub completed: i64,
    pub no_show: i64,
}

#[derive(Debug, Serialize)]
pub struct BookingReports {
    pub weekly: BookingSummary,
    pub monthly: BookingSummary,
}

async fn booking_reports(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<BookingReports>> {
    let clinic_id = user.require_clinic()?;
    let mut tx = begin_tenant(&state.db, Some(clinic_id), user.is_super()).await?;
    let counts: (i64, i64, i64, i64, i64, i64, i64, i64) = sqlx::query_as(
        r#"
        WITH bounds AS (
          SELECT
                        (date_trunc('week', NOW() AT TIME ZONE timezone) AT TIME ZONE timezone) AS week_start,
                        (date_trunc('week', NOW() AT TIME ZONE timezone) AT TIME ZONE timezone) + INTERVAL '1 week' AS week_end,
                        (date_trunc('month', NOW() AT TIME ZONE timezone) AT TIME ZONE timezone) AS month_start,
                        (date_trunc('month', NOW() AT TIME ZONE timezone) AT TIME ZONE timezone) + INTERVAL '1 month' AS month_end
          FROM clinics WHERE id = $1
        )
        SELECT
                    COUNT(*) FILTER (WHERE a.starts_at >= b.week_start AND a.starts_at < b.week_end)::bigint,
                    COUNT(*) FILTER (WHERE a.starts_at >= b.week_start AND a.starts_at < b.week_end AND a.status = 'cancelled')::bigint,
                    COUNT(*) FILTER (WHERE a.starts_at >= b.week_start AND a.starts_at < b.week_end AND a.status = 'completed')::bigint,
                    COUNT(*) FILTER (WHERE a.starts_at >= b.week_start AND a.starts_at < b.week_end AND a.status = 'no_show')::bigint,
          COUNT(*)::bigint,
          COUNT(*) FILTER (WHERE a.status = 'cancelled')::bigint,
          COUNT(*) FILTER (WHERE a.status = 'completed')::bigint,
          COUNT(*) FILTER (WHERE a.status = 'no_show')::bigint
        FROM appointments a
        CROSS JOIN bounds b
        WHERE a.clinic_id = $1
          AND a.starts_at >= b.month_start
                    AND a.starts_at < b.month_end
        "#,
    )
    .bind(clinic_id)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(BookingReports {
        weekly: BookingSummary {
            bookings: counts.0,
            cancelled: counts.1,
            completed: counts.2,
            no_show: counts.3,
        },
        monthly: BookingSummary {
            bookings: counts.4,
            cancelled: counts.5,
            completed: counts.6,
            no_show: counts.7,
        },
    }))
}

#[derive(Debug, Deserialize)]
struct NoShowRiskQuery {
    days: Option<i64>,
}

async fn no_show_risk(
    State(state): State<AppState>,
    user: AuthUser,
    Query(query): Query<NoShowRiskQuery>,
) -> AppResult<Json<Vec<crate::services::no_show_prediction::NoShowPrediction>>> {
    let days = query.days.unwrap_or(7);
    if !(1..=30).contains(&days) {
        return Err(crate::error::AppError::BadRequest(
            "يجب أن تكون الفترة بين يوم و30 يوماً".into(),
        ));
    }
    let clinic_id = user.require_clinic()?;
    Ok(Json(
        crate::services::no_show_prediction::upcoming(&state.db, clinic_id, days).await?,
    ))
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
