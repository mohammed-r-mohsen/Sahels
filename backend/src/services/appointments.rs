use chrono::{
    DateTime, Datelike, Duration, LocalResult, NaiveDate, NaiveTime, TimeZone, Timelike, Utc,
};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    db::begin_tenant,
    error::{AppError, AppResult},
    middleware::AuthUser,
    models::{Appointment, Patient},
    services::waiting_list,
};

#[derive(Debug, serde::Deserialize)]
pub struct CreateAppointmentInput {
    pub doctor_id: Uuid,
    pub patient_phone: String,
    pub patient_name: Option<String>,
    pub starts_at: DateTime<Utc>,
    pub service: Option<String>,
    pub source: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, serde::Serialize)]
pub struct Slot {
    pub starts_at: DateTime<Utc>,
    pub ends_at: DateTime<Utc>,
}

pub async fn availability(
    pool: &PgPool,
    user: &AuthUser,
    doctor_id: Uuid,
    date: NaiveDate,
) -> AppResult<Vec<Slot>> {
    let clinic_id = user.require_clinic()?;
    let mut tx = begin_tenant(pool, Some(clinic_id), user.is_super()).await?;
    let clinic_timezone: String =
        sqlx::query_scalar("SELECT timezone FROM clinics WHERE id = $1")
            .bind(clinic_id)
            .fetch_one(&mut *tx)
            .await?;
    let timezone: chrono_tz::Tz = clinic_timezone
        .parse()
        .map_err(|_| AppError::Other(anyhow::anyhow!("invalid clinic timezone")))?;

    let doctor = sqlx::query_as::<_, (i32, i32)>(
        "SELECT slot_minutes, capacity_per_slot FROM doctors WHERE id = $1 AND clinic_id = $2 AND is_active",
    )
    .bind(doctor_id)
    .bind(clinic_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("الطبيب غير موجود".into()))?;

    let slot_minutes = doctor.0;
    let capacity = doctor.1;
    let weekday = date.weekday().num_days_from_sunday() as i16;

    let schedules: Vec<(NaiveTime, NaiveTime)> = sqlx::query_as(
        r#"
        SELECT start_time, end_time FROM doctor_schedules
        WHERE doctor_id = $1 AND weekday = $2
        ORDER BY start_time
        "#,
    )
    .bind(doctor_id)
    .bind(weekday)
    .fetch_all(&mut *tx)
    .await?;

    let next_date = date
        .succ_opt()
        .ok_or_else(|| AppError::BadRequest("التاريخ غير صالح".into()))?;
    let day_start = local_datetime_to_utc(&timezone, date, NaiveTime::MIN);
    let day_end = local_datetime_to_utc(&timezone, next_date, NaiveTime::MIN);
    let (Some(day_start), Some(day_end)) = (day_start, day_end) else {
        tx.commit().await?;
        return Ok(Vec::new());
    };

    let booked: Vec<(DateTime<Utc>, DateTime<Utc>)> = sqlx::query_as(
        r#"
        SELECT starts_at, ends_at FROM appointments
        WHERE doctor_id = $1
          AND starts_at >= $2 AND starts_at < $3
          AND status IN ('pending','confirmed','waiting')
        "#,
    )
    .bind(doctor_id)
    .bind(day_start)
    .bind(day_end)
    .fetch_all(&mut *tx)
    .await?;

    tx.commit().await?;

    let mut slots = Vec::new();
    for (start_t, end_t) in schedules {
        let mut local_cursor = date.and_time(start_t);
        let local_window_end = date.and_time(end_t);
        let step = Duration::minutes(slot_minutes as i64);

        while local_cursor + step <= local_window_end {
            let local_end = local_cursor + step;
            let Some(cursor) = local_datetime_to_utc(&timezone, date, local_cursor.time()) else {
                local_cursor += step;
                continue;
            };
            let Some(ends) = local_datetime_to_utc(&timezone, date, local_end.time()) else {
                local_cursor += step;
                continue;
            };
            let overlapping_bookings = booked
                .iter()
                .filter(|(b_start, b_end)| cursor < *b_end && ends > *b_start)
                .count();
            if overlapping_bookings < capacity as usize && cursor > Utc::now() {
                slots.push(Slot {
                    starts_at: cursor,
                    ends_at: ends,
                });
            }
            local_cursor += step;
        }
    }

    Ok(slots)
}

pub async fn create(
    pool: &PgPool,
    user: &AuthUser,
    input: CreateAppointmentInput,
) -> AppResult<Appointment> {
    let clinic_id = user.require_clinic()?;
    let mut tx = begin_tenant(pool, Some(clinic_id), user.is_super()).await?;
    let clinic_timezone: String =
        sqlx::query_scalar("SELECT timezone FROM clinics WHERE id = $1")
            .bind(clinic_id)
            .fetch_one(&mut *tx)
            .await?;
    let timezone: chrono_tz::Tz = clinic_timezone
        .parse()
        .map_err(|_| AppError::Other(anyhow::anyhow!("invalid clinic timezone")))?;

    let status: String =
        sqlx::query_scalar("SELECT subscription_status FROM clinics WHERE id = $1")
            .bind(clinic_id)
            .fetch_one(&mut *tx)
            .await?;
    match status.as_str() {
        "active" | "trial" | "past_due" => {}
        _ => return Err(AppError::SubscriptionInactive),
    }

    // Advisory lock keyed by doctor to prevent double-booking races
    let lock_key = advisory_key(input.doctor_id);
    sqlx::query("SELECT pg_advisory_xact_lock($1)")
        .bind(lock_key)
        .execute(&mut *tx)
        .await?;

    let doctor: (i32, i32) = sqlx::query_as(
        "SELECT slot_minutes, capacity_per_slot FROM doctors WHERE id = $1 AND clinic_id = $2 AND is_active",
    )
    .bind(input.doctor_id)
    .bind(clinic_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("الطبيب غير موجود".into()))?;

    let slot_minutes = doctor.0;
    let capacity = doctor.1;
    if input.starts_at.second() != 0 || input.starts_at.nanosecond() != 0 {
        return Err(AppError::BadRequest("يجب أن يبدأ الموعد على حدّ الدقيقة".into()));
    }
    let ends_at = input.starts_at + Duration::minutes(slot_minutes as i64);

    // Validate against schedule
    let local_start = input.starts_at.with_timezone(&timezone);
    let local_end = ends_at.with_timezone(&timezone);
    let local_date = local_start.date_naive();
    let weekday = local_date.weekday().num_days_from_sunday() as i16;
    let start_time = NaiveTime::from_hms_opt(
        local_start.hour(),
        local_start.minute(),
        0,
    )
    .unwrap();
    if local_end.date_naive() != local_date {
        return Err(AppError::BadRequest(
            "لا يمكن أن يمتد الموعد خارج يوم عمل الطبيب".into(),
        ));
    }
    let end_time = NaiveTime::from_hms_opt(local_end.hour(), local_end.minute(), 0).unwrap();

    let schedules: Vec<(NaiveTime, NaiveTime)> = sqlx::query_as(
        r#"
        SELECT start_time, end_time FROM doctor_schedules
        WHERE doctor_id = $1 AND weekday = $2
          AND start_time <= $3 AND end_time >= $4
        "#,
    )
    .bind(input.doctor_id)
    .bind(weekday)
    .bind(start_time)
    .bind(end_time)
    .fetch_all(&mut *tx)
    .await?;

    let aligned = schedules.iter().any(|(schedule_start, _)| {
        start_time
            .signed_duration_since(*schedule_start)
            .num_seconds()
            % (slot_minutes as i64 * 60)
            == 0
    });
    if !aligned {
        return Err(AppError::BadRequest(
            "الوقت خارج أوقات عمل الطبيب أو لا يطابق بداية فترة حجز".into(),
        ));
    }

    let overlapping_bookings: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM appointments
        WHERE doctor_id = $1
          AND status IN ('pending','confirmed','waiting')
          AND tstzrange(starts_at, ends_at, '[)') && tstzrange($2, $3, '[)')
        "#,
    )
    .bind(input.doctor_id)
    .bind(input.starts_at)
    .bind(ends_at)
    .fetch_one(&mut *tx)
    .await?;

    if overlapping_bookings >= i64::from(capacity) {
        return Err(AppError::Conflict("الموعد محجوز مسبقاً".into()));
    }

    let patient = upsert_patient(
        &mut tx,
        clinic_id,
        &input.patient_phone,
        input.patient_name.as_deref(),
        input.source.as_deref().unwrap_or("admin"),
    )
    .await?;

    let source = input.source.unwrap_or_else(|| "admin".into());
    let appt = sqlx::query_as::<_, Appointment>(
        r#"
        INSERT INTO appointments
          (clinic_id, doctor_id, patient_id, starts_at, ends_at, status, source, service, notes)
        VALUES ($1,$2,$3,$4,$5,'confirmed',$6,$7,$8)
        RETURNING id, clinic_id, doctor_id, patient_id, starts_at, ends_at,
                  status::text as status, source, service, reminder_sent, notes, created_at
        "#,
    )
    .bind(clinic_id)
    .bind(input.doctor_id)
    .bind(patient.id)
    .bind(input.starts_at)
    .bind(ends_at)
    .bind(&source)
    .bind(&input.service)
    .bind(&input.notes)
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO audit_logs (clinic_id, actor_id, action, entity, entity_id)
        VALUES ($1, $2, 'appointment.create', 'appointment', $3)
        "#,
    )
    .bind(clinic_id)
    .bind(user.user_id)
    .bind(appt.id.to_string())
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(appt)
}

pub async fn list(
    pool: &PgPool,
    user: &AuthUser,
    from: Option<DateTime<Utc>>,
    to: Option<DateTime<Utc>>,
) -> AppResult<Vec<Appointment>> {
    let clinic_id = user.require_clinic()?;
    let mut tx = begin_tenant(pool, Some(clinic_id), user.is_super()).await?;

    let from = from.unwrap_or_else(|| Utc::now() - Duration::days(1));
    let to = to.unwrap_or_else(|| Utc::now() + Duration::days(14));

    let rows = sqlx::query_as::<_, Appointment>(
        r#"
        SELECT id, clinic_id, doctor_id, patient_id, starts_at, ends_at,
               status::text as status, source, service, reminder_sent, notes, created_at
        FROM appointments
        WHERE clinic_id = $1 AND starts_at >= $2 AND starts_at < $3
        ORDER BY starts_at
        "#,
    )
    .bind(clinic_id)
    .bind(from)
    .bind(to)
    .fetch_all(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(rows)
}

pub async fn update_status(
    pool: &PgPool,
    user: &AuthUser,
    appointment_id: Uuid,
    status: &str,
) -> AppResult<Appointment> {
    let allowed = [
        "pending",
        "confirmed",
        "waiting",
        "completed",
        "no_show",
        "cancelled",
    ];
    if !allowed.contains(&status) {
        return Err(AppError::BadRequest("حالة غير صالحة".into()));
    }

    let clinic_id = user.require_clinic()?;
    let mut tx = begin_tenant(pool, Some(clinic_id), user.is_super()).await?;

    let existing: Option<(Uuid, DateTime<Utc>, DateTime<Utc>, String)> = sqlx::query_as(
        r#"
        SELECT doctor_id, starts_at, ends_at, status::text
        FROM appointments
        WHERE id = $1 AND clinic_id = $2
        FOR UPDATE
        "#,
    )
    .bind(appointment_id)
    .bind(clinic_id)
    .fetch_optional(&mut *tx)
    .await?;
    let (doctor_id, starts_at, ends_at, previous_status) =
        existing.ok_or_else(|| AppError::NotFound("الموعد غير موجود".into()))?;

    sqlx::query("SELECT pg_advisory_xact_lock($1)")
        .bind(advisory_key(doctor_id))
        .execute(&mut *tx)
        .await?;

    if matches!(status, "pending" | "confirmed" | "waiting")
        && !matches!(previous_status.as_str(), "pending" | "confirmed" | "waiting")
    {
        let capacity: i32 = sqlx::query_scalar("SELECT capacity_per_slot FROM doctors WHERE id = $1 AND clinic_id = $2")
            .bind(doctor_id)
            .bind(clinic_id)
            .fetch_one(&mut *tx)
            .await?;
        let overlapping: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(*) FROM appointments
            WHERE doctor_id = $1 AND id <> $2
              AND status IN ('pending', 'confirmed', 'waiting')
              AND tstzrange(starts_at, ends_at, '[)') && tstzrange($3, $4, '[)')
            "#,
        )
        .bind(doctor_id)
        .bind(appointment_id)
        .bind(starts_at)
        .bind(ends_at)
        .fetch_one(&mut *tx)
        .await?;
        if overlapping >= i64::from(capacity) {
            return Err(AppError::Conflict(
                "لا يمكن إعادة تفعيل الموعد لأن سعة الطبيب ممتلئة".into(),
            ));
        }
    }

    let appt = sqlx::query_as::<_, Appointment>(
        r#"
        UPDATE appointments
        SET status = $3::appointment_status
        WHERE id = $1 AND clinic_id = $2
        RETURNING id, clinic_id, doctor_id, patient_id, starts_at, ends_at,
                  status::text as status, source, service, reminder_sent, notes, created_at
        "#,
    )
    .bind(appointment_id)
    .bind(clinic_id)
    .bind(status)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("الموعد غير موجود".into()))?;

    if status == "cancelled"
        && matches!(previous_status.as_str(), "pending" | "confirmed" | "waiting")
    {
        waiting_list::promote_on_cancel(&mut tx, clinic_id, appt.doctor_id, appt.starts_at).await?;
    }

    if status == "no_show" && previous_status != "no_show" {
        sqlx::query(
            "UPDATE patients SET no_show_count = no_show_count + 1 WHERE id = $1",
        )
        .bind(appt.patient_id)
        .execute(&mut *tx)
        .await?;
    }

    if status == "completed" && previous_status != "completed" {
        sqlx::query("UPDATE patients SET visit_count = visit_count + 1 WHERE id = $1")
            .bind(appt.patient_id)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;
    Ok(appt)
}

async fn upsert_patient(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    clinic_id: Uuid,
    phone: &str,
    name: Option<&str>,
    source: &str,
) -> AppResult<Patient> {
    let patient = sqlx::query_as::<_, Patient>(
        r#"
        INSERT INTO patients (clinic_id, phone, full_name, source)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (clinic_id, phone) DO UPDATE
          SET full_name = COALESCE(EXCLUDED.full_name, patients.full_name)
        RETURNING id, clinic_id, full_name, phone, source, notes,
                  no_show_count, visit_count, created_at
        "#,
    )
    .bind(clinic_id)
    .bind(phone)
    .bind(name)
    .bind(source)
    .fetch_one(&mut **tx)
    .await?;
    Ok(patient)
}

pub(crate) fn advisory_key(doctor_id: Uuid) -> i64 {
    let bytes = doctor_id.as_bytes();
    i64::from_be_bytes([
        bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
    ])
}

fn local_datetime_to_utc(
    timezone: &chrono_tz::Tz,
    date: NaiveDate,
    time: NaiveTime,
) -> Option<DateTime<Utc>> {
    match timezone.from_local_datetime(&date.and_time(time)) {
        LocalResult::Single(value) => Some(value.with_timezone(&Utc)),
        LocalResult::Ambiguous(first, second) => {
            Some(first.min(second).with_timezone(&Utc))
        }
        LocalResult::None => None,
    }
}
