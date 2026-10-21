use axum::{
    Json, Router,
    extract::{Path, State},
    routing::{get, post, put},
};
use uuid::Uuid;

use crate::{
    error::AppResult,
    middleware::AuthUser,
    services::clinic as clinic_svc,
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(get_clinic).put(update_clinic))
        .route("/doctors", get(list_doctors).post(create_doctor))
        .route("/doctors/{id}", put(update_doctor))
        .route(
            "/doctors/{id}/schedule",
            get(get_schedule).put(set_schedule),
        )
        .route("/staff", get(list_staff).post(create_staff))
        .route("/staff/{id}", put(update_staff))
        .route(
            "/staff/{id}/shifts",
            get(get_staff_shifts).put(set_staff_shifts),
        )
}

async fn update_doctor(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<clinic_svc::UpdateDoctorInput>,
) -> AppResult<Json<crate::models::Doctor>> {
    Ok(Json(
        clinic_svc::update_doctor(&state.db, &user, id, body).await?,
    ))
}

async fn list_staff(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<Vec<crate::models::StaffMember>>> {
    Ok(Json(clinic_svc::list_staff(&state.db, &user).await?))
}

async fn create_staff(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<clinic_svc::CreateStaffInput>,
) -> AppResult<(axum::http::StatusCode, Json<crate::models::StaffMember>)> {
    Ok((
        axum::http::StatusCode::CREATED,
        Json(clinic_svc::create_staff(&state.db, &user, body).await?),
    ))
}

async fn update_staff(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<clinic_svc::UpdateStaffInput>,
) -> AppResult<Json<crate::models::StaffMember>> {
    Ok(Json(
        clinic_svc::update_staff(&state.db, &user, id, body).await?,
    ))
}

async fn get_staff_shifts(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Vec<crate::models::StaffShift>>> {
    Ok(Json(
        clinic_svc::get_staff_shifts(&state.db, &user, id).await?,
    ))
}

async fn set_staff_shifts(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<Vec<clinic_svc::StaffShiftInput>>,
) -> AppResult<Json<Vec<crate::models::StaffShift>>> {
    Ok(Json(
        clinic_svc::set_staff_shifts(&state.db, &user, id, body).await?,
    ))
}

async fn get_clinic(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<crate::models::Clinic>> {
    Ok(Json(clinic_svc::get_my_clinic(&state.db, &user).await?))
}

async fn update_clinic(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<clinic_svc::UpdateClinicInput>,
) -> AppResult<Json<crate::models::Clinic>> {
    Ok(Json(
        clinic_svc::update_clinic(&state.db, &user, body).await?,
    ))
}

async fn list_doctors(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<Vec<crate::models::Doctor>>> {
    Ok(Json(clinic_svc::list_doctors(&state.db, &user).await?))
}

async fn create_doctor(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<clinic_svc::CreateDoctorInput>,
) -> AppResult<Json<crate::models::Doctor>> {
    Ok(Json(
        clinic_svc::create_doctor(&state.db, &user, body).await?,
    ))
}

async fn get_schedule(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Vec<crate::models::DoctorSchedule>>> {
    Ok(Json(
        clinic_svc::get_schedule(&state.db, &user, id).await?,
    ))
}

async fn set_schedule(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<Vec<clinic_svc::ScheduleInput>>,
) -> AppResult<Json<Vec<crate::models::DoctorSchedule>>> {
    Ok(Json(
        clinic_svc::set_schedule(&state.db, &user, id, body).await?,
    ))
}
