use chrono::{DateTime, NaiveDate, Utc};
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::{
    db::begin_tenant,
    error::{AppError, AppResult},
    middleware::AuthUser,
    models::WaitingListEntry,
};

#[derive(Debug, serde::Deserialize)]
pub struct AddWaitInput {
    pub doctor_id: Option<Uuid>,
    pub patient_phone: String,
    pub patient_name: Option<String>,
    pub desired_date: Option<NaiveDate>,
    pub service: Option<String>,
    pub priority: Option<i32>,
}

pub async fn list(pool: &sqlx::PgPool, user: &AuthUser) -> AppResult<Vec<WaitingListEntry>> {
    let clinic_id = user.require_clinic()?;
    let mut tx = begin_tenant(pool, Some(clinic_id), user.is_super()).await?;

    let rows = sqlx::query_as::<_, WaitingListEntry>(
        r#"
        SELECT id, clinic_id, doctor_id, patient_id, desired_date, preferred_time,
               service, priority, status, created_at
        FROM waiting_list
        WHERE clinic_id = $1 AND status = 'waiting'
        ORDER BY priority ASC, created_at ASC
        "#,
    )
    .bind(clinic_id)
    .fetch_all(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(rows)
}

pub async fn add(
    pool: &sqlx::PgPool,
    user: &AuthUser,
    input: AddWaitInput,
) -> AppResult<WaitingListEntry> {
    let clinic_id = user.require_clinic()?;
    let mut tx = begin_tenant(pool, Some(clinic_id), user.is_super()).await?;

    let patient_id: Uuid = sqlx::query_scalar(
        r#"
        INSERT INTO patients (clinic_id, phone, full_name, source)
        VALUES ($1, $2, $3, 'admin')
        ON CONFLICT (clinic_id, phone) DO UPDATE
          SET full_name = COALESCE(EXCLUDED.full_name, patients.full_name)
        RETURNING id
        "#,
    )
    .bind(clinic_id)
    .bind(&input.patient_phone)
    .bind(&input.patient_name)
    .fetch_one(&mut *tx)
    .await?;

    let entry = sqlx::query_as::<_, WaitingListEntry>(
        r#"
        INSERT INTO waiting_list
          (clinic_id, doctor_id, patient_id, desired_date, service, priority)
        VALUES ($1, $2, $3, $4, $5, COALESCE($6, 100))
        RETURNING id, clinic_id, doctor_id, patient_id, desired_date, preferred_time,
                  service, priority, status, created_at
        "#,
    )
    .bind(clinic_id)
    .bind(input.doctor_id)
    .bind(patient_id)
    .bind(input.desired_date)
    .bind(&input.service)
    .bind(input.priority)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(entry)
}

/// When an appointment is cancelled, offer the slot to the next waiting patient.
pub async fn promote_on_cancel(
    tx: &mut Transaction<'_, Postgres>,
    clinic_id: Uuid,
    doctor_id: Uuid,
    starts_at: DateTime<Utc>,
) -> AppResult<()> {
    let desired = starts_at.date_naive();

    let next: Option<(Uuid, Uuid, Option<String>)> = sqlx::query_as(
        r#"
        SELECT id, patient_id, service FROM waiting_list
        WHERE clinic_id = $1
          AND status = 'waiting'
          AND (doctor_id IS NULL OR doctor_id = $2)
          AND (desired_date IS NULL OR desired_date = $3)
        ORDER BY priority ASC, created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
        "#,
    )
    .bind(clinic_id)
    .bind(doctor_id)
    .bind(desired)
    .fetch_optional(&mut **tx)
    .await?;

    let Some((wait_id, patient_id, service)) = next else {
        return Ok(());
    };

    let slot_minutes: i32 =
        sqlx::query_scalar("SELECT slot_minutes FROM doctors WHERE id = $1")
            .bind(doctor_id)
            .fetch_one(&mut **tx)
            .await?;

    let ends_at = starts_at + chrono::Duration::minutes(slot_minutes as i64);

    let appt_id: Uuid = sqlx::query_scalar(
        r#"
        INSERT INTO appointments
          (clinic_id, doctor_id, patient_id, starts_at, ends_at, status, source, service)
        VALUES ($1,$2,$3,$4,$5,'confirmed','admin',$6)
        RETURNING id
        "#,
    )
    .bind(clinic_id)
    .bind(doctor_id)
    .bind(patient_id)
    .bind(starts_at)
    .bind(ends_at)
    .bind(&service)
    .fetch_one(&mut **tx)
    .await
    .map_err(|e| {
        tracing::warn!(error = %e, "waiting list promote insert failed");
        AppError::from(e)
    })?;

    sqlx::query(
        "UPDATE waiting_list SET status = 'booked' WHERE id = $1",
    )
    .bind(wait_id)
    .execute(&mut **tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO audit_logs (clinic_id, action, entity, entity_id, details)
        VALUES ($1, 'waiting_list.promote', 'appointment', $2, jsonb_build_object('wait_id', $3::text))
        "#,
    )
    .bind(clinic_id)
    .bind(appt_id.to_string())
    .bind(wait_id.to_string())
    .execute(&mut **tx)
    .await?;

    Ok(())
}
