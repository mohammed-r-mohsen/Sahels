use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{db::begin_tenant, error::AppResult};

#[derive(Debug, Serialize)]
pub struct NoShowPrediction {
    pub appointment_id: Uuid,
    pub patient_id: Uuid,
    pub patient_name: Option<String>,
    pub doctor_name: String,
    pub starts_at: DateTime<Utc>,
    pub no_show_count: i32,
    pub visit_count: i32,
    pub risk_score: Option<f64>,
    pub risk_level: &'static str,
}

#[derive(Debug, sqlx::FromRow)]
struct UpcomingAppointment {
    appointment_id: Uuid,
    patient_id: Uuid,
    patient_name: Option<String>,
    doctor_name: String,
    starts_at: DateTime<Utc>,
    no_show_count: i32,
    visit_count: i32,
}

pub async fn upcoming(
    pool: &PgPool,
    clinic_id: Uuid,
    days: i64,
) -> AppResult<Vec<NoShowPrediction>> {
    let mut tx = begin_tenant(pool, Some(clinic_id), false).await?;
    let rows = sqlx::query_as::<_, UpcomingAppointment>(
        r#"
        SELECT a.id AS appointment_id, p.id AS patient_id, p.full_name AS patient_name,
               d.full_name AS doctor_name, a.starts_at, p.no_show_count, p.visit_count
        FROM appointments a
        JOIN patients p ON p.id = a.patient_id AND p.clinic_id = a.clinic_id
        JOIN doctors d ON d.id = a.doctor_id AND d.clinic_id = a.clinic_id
        WHERE a.clinic_id = $1
          AND a.starts_at >= NOW()
          AND a.starts_at < NOW() + make_interval(days => $2::int)
          AND a.status IN ('pending', 'confirmed', 'waiting')
        ORDER BY a.starts_at
        LIMIT 200
        "#,
    )
    .bind(clinic_id)
    .bind(days as i32)
    .fetch_all(&mut *tx)
    .await?;
    tx.commit().await?;

    let mut predictions = rows
        .into_iter()
        .map(|row| {
            let risk_score = historical_rate(row.no_show_count, row.visit_count);
            let risk_level = match risk_score {
                None => "insufficient_data",
                Some(score) if score >= 0.4 => "high",
                Some(score) if score >= 0.2 => "moderate",
                Some(_) => "low",
            };
            NoShowPrediction {
                appointment_id: row.appointment_id,
                patient_id: row.patient_id,
                patient_name: row.patient_name,
                doctor_name: row.doctor_name,
                starts_at: row.starts_at,
                no_show_count: row.no_show_count,
                visit_count: row.visit_count,
                risk_score,
                risk_level,
            }
        })
        .collect::<Vec<_>>();
    predictions.sort_by(|left, right| {
        right
            .risk_score
            .partial_cmp(&left.risk_score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| left.starts_at.cmp(&right.starts_at))
    });
    Ok(predictions)
}

fn historical_rate(no_show_count: i32, visit_count: i32) -> Option<f64> {
    let observations = no_show_count + visit_count;
    (observations >= 2).then(|| f64::from(no_show_count) / f64::from(observations))
}

#[cfg(test)]
mod tests {
    use super::historical_rate;

    #[test]
    fn risk_is_unknown_until_two_outcomes_exist() {
        assert_eq!(historical_rate(0, 0), None);
        assert_eq!(historical_rate(1, 0), None);
        assert_eq!(historical_rate(0, 2), Some(0.0));
    }

    #[test]
    fn risk_uses_recorded_no_shows_over_all_outcomes() {
        assert_eq!(historical_rate(2, 3), Some(0.4));
    }
}