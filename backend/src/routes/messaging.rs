use axum::{
    Json, Router,
    body::Bytes,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::Value;

use crate::{
    error::{AppError, AppResult},
    services::messaging,
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/meta", get(verify).post(receive))
}

#[derive(Debug, Deserialize)]
pub struct VerifyQuery {
    #[serde(rename = "hub.mode")]
    mode: Option<String>,
    #[serde(rename = "hub.verify_token")]
    verify_token: Option<String>,
    #[serde(rename = "hub.challenge")]
    challenge: Option<String>,
}

async fn verify(
    Query(q): Query<VerifyQuery>,
) -> Result<(StatusCode, String), AppError> {
    let expected = std::env::var("META_VERIFY_TOKEN").unwrap_or_else(|_| "sahel-verify".into());
    if q.mode.as_deref() == Some("subscribe") && q.verify_token.as_deref() == Some(&expected) {
        return Ok((
            StatusCode::OK,
            q.challenge.unwrap_or_default(),
        ));
    }
    Err(AppError::Forbidden)
}

async fn receive(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> AppResult<Json<Value>> {
    if let Some(secret) = state.config.meta_app_secret.as_deref() {
        let sig = headers
            .get("x-hub-signature-256")
            .and_then(|v| v.to_str().ok())
            .ok_or(AppError::Unauthorized)?;
        messaging::verify_meta_signature(secret, &body, sig)?;
    }

    let payload: Value = serde_json::from_slice(&body)
        .map_err(|e| AppError::BadRequest(format!("invalid json: {e}")))?;
    let whatsapp_client = reqwest::Client::new();

    // Minimal WhatsApp Cloud API parsing
    if let Some(entries) = payload.get("entry").and_then(|e| e.as_array()) {
        for entry in entries {
            let changes = entry
                .get("changes")
                .and_then(|c| c.as_array())
                .cloned()
                .unwrap_or_default();
            for change in changes {
                let value = change.get("value");
                let phone_number_id = value
                    .and_then(|v| v.get("metadata"))
                    .and_then(|m| m.get("phone_number_id"))
                    .and_then(|p| p.as_str())
                    .unwrap_or("");

                let messages = value
                    .and_then(|v| v.get("messages"))
                    .and_then(|m| m.as_array())
                    .cloned()
                    .unwrap_or_default();

                for msg in messages {
                    let from = msg.get("from").and_then(|f| f.as_str()).unwrap_or("");
                    let button_payload = msg
                        .pointer("/interactive/button_reply/id")
                        .or_else(|| msg.pointer("/button/payload"))
                        .and_then(Value::as_str);
                    let body_text = msg
                        .get("text")
                        .and_then(|t| t.get("body"))
                        .and_then(|b| b.as_str())
                        .or_else(|| {
                            msg.pointer("/interactive/button_reply/title")
                                .and_then(Value::as_str)
                        })
                        .or_else(|| msg.pointer("/button/text").and_then(Value::as_str))
                        .unwrap_or("");
                    let message_id = msg.get("id").and_then(|i| i.as_str()).map(|s| s.to_string());

                    if !phone_number_id.is_empty() && !from.is_empty() {
                        let (clinic_id, patient_id) = messaging::ingest_inbound(
                            &state.db,
                            messaging::InboundMessage {
                                phone_number_id: phone_number_id.into(),
                                from: from.into(),
                                body: body_text.into(),
                                message_id,
                            },
                            state.config.integration_encryption_key.as_deref(),
                        )
                        .await?;

                        let handled = messaging::handle_reminder_response(
                            &state.db,
                            &whatsapp_client,
                            clinic_id,
                            patient_id,
                            phone_number_id,
                            from,
                            body_text,
                            button_payload,
                            state.config.integration_encryption_key.as_deref(),
                        )
                        .await?;
                        if !handled {
                            tracing::info!(%clinic_id, from, "inbound whatsapp message stored");
                        }
                    }
                }
            }
        }
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}
