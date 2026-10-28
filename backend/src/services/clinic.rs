use chrono::{NaiveTime, Timelike};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    db::begin_tenant,
    error::{AppError, AppResult},
    middleware::AuthUser,
    models::{Clinic, Doctor, DoctorSchedule, StaffMember, StaffShift},
};

pub async fn get_my_clinic(pool: &PgPool, user: &AuthUser) -> AppResult<Clinic> {
    let clinic_id = user.require_clinic()?;
    let mut tx = begin_tenant(pool, Some(clinic_id), user.is_super()).await?;

    let clinic = sqlx::query_as::<_, Clinic>(
        r#"
        SELECT id, name, slug, logo_url, city, address, timezone, reminder_hours, channels,
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
    pub timezone: Option<String>,
    pub reminder_hours: Option<i32>,
    pub channels: Option<serde_json::Value>,
}

pub async fn update_clinic(
    pool: &PgPool,
    user: &AuthUser,
    input: UpdateClinicInput,
) -> AppResult<Clinic> {
    crate::middleware::require_roles(user, &["clinic_admin"])?;
    let clinic_id = user.require_clinic()?;
    if let Some(name) = &input.name {
        let name = name.trim();
        if name.is_empty() || name.chars().count() > 160 {
            return Err(AppError::BadRequest("اسم العيادة غير صالح".into()));
        }
    }
    if let Some(logo_url) = &input.logo_url {
        let logo_url = logo_url.trim();
        if !logo_url.is_empty()
            && !(logo_url.starts_with("https://") || logo_url.starts_with("http://"))
        {
            return Err(AppError::BadRequest("رابط الشعار يجب أن يبدأ بـ http أو https".into()));
        }
        if logo_url.len() > 2048 {
            return Err(AppError::BadRequest("رابط الشعار أطول من المسموح".into()));
        }
    }
    for (label, value, max_len) in [
        ("المدينة", input.city.as_deref(), 120),
        ("العنوان", input.address.as_deref(), 500),
    ] {
        if value.is_some_and(|value| value.trim().chars().count() > max_len) {
            return Err(AppError::BadRequest(format!("{label} أطول من المسموح")));
        }
    }
    if input.reminder_hours.is_some_and(|hours| hours != 4) {
        return Err(AppError::BadRequest("يتم إرسال التذكير قبل الموعد بأربع ساعات".into()));
    }
    if let Some(timezone) = &input.timezone {
        if timezone.parse::<chrono_tz::Tz>().is_err() {
            return Err(AppError::BadRequest("المنطقة الزمنية غير صالحة".into()));
        }
    }
    if let Some(channels) = &input.channels {
        let valid = channels.as_object().is_some_and(|values| {
            ["whatsapp", "instagram"].iter().all(|key| {
                values.get(*key).is_some_and(serde_json::Value::is_boolean)
            }) && values.keys().all(|key| ["whatsapp", "instagram"].contains(&key.as_str()))
        });
        if !valid {
            return Err(AppError::BadRequest(
                "إعداد القنوات يجب أن يحتوي على قيم منطقية لـ whatsapp وinstagram فقط".into(),
            ));
        }
    }
    let mut tx = begin_tenant(pool, Some(clinic_id), user.is_super()).await?;

    let clinic = sqlx::query_as::<_, Clinic>(
        r#"
        UPDATE clinics SET
          name = COALESCE($2, name),
          logo_url = CASE WHEN $3 = '' THEN NULL ELSE COALESCE($3, logo_url) END,
          city = COALESCE($4, city),
          address = COALESCE($5, address),
          reminder_hours = COALESCE($6, reminder_hours),
          timezone = COALESCE($7, timezone),
          channels = COALESCE($8, channels)
        WHERE id = $1
        RETURNING id, name, slug, logo_url, city, address, timezone, reminder_hours, channels,
                  plan_id, subscription_status, subscription_ends_at, created_at
        "#,
    )
    .bind(clinic_id)
    .bind(input.name.as_deref().map(str::trim))
    .bind(input.logo_url.as_deref().map(str::trim))
    .bind(input.city.as_deref().map(str::trim))
    .bind(input.address.as_deref().map(str::trim))
    .bind(input.reminder_hours)
    .bind(input.timezone)
    .bind(input.channels)
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
    pub capacity_per_slot: Option<i32>,
}

pub async fn list_doctors(pool: &PgPool, user: &AuthUser) -> AppResult<Vec<Doctor>> {
    let clinic_id = user.require_clinic()?;
    let mut tx = begin_tenant(pool, Some(clinic_id), user.is_super()).await?;

    let rows = sqlx::query_as::<_, Doctor>(
        r#"
        SELECT id, clinic_id, user_id, full_name, specialty, slot_minutes, capacity_per_slot,
               is_active, created_at
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
    validate_doctor(&input.full_name, input.specialty.as_deref(), input.slot_minutes, input.capacity_per_slot)?;
    let mut tx = begin_tenant(pool, Some(clinic_id), user.is_super()).await?;
    sqlx::query("SELECT id FROM clinics WHERE id = $1 FOR UPDATE")
        .bind(clinic_id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| AppError::NotFound("العيادة غير موجودة".into()))?;
    let (max_doctors, doctor_count): (Option<i32>, i64) = sqlx::query_as(
        r#"
        SELECT plans.max_doctors, COUNT(doctors.id)
        FROM clinics
        LEFT JOIN plans ON plans.id = clinics.plan_id
        LEFT JOIN doctors ON doctors.clinic_id = clinics.id
        WHERE clinics.id = $1
        GROUP BY plans.max_doctors
        "#,
    )
    .bind(clinic_id)
    .fetch_one(&mut *tx)
    .await?;
    if max_doctors.is_some_and(|limit| doctor_count >= i64::from(limit)) {
        return Err(AppError::Conflict(
            "وصلت العيادة إلى الحد الأقصى للأطباء في خطتها".into(),
        ));
    }

    let doctor = sqlx::query_as::<_, Doctor>(
        r#"
        INSERT INTO doctors (clinic_id, full_name, specialty, slot_minutes, capacity_per_slot)
        VALUES ($1, $2, $3, COALESCE($4, 30), COALESCE($5, 1))
        RETURNING id, clinic_id, user_id, full_name, specialty, slot_minutes, capacity_per_slot,
                  is_active, created_at
        "#,
    )
    .bind(clinic_id)
    .bind(input.full_name.trim())
    .bind(input.specialty.as_deref().map(str::trim))
    .bind(input.slot_minutes)
    .bind(input.capacity_per_slot)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(doctor)
}

#[derive(Debug, serde::Deserialize)]
pub struct UpdateDoctorInput {
    pub full_name: Option<String>,
    pub specialty: Option<String>,
    pub slot_minutes: Option<i32>,
    pub capacity_per_slot: Option<i32>,
    pub is_active: Option<bool>,
}

pub async fn update_doctor(
    pool: &PgPool,
    user: &AuthUser,
    doctor_id: Uuid,
    input: UpdateDoctorInput,
) -> AppResult<Doctor> {
    crate::middleware::require_roles(user, &["clinic_admin"])?;
    if let Some(name) = &input.full_name {
        validate_doctor(name, input.specialty.as_deref(), input.slot_minutes, input.capacity_per_slot)?;
    }
    if input.slot_minutes.is_some_and(|value| !(5..=240).contains(&value)) {
        return Err(AppError::BadRequest("مدة الموعد يجب أن تكون بين 5 و240 دقيقة".into()));
    }
    if input.capacity_per_slot.is_some_and(|value| !(1..=100).contains(&value)) {
        return Err(AppError::BadRequest("سعة الفترة يجب أن تكون بين 1 و100".into()));
    }
    if input.specialty.as_ref().is_some_and(|value| value.chars().count() > 120) {
        return Err(AppError::BadRequest("اسم التخصص أطول من المسموح".into()));
    }
    let clinic_id = user.require_clinic()?;
    let mut tx = begin_tenant(pool, Some(clinic_id), user.is_super()).await?;
    sqlx::query("SELECT pg_advisory_xact_lock($1)")
        .bind(crate::services::appointments::advisory_key(doctor_id))
        .execute(&mut *tx)
        .await?;
    sqlx::query("SELECT id FROM doctors WHERE id = $1 AND clinic_id = $2 FOR UPDATE")
        .bind(doctor_id)
        .bind(clinic_id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| AppError::NotFound("الطبيب غير موجود".into()))?;
    if let Some(capacity) = input.capacity_per_slot {
        let over_capacity: bool = sqlx::query_scalar(
            r#"
            SELECT EXISTS (
              SELECT 1
              FROM appointments a
              WHERE a.doctor_id = $1
                AND a.status IN ('pending', 'confirmed', 'waiting')
                AND (
                  SELECT COUNT(*)
                  FROM appointments b
                  WHERE b.doctor_id = a.doctor_id
                    AND b.status IN ('pending', 'confirmed', 'waiting')
                    AND tstzrange(b.starts_at, b.ends_at, '[)')
                        && tstzrange(a.starts_at, a.ends_at, '[)')
                ) > $2
            )
            "#,
        )
        .bind(doctor_id)
        .bind(capacity)
        .fetch_one(&mut *tx)
        .await?;
        if over_capacity {
            return Err(AppError::Conflict(
                "لا يمكن خفض السعة إلى أقل من عدد الحجوزات الحالية".into(),
            ));
        }
    }
    let doctor = sqlx::query_as::<_, Doctor>(
        r#"
        UPDATE doctors SET
          full_name = COALESCE($3, full_name),
          specialty = CASE WHEN $4 = '' THEN NULL ELSE COALESCE($4, specialty) END,
          slot_minutes = COALESCE($5, slot_minutes),
          capacity_per_slot = COALESCE($6, capacity_per_slot),
          is_active = COALESCE($7, is_active)
        WHERE id = $1 AND clinic_id = $2
        RETURNING id, clinic_id, user_id, full_name, specialty, slot_minutes, capacity_per_slot,
                  is_active, created_at
        "#,
    )
    .bind(doctor_id)
    .bind(clinic_id)
    .bind(input.full_name.as_deref().map(str::trim))
    .bind(input.specialty.as_deref().map(str::trim))
    .bind(input.slot_minutes)
    .bind(input.capacity_per_slot)
    .bind(input.is_active)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("الطبيب غير موجود".into()))?;
    tx.commit().await?;
    Ok(doctor)
}

fn validate_doctor(
    full_name: &str,
    specialty: Option<&str>,
    slot_minutes: Option<i32>,
    capacity_per_slot: Option<i32>,
) -> AppResult<()> {
    if full_name.trim().is_empty() || full_name.trim().chars().count() > 120 {
        return Err(AppError::BadRequest("اسم الطبيب غير صالح".into()));
    }
    if specialty.is_some_and(|value| value.trim().chars().count() > 120) {
        return Err(AppError::BadRequest("اسم التخصص أطول من المسموح".into()));
    }
    if slot_minutes.is_some_and(|value| !(5..=240).contains(&value)) {
        return Err(AppError::BadRequest("مدة الموعد يجب أن تكون بين 5 و240 دقيقة".into()));
    }
    if capacity_per_slot.is_some_and(|value| !(1..=100).contains(&value)) {
        return Err(AppError::BadRequest("سعة الفترة يجب أن تكون بين 1 و100".into()));
    }
    Ok(())
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
    if slots.len() > 70 {
        return Err(AppError::BadRequest("عدد فترات العمل أكبر من المسموح".into()));
    }
    let mut tx = begin_tenant(pool, Some(clinic_id), user.is_super()).await?;
    sqlx::query("SELECT pg_advisory_xact_lock($1)")
        .bind(crate::services::appointments::advisory_key(doctor_id))
        .execute(&mut *tx)
        .await?;

    for (index, slot) in slots.iter().enumerate() {
        if !(0..=6).contains(&slot.weekday)
            || slot.start_time >= slot.end_time
            || slot.start_time.second() != 0
            || slot.end_time.second() != 0
            || slot.start_time.nanosecond() != 0
            || slot.end_time.nanosecond() != 0
        {
            return Err(AppError::BadRequest("تأكد من اليوم ووقت بداية ونهاية الفترة".into()));
        }
        if slots.iter().skip(index + 1).any(|other| {
            other.weekday == slot.weekday
                && slot.start_time < other.end_time
                && other.start_time < slot.end_time
        }) {
            return Err(AppError::BadRequest("فترات عمل الطبيب لا يمكن أن تتداخل".into()));
        }
    }

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

    sqlx::query("DELETE FROM doctor_schedules WHERE doctor_id = $1 AND clinic_id = $2")
        .bind(doctor_id)
        .bind(clinic_id)
        .execute(&mut *tx)
        .await?;

    let mut out = Vec::new();
    for s in slots {
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

#[derive(Debug, serde::Deserialize)]
pub struct CreateStaffInput {
    pub email: String,
    pub full_name: String,
    pub phone: Option<String>,
    pub role: String,
    pub password: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct UpdateStaffInput {
    pub full_name: Option<String>,
    pub phone: Option<String>,
    pub role: Option<String>,
    pub is_active: Option<bool>,
}

pub async fn list_staff(pool: &PgPool, user: &AuthUser) -> AppResult<Vec<StaffMember>> {
    crate::middleware::require_roles(user, &["clinic_admin"])?;
    let clinic_id = user.require_clinic()?;
    let mut tx = begin_tenant(pool, Some(clinic_id), user.is_super()).await?;
    let rows = sqlx::query_as::<_, StaffMember>(
        r#"
        SELECT id, clinic_id, email, full_name, phone, role::text AS role, is_active, created_at
        FROM users WHERE clinic_id = $1 AND role <> 'clinic_admin'
        ORDER BY full_name
        "#,
    )
    .bind(clinic_id)
    .fetch_all(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(rows)
}

pub async fn create_staff(
    pool: &PgPool,
    user: &AuthUser,
    input: CreateStaffInput,
) -> AppResult<StaffMember> {
    crate::middleware::require_roles(user, &["clinic_admin"])?;
    let email = crate::services::auth::normalize_email(&input.email)?;
    let full_name = input.full_name.trim();
    let phone = input.phone.as_deref().map(str::trim).filter(|value| !value.is_empty());
    if !email.contains('@') || email.len() > 254 || email.chars().any(char::is_whitespace) {
        return Err(AppError::BadRequest("البريد الإلكتروني غير صالح".into()));
    }
    if full_name.is_empty() || full_name.chars().count() > 120 {
        return Err(AppError::BadRequest("اسم الموظف غير صالح".into()));
    }
    if phone.is_some_and(|value| value.chars().count() > 32) {
        return Err(AppError::BadRequest("رقم الهاتف غير صالح".into()));
    }
    if input.password.chars().count() < 12 || input.password.len() > 1024 {
        return Err(AppError::BadRequest("كلمة المرور يجب أن تكون 12 حرفاً على الأقل".into()));
    }
    validate_staff_role(&input.role)?;
    let clinic_id = user.require_clinic()?;
    let password_hash = crate::auth::hash_password(&input.password)?;
    let mut tx = begin_tenant(pool, Some(clinic_id), user.is_super()).await?;
    let staff = sqlx::query_as::<_, StaffMember>(
        r#"
        INSERT INTO users (clinic_id, email, password_hash, full_name, phone, role)
        VALUES ($1, $2, $3, $4, $5, $6::user_role)
        RETURNING id, clinic_id, email, full_name, phone, role::text AS role, is_active, created_at
        "#,
    )
    .bind(clinic_id)
    .bind(email)
    .bind(password_hash)
    .bind(full_name)
    .bind(phone)
    .bind(&input.role)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_staff_insert_error)?;
    tx.commit().await?;
    Ok(staff)
}

pub async fn update_staff(
    pool: &PgPool,
    user: &AuthUser,
    staff_id: Uuid,
    input: UpdateStaffInput,
) -> AppResult<StaffMember> {
    crate::middleware::require_roles(user, &["clinic_admin"])?;
    if input.full_name.as_ref().is_some_and(|name| {
        name.trim().is_empty() || name.trim().chars().count() > 120
    }) {
        return Err(AppError::BadRequest("اسم الموظف غير صالح".into()));
    }
    if input.phone.as_ref().is_some_and(|phone| phone.chars().count() > 32) {
        return Err(AppError::BadRequest("رقم الهاتف غير صالح".into()));
    }
    if let Some(role) = &input.role {
        validate_staff_role(role)?;
    }
    let clinic_id = user.require_clinic()?;
    let mut tx = begin_tenant(pool, Some(clinic_id), user.is_super()).await?;
    let staff = sqlx::query_as::<_, StaffMember>(
        r#"
        UPDATE users SET
          full_name = COALESCE($3, full_name),
          phone = CASE WHEN $4 = '' THEN NULL ELSE COALESCE($4, phone) END,
          role = COALESCE($5::user_role, role),
          is_active = COALESCE($6, is_active)
        WHERE id = $1 AND clinic_id = $2 AND role <> 'clinic_admin'
        RETURNING id, clinic_id, email, full_name, phone, role::text AS role, is_active, created_at
        "#,
    )
    .bind(staff_id)
    .bind(clinic_id)
    .bind(input.full_name.as_deref().map(str::trim))
    .bind(input.phone.as_deref().map(str::trim))
    .bind(input.role)
    .bind(input.is_active)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("الموظف غير موجود".into()))?;
    tx.commit().await?;
    Ok(staff)
}

fn validate_staff_role(role: &str) -> AppResult<()> {
    if !matches!(role, "doctor" | "receptionist") {
        return Err(AppError::BadRequest("صلاحية الموظف يجب أن تكون طبيباً أو استقبالاً".into()));
    }
    Ok(())
}

fn map_staff_insert_error(error: sqlx::Error) -> AppError {
    match error {
        sqlx::Error::Database(db) if db.constraint().is_some_and(|name| name.contains("email")) => {
            AppError::Conflict("البريد الإلكتروني مستخدم مسبقاً".into())
        }
        other => AppError::from(other),
    }
}

#[derive(Debug, serde::Deserialize)]
pub struct StaffShiftInput {
    pub weekday: i16,
    pub start_time: NaiveTime,
    pub end_time: NaiveTime,
}

pub async fn get_staff_shifts(
    pool: &PgPool,
    user: &AuthUser,
    staff_id: Uuid,
) -> AppResult<Vec<StaffShift>> {
    crate::middleware::require_roles(user, &["clinic_admin"])?;
    let clinic_id = user.require_clinic()?;
    let mut tx = begin_tenant(pool, Some(clinic_id), user.is_super()).await?;
    ensure_staff(&mut tx, staff_id, clinic_id).await?;
    let shifts = sqlx::query_as::<_, StaffShift>(
        "SELECT id, clinic_id, user_id, weekday, start_time, end_time FROM staff_shifts WHERE user_id = $1 AND clinic_id = $2 ORDER BY weekday, start_time",
    )
    .bind(staff_id)
    .bind(clinic_id)
    .fetch_all(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(shifts)
}

pub async fn set_staff_shifts(
    pool: &PgPool,
    user: &AuthUser,
    staff_id: Uuid,
    shifts: Vec<StaffShiftInput>,
) -> AppResult<Vec<StaffShift>> {
    crate::middleware::require_roles(user, &["clinic_admin"])?;
    if shifts.len() > 70 {
        return Err(AppError::BadRequest("عدد الورديات أكبر من المسموح".into()));
    }
    let clinic_id = user.require_clinic()?;
    for (index, shift) in shifts.iter().enumerate() {
        if !(0..=6).contains(&shift.weekday)
            || shift.start_time >= shift.end_time
            || shift.start_time.second() != 0
            || shift.end_time.second() != 0
            || shift.start_time.nanosecond() != 0
            || shift.end_time.nanosecond() != 0
        {
            return Err(AppError::BadRequest("تأكد من اليوم ووقت بداية ونهاية الوردية".into()));
        }
        if shifts.iter().skip(index + 1).any(|other| {
            other.weekday == shift.weekday
                && shift.start_time < other.end_time
                && other.start_time < shift.end_time
        }) {
            return Err(AppError::BadRequest("ورديات الموظف لا يمكن أن تتداخل".into()));
        }
    }
    let mut tx = begin_tenant(pool, Some(clinic_id), user.is_super()).await?;
    ensure_staff(&mut tx, staff_id, clinic_id).await?;
    sqlx::query("DELETE FROM staff_shifts WHERE user_id = $1 AND clinic_id = $2")
        .bind(staff_id)
        .bind(clinic_id)
        .execute(&mut *tx)
        .await?;
    let mut result = Vec::with_capacity(shifts.len());
    for shift in shifts {
        result.push(sqlx::query_as::<_, StaffShift>(
            r#"
            INSERT INTO staff_shifts (clinic_id, user_id, weekday, start_time, end_time)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, clinic_id, user_id, weekday, start_time, end_time
            "#,
        )
        .bind(clinic_id)
        .bind(staff_id)
        .bind(shift.weekday)
        .bind(shift.start_time)
        .bind(shift.end_time)
        .fetch_one(&mut *tx)
        .await?);
    }
    tx.commit().await?;
    Ok(result)
}

async fn ensure_staff(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    staff_id: Uuid,
    clinic_id: Uuid,
) -> AppResult<()> {
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM users WHERE id = $1 AND clinic_id = $2 AND role <> 'clinic_admin')",
    )
    .bind(staff_id)
    .bind(clinic_id)
    .fetch_one(&mut **tx)
    .await?;
    if !exists {
        return Err(AppError::NotFound("الموظف غير موجود".into()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{validate_doctor, validate_staff_role};

    #[test]
    fn validates_doctor_slot_and_capacity_limits() {
        assert!(validate_doctor("د. سارة", Some("أسنان"), Some(30), Some(2)).is_ok());
        assert!(validate_doctor(" ", None, Some(30), Some(1)).is_err());
        assert!(validate_doctor("طبيب", None, Some(4), Some(1)).is_err());
        assert!(validate_doctor("طبيب", None, Some(30), Some(101)).is_err());
    }

    #[test]
    fn only_staff_roles_can_be_assigned() {
        assert!(validate_staff_role("doctor").is_ok());
        assert!(validate_staff_role("receptionist").is_ok());
        assert!(validate_staff_role("clinic_admin").is_err());
        assert!(validate_staff_role("super_admin").is_err());
    }
}
