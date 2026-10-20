use axum::{
    Json, Router,
    extract::{Path, Query, State},
    routing::{get, patch, post},
};
use chrono::{DateTime, NaiveDate, Utc};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    error::AppResult,
    middleware::AuthUser,
    services::{appointments as appt_svc, waiting_list},
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/availability", get(availability))
        .route("/{id}/status", patch(update_status))
        .route("/waiting-list", get(list_wait).post(add_wait))
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub from: Option<DateTime<Utc>>,
    pub to: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct AvailQuery {
    pub doctor_id: Uuid,
    pub date: NaiveDate,
}

#[derive(Debug, Deserialize)]
pub struct StatusBody {
    pub status: String,
}

async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<ListQuery>,
) -> AppResult<Json<Vec<crate::models::Appointment>>> {
    Ok(Json(
        appt_svc::list(&state.db, &user, q.from, q.to).await?,
    ))
}

async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<appt_svc::CreateAppointmentInput>,
) -> AppResult<Json<crate::models::Appointment>> {
    Ok(Json(appt_svc::create(&state.db, &user, body).await?))
}

async fn availability(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<AvailQuery>,
) -> AppResult<Json<Vec<appt_svc::Slot>>> {
    Ok(Json(
        appt_svc::availability(&state.db, &user, q.doctor_id, q.date).await?,
    ))
}

async fn update_status(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<StatusBody>,
) -> AppResult<Json<crate::models::Appointment>> {
    Ok(Json(
        appt_svc::update_status(&state.db, &user, id, &body.status).await?,
    ))
}

async fn list_wait(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<Vec<crate::models::WaitingListEntry>>> {
    Ok(Json(waiting_list::list(&state.db, &user).await?))
}

async fn add_wait(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<waiting_list::AddWaitInput>,
) -> AppResult<Json<crate::models::WaitingListEntry>> {
    Ok(Json(waiting_list::add(&state.db, &user, body).await?))
}
