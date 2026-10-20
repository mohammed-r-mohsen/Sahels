use chrono::NaiveTime;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    db::begin_tenant,
    error::{AppError, AppResult},
    middleware::AuthUser,
    models::{Clinic, Doctor, DoctorSchedule},
};

pub async fn get_my_clinic(pool: &PgPool, user: &AuthUser) -> AppResult<Clinic> {
    let clinic_id = user.require_clinic()?;
    let mut tx = begin_tenant(pool, Some(clinic_id), user.is_super()).await?;

    let clinic = sqlx::query_as::<_, Clinic>(
        r#"
        SELECT id, name, slug, logo_url, city, address, timezone, reminder_hours,
               plan_id, subscription_status, subscription_ends_at, created_at
        FROM clinics WHERE id = $1
        "#,
    )
    .bind(clinic_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("العيادة غير موجودة".into()))?;

    tx.commit().await?;
    Ok(clinic)
}

#[derive(Debug, serde::Deserialize)]
pub struct UpdateClinicInput {
    pub name: Option<String>,
    pub logo_url: Option<String>,
    pub city: Option<String>,
    pub address: Option<String>,
    pub reminder_hours: Option<i32>,
}

pub async fn update_clinic(
    pool: &PgPool,
    user: &AuthUser,
    input: UpdateClinicInput,
) -> AppResult<Clinic> {
    crate::middleware::require_roles(user, &["clinic_admin"])?;
    let clinic_id = user.require_clinic()?;
    let mut tx = begin_tenant(pool, Some(clinic_id), user.is_super()).await?;

    let clinic = sqlx::query_as::<_, Clinic>(
        r#"
        UPDATE clinics SET
          name = COALESCE($2, name),
          logo_url = COALESCE($3, logo_url),
          city = COALESCE($4, city),
          address = COALESCE($5, address),
          reminder_hours = COALESCE($6, reminder_hours)
        WHERE id = $1
        RETURNING id, name, slug, logo_url, city, address, timezone, reminder_hours,
                  plan_id, subscription_status, subscription_ends_at, created_at
        "#,
    )
    .bind(clinic_id)
    .bind(input.name)
    .bind(input.logo_url)
    .bind(input.city)
    .bind(input.address)
    .bind(input.reminder_hours)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(clinic)
}

#[derive(Debug, serde::Deserialize)]
pub struct CreateDoctorInput {
    pub full_name: String,
    pub specialty: Option<String>,
    pub slot_minutes: Option<i32>,
}

pub async fn list_doctors(pool: &PgPool, user: &AuthUser) -> AppResult<Vec<Doctor>> {
    let clinic_id = user.require_clinic()?;
    let mut tx = begin_tenant(pool, Some(clinic_id), user.is_super()).await?;

    let rows = sqlx::query_as::<_, Doctor>(
        r#"
        SELECT id, clinic_id, user_id, full_name, specialty, slot_minutes, is_active, created_at
        FROM doctors WHERE clinic_id = $1 ORDER BY full_name
        "#,
    )
    .bind(clinic_id)
    .fetch_all(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(rows)
}

pub async fn create_doctor(
    pool: &PgPool,
    user: &AuthUser,
    input: CreateDoctorInput,
) -> AppResult<Doctor> {
    crate::middleware::require_roles(user, &["clinic_admin"])?;
    let clinic_id = user.require_clinic()?;
    let mut tx = begin_tenant(pool, Some(clinic_id), user.is_super()).await?;

    let doctor = sqlx::query_as::<_, Doctor>(
        r#"
        INSERT INTO doctors (clinic_id, full_name, specialty, slot_minutes)
        VALUES ($1, $2, $3, COALESCE($4, 30))
        RETURNING id, clinic_id, user_id, full_name, specialty, slot_minutes, is_active, created_at
        "#,
    )
    .bind(clinic_id)
    .bind(&input.full_name)
    .bind(&input.specialty)
    .bind(input.slot_minutes)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(doctor)
}

#[derive(Debug, serde::Deserialize)]
pub struct ScheduleInput {
    pub weekday: i16,
    pub start_time: NaiveTime,
    pub end_time: NaiveTime,
}

pub async fn set_schedule(
    pool: &PgPool,
    user: &AuthUser,
    doctor_id: Uuid,
    slots: Vec<ScheduleInput>,
) -> AppResult<Vec<DoctorSchedule>> {
    crate::middleware::require_roles(user, &["clinic_admin"])?;
    let clinic_id = user.require_clinic()?;
    let mut tx = begin_tenant(pool, Some(clinic_id), user.is_super()).await?;

    let exists: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM doctors WHERE id = $1 AND clinic_id = $2",
    )
    .bind(doctor_id)
    .bind(clinic_id)
    .fetch_optional(&mut *tx)
    .await?;

    if exists.is_none() {
        return Err(AppError::NotFound("الطبيب غير موجود".into()));
    }

    sqlx::query("DELETE FROM doctor_schedules WHERE doctor_id = $1")
        .bind(doctor_id)
        .execute(&mut *tx)
        .await?;

    let mut out = Vec::new();
    for s in slots {
        if s.weekday < 0 || s.weekday > 6 {
            return Err(AppError::BadRequest("weekday يجب أن يكون 0-6".into()));
        }
        let row = sqlx::query_as::<_, DoctorSchedule>(
            r#"
            INSERT INTO doctor_schedules (clinic_id, doctor_id, weekday, start_time, end_time)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, clinic_id, doctor_id, weekday, start_time, end_time
            "#,
        )
        .bind(clinic_id)
        .bind(doctor_id)
        .bind(s.weekday)
        .bind(s.start_time)
        .bind(s.end_time)
        .fetch_one(&mut *tx)
        .await?;
        out.push(row);
    }

    tx.commit().await?;
    Ok(out)
}

pub async fn get_schedule(
    pool: &PgPool,
    user: &AuthUser,
    doctor_id: Uuid,
) -> AppResult<Vec<DoctorSchedule>> {
    let clinic_id = user.require_clinic()?;
    let mut tx = begin_tenant(pool, Some(clinic_id), user.is_super()).await?;

    let rows = sqlx::query_as::<_, DoctorSchedule>(
        r#"
        SELECT id, clinic_id, doctor_id, weekday, start_time, end_time
        FROM doctor_schedules
        WHERE doctor_id = $1 AND clinic_id = $2
        ORDER BY weekday, start_time
        "#,
    )
    .bind(doctor_id)
    .bind(clinic_id)
    .fetch_all(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(rows)
}
