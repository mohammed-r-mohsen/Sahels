use chrono::{DateTime, NaiveDate, NaiveTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Clinic {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub logo_url: Option<String>,
    pub city: Option<String>,
    pub address: Option<String>,
    pub timezone: String,
    pub reminder_hours: i32,
    pub plan_id: Option<String>,
    pub subscription_status: String,
    pub subscription_ends_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct UserRow {
    pub id: Uuid,
    pub clinic_id: Option<Uuid>,
    pub email: String,
    pub password_hash: String,
    pub full_name: String,
    pub phone: Option<String>,
    pub role: String,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPublic {
    pub id: Uuid,
    pub clinic_id: Option<Uuid>,
    pub email: String,
    pub full_name: String,
    pub phone: Option<String>,
    pub role: String,
}

impl From<UserRow> for UserPublic {
    fn from(u: UserRow) -> Self {
        Self {
            id: u.id,
            clinic_id: u.clinic_id,
            email: u.email,
            full_name: u.full_name,
            phone: u.phone,
            role: u.role,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Doctor {
    pub id: Uuid,
    pub clinic_id: Uuid,
    pub user_id: Option<Uuid>,
    pub full_name: String,
    pub specialty: Option<String>,
    pub slot_minutes: i32,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct DoctorSchedule {
    pub id: Uuid,
    pub clinic_id: Uuid,
    pub doctor_id: Uuid,
    pub weekday: i16,
    pub start_time: NaiveTime,
    pub end_time: NaiveTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Patient {
    pub id: Uuid,
    pub clinic_id: Uuid,
    pub full_name: Option<String>,
    pub phone: String,
    pub source: Option<String>,
    pub notes: Option<String>,
    pub no_show_count: i32,
    pub visit_count: i32,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Appointment {
    pub id: Uuid,
    pub clinic_id: Uuid,
    pub doctor_id: Uuid,
    pub patient_id: Uuid,
    pub starts_at: DateTime<Utc>,
    pub ends_at: DateTime<Utc>,
    pub status: String,
    pub source: String,
    pub service: Option<String>,
    pub reminder_sent: bool,
    pub notes: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct WaitingListEntry {
    pub id: Uuid,
    pub clinic_id: Uuid,
    pub doctor_id: Option<Uuid>,
    pub patient_id: Uuid,
    pub desired_date: Option<NaiveDate>,
    pub preferred_time: Option<NaiveTime>,
    pub service: Option<String>,
    pub priority: i32,
    pub status: String,
    pub created_at: DateTime<Utc>,
}
