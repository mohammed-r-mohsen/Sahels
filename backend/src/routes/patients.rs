use axum::{Json, Router, extract::State, routing::get};

use crate::{
    db::begin_tenant,
    error::AppResult,
    middleware::AuthUser,
    models::Patient,
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(list))
}

async fn list(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<Vec<Patient>>> {
    let clinic_id = user.require_clinic()?;
    let mut tx = begin_tenant(&state.db, Some(clinic_id), user.is_super()).await?;

    let rows = sqlx::query_as::<_, Patient>(
        r#"
        SELECT id, clinic_id, full_name, phone, source, notes,
               no_show_count, visit_count, created_at
        FROM patients WHERE clinic_id = $1
        ORDER BY created_at DESC LIMIT 200
        "#,
    )
    .bind(clinic_id)
    .fetch_all(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(Json(rows))
}
