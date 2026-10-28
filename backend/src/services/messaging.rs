use chrono::{DateTime, NaiveDate, Utc};
use hmac::{Hmac, Mac};
use serde_json::{json, Value};
use sha2::Sha256;
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::{AppError, AppResult};

type HmacSha256 = Hmac<Sha256>;

/// Verify Meta webhook signature: X-Hub-Signature-256 = sha256=<hex>
pub fn verify_meta_signature(
    app_secret: &str,
    raw_body: &[u8],
    signature_header: &str,
) -> AppResult<()> {
    let sig = signature_header
        .strip_prefix("sha256=")
        .ok_or_else(|| AppError::Unauthorized)?;

    let mut mac = HmacSha256::new_from_slice(app_secret.as_bytes())
        .map_err(|e| AppError::Other(anyhow::anyhow!(e)))?;
    mac.update(raw_body);
    let expected = hex::encode(mac.finalize().into_bytes());

    if !constant_time_eq(expected.as_bytes(), sig.as_bytes()) {
        return Err(AppError::Unauthorized);
    }
    Ok(())
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter()
        .zip(b.iter())
        .fold(0u8, |acc, (x, y)| acc | (x ^ y))
        == 0
}

pub async fn resolve_clinic_by_phone_number_id(
    pool: &PgPool,
    phone_number_id: &str,
    encryption_key: Option<&str>,
) -> AppResult<(Uuid, String)> {
    let mut tx = crate::db::begin_bypass(pool).await?;
    let row = if let Some(key) = encryption_key {
        let row = sqlx::query_as::<_, (Uuid, String)>(
            r#"
            SELECT clinic_id, pgp_sym_decrypt(access_token_encrypted, $2)::text
            FROM clinic_channel_integrations
            WHERE channel = 'whatsapp' AND external_id = $1 AND is_active
              AND access_token_encrypted IS NOT NULL
            "#,
        )
        .bind(phone_number_id)
        .bind(key)
        .fetch_optional(&mut *tx)
        .await?;
        match row {
            Some(row) => Some(row),
            None => {
                sqlx::query_as::<_, (Uuid, String)>(
                    r#"
                    SELECT clinic_id, access_token FROM clinic_tokens
                    WHERE channel = 'whatsapp' AND external_id = $1 AND is_active
                      AND NOT EXISTS (
                        SELECT 1 FROM clinic_channel_integrations
                        WHERE channel = 'whatsapp' AND external_id = $1 AND is_active
                      )
                    "#,
                )
                .bind(phone_number_id)
                .fetch_optional(&mut *tx)
                .await?
            }
        }
    } else {
        sqlx::query_as::<_, (Uuid, String)>(
            r#"
            SELECT clinic_id, access_token FROM clinic_tokens
            WHERE channel = 'whatsapp' AND external_id = $1 AND is_active
              AND NOT EXISTS (
                SELECT 1 FROM clinic_channel_integrations
                WHERE channel = 'whatsapp' AND external_id = $1 AND is_active
              )
            "#,
        )
        .bind(phone_number_id)
        .fetch_optional(&mut *tx)
        .await?
    };
    tx.commit().await?;

    row.ok_or_else(|| AppError::NotFound("عيادة غير مرتبطة بهذا الرقم".into()))
}

#[derive(Debug, serde::Deserialize)]
pub struct InboundMessage {
    pub phone_number_id: String,
    pub from: String,
    pub body: String,
    pub message_id: Option<String>,
}

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct HandoffMessage {
    pub id: Uuid,
    pub patient_id: Option<Uuid>,
    pub patient_name: Option<String>,
    pub patient_phone: Option<String>,
    pub channel: String,
    pub body: Option<String>,
    pub created_at: DateTime<Utc>,
}

pub async fn list_handoffs(
    pool: &PgPool,
    user: &crate::middleware::AuthUser,
) -> AppResult<Vec<HandoffMessage>> {
    crate::middleware::require_roles(user, &["clinic_admin", "doctor", "receptionist"])?;
    let clinic_id = user.require_clinic()?;
    let mut tx = crate::db::begin_tenant(pool, Some(clinic_id), user.is_super()).await?;
    let messages = sqlx::query_as::<_, HandoffMessage>(
        r#"
        SELECT m.id, m.patient_id, p.full_name AS patient_name, p.phone AS patient_phone,
               m.channel, m.body, m.created_at
        FROM message_logs m
        LEFT JOIN patients p ON p.id = m.patient_id AND p.clinic_id = m.clinic_id
        WHERE m.clinic_id = $1 AND m.handoff = TRUE AND m.handoff_resolved = FALSE
        ORDER BY m.created_at DESC
        LIMIT 100
        "#,
    )
    .bind(clinic_id)
    .fetch_all(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(messages)
}

pub async fn resolve_handoff(
    pool: &PgPool,
    user: &crate::middleware::AuthUser,
    message_id: Uuid,
) -> AppResult<()> {
    crate::middleware::require_roles(user, &["clinic_admin", "doctor", "receptionist"])?;
    let clinic_id = user.require_clinic()?;
    let mut tx = crate::db::begin_tenant(pool, Some(clinic_id), user.is_super()).await?;
    let resolved = sqlx::query(
        r#"
        UPDATE message_logs
        SET handoff_resolved = TRUE
        WHERE id = $1 AND clinic_id = $2 AND handoff = TRUE AND handoff_resolved = FALSE
        "#,
    )
    .bind(message_id)
    .bind(clinic_id)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if resolved == 0 {
        return Err(AppError::NotFound("تنبيه التحويل غير موجود".into()));
    }
    tx.commit().await?;
    Ok(())
}

/// Persist inbound message and return clinic_id for AI/routing.
pub async fn ingest_inbound(
    pool: &PgPool,
    msg: InboundMessage,
    encryption_key: Option<&str>,
) -> AppResult<(Uuid, Uuid)> {
    let (clinic_id, _token) =
        resolve_clinic_by_phone_number_id(pool, &msg.phone_number_id, encryption_key).await?;

    let mut tx = crate::db::begin_tenant(pool, Some(clinic_id), false).await?;

    let patient_id: Uuid = sqlx::query_scalar(
        r#"
        INSERT INTO patients (clinic_id, phone, source)
        VALUES ($1, $2, 'whatsapp')
        ON CONFLICT (clinic_id, phone) DO UPDATE SET phone = EXCLUDED.phone
        RETURNING id
        "#,
    )
    .bind(clinic_id)
    .bind(&msg.from)
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO message_logs (clinic_id, patient_id, channel, direction, body, meta)
        VALUES ($1, $2, 'whatsapp', 'in', $3, jsonb_build_object('message_id', $4))
        "#,
    )
    .bind(clinic_id)
    .bind(patient_id)
    .bind(&msg.body)
    .bind(msg.message_id.as_deref().unwrap_or(""))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok((clinic_id, patient_id))
}

pub async fn handle_ai_message(
    pool: &PgPool,
    client: &reqwest::Client,
    clinic_id: Uuid,
    patient_id: Uuid,
    phone_number_id: &str,
    recipient: &str,
    encryption_key: Option<&str>,
    ollama_base_url: &str,
) -> AppResult<bool> {
    let mut tx = crate::db::begin_tenant(pool, Some(clinic_id), false).await?;
    let settings: Option<(bool, String, String, String)> = sqlx::query_as(
        r#"
        SELECT s.enabled, s.booking_model, c.name, c.timezone
        FROM clinic_ai_settings s
        JOIN clinics c ON c.id = s.clinic_id
        WHERE s.clinic_id = $1
        "#,
    )
    .bind(clinic_id)
    .fetch_optional(&mut *tx)
    .await?;
    let Some((enabled, model, clinic_name, clinic_timezone)) =
        settings.filter(|(enabled, _, _, _)| *enabled)
    else {
        tx.commit().await?;
        return Ok(false);
    };
    let mut history: Vec<(String, String)> = sqlx::query_as(
        r#"
        SELECT direction, body FROM message_logs
        WHERE clinic_id = $1 AND patient_id = $2 AND body IS NOT NULL
        ORDER BY created_at DESC LIMIT 8
        "#,
    )
    .bind(clinic_id)
    .bind(patient_id)
    .fetch_all(&mut *tx)
    .await?;
    tx.commit().await?;
    history.reverse();
    let booking_requested = history
        .iter()
        .rev()
        .find(|(direction, _)| direction == "in")
        .is_some_and(|(_, body)| contains_explicit_booking_intent(body));

    let mut messages = vec![json!({
        "role": "system",
        "content": format!(
            "أنت موظف استقبال في عيادة {clinic_name}. أجب بالعربية السعودية الواضحة والمختصرة. الأوقات المعروضة بتوقيت {clinic_timezone}. استخدم الأدوات لكل معلومة عن الأطباء والمواعيد، ولا تخترع بيانات أو تدّعِ نجاح الحجز قبل نجاح الأداة. لا تقدم تشخيصاً أو نصيحة طبية؛ حوّل الأسئلة الطبية أو الطارئة لموظف العيادة. لا تنشئ حجزاً إلا بعد طلب صريح من المريض يتضمن رغبته في الحجز ووقتاً وطبيباً محددين، واستخدم وقت البداية كما أعادته أداة الإتاحة. عند نقص معلومة اسأل سؤالاً واحداً واضحاً."
        )
    })];
    messages.extend(history.into_iter().map(|(direction, body)| {
        json!({
            "role": if direction == "in" { "user" } else { "assistant" },
            "content": body
        })
    }));

    let tools = patient_assistant_tools();
    for _ in 0..3 {
        let response = client
            .post(format!(
                "{}/api/chat",
                ollama_base_url.trim_end_matches('/')
            ))
            .json(&json!({"model":model,"messages":messages,"tools":tools,"stream":false}))
            .send()
            .await
            .map_err(|error| AppError::Other(anyhow::Error::from(error)))?;
        let status = response.status();
        let payload: Value = response
            .json()
            .await
            .map_err(|error| AppError::Other(anyhow::Error::from(error)))?;
        if !status.is_success() {
            return Err(AppError::Other(anyhow::anyhow!(
                "Ollama returned {status}: {payload}"
            )));
        }
        let Some(message) = payload.get("message").cloned() else {
            return Err(AppError::Other(anyhow::anyhow!(
                "Ollama response has no message"
            )));
        };
        let calls = message
            .get("tool_calls")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        if calls.is_empty() {
            let reply = message
                .get("content")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|content| !content.is_empty())
                .ok_or_else(|| {
                    AppError::Other(anyhow::anyhow!("Ollama returned an empty reply"))
                })?;
            send_whatsapp_text(
                pool,
                client,
                clinic_id,
                patient_id,
                phone_number_id,
                recipient,
                reply,
                encryption_key,
                "assistant_reply",
            )
            .await?;
            return Ok(true);
        }

        messages.push(message);
        for call in calls {
            let function = call.get("function").cloned().unwrap_or(Value::Null);
            let name = function.get("name").and_then(Value::as_str).unwrap_or("");
            let arguments = function.get("arguments").cloned().unwrap_or(json!({}));
            let result = execute_patient_tool(
                pool,
                clinic_id,
                patient_id,
                booking_requested,
                name,
                &arguments,
            )
            .await?;
            if result.get("handoff").and_then(Value::as_bool) == Some(true) {
                send_whatsapp_text(
                    pool,
                    client,
                    clinic_id,
                    patient_id,
                    phone_number_id,
                    recipient,
                    "تم تحويل رسالتك إلى فريق العيادة، وسيتواصل معك الموظف المختص.",
                    encryption_key,
                    "assistant_handoff",
                )
                .await?;
                return Ok(true);
            }
            messages.push(json!({"role":"tool","name":name,"content":result.to_string()}));
        }
    }
    Err(AppError::Other(anyhow::anyhow!(
        "Ollama exceeded the tool-call limit"
    )))
}

fn patient_assistant_tools() -> Value {
    json!([
        {"type":"function","function":{"name":"list_doctors","description":"عرض الأطباء النشطين في هذه العيادة","parameters":{"type":"object","properties":{},"required":[]}}},
        {"type":"function","function":{"name":"list_my_appointments","description":"عرض مواعيد المريض القادمة","parameters":{"type":"object","properties":{},"required":[]}}},
        {"type":"function","function":{"name":"list_available_slots","description":"عرض الأوقات المتاحة لطبيب في تاريخ محدد","parameters":{"type":"object","properties":{"doctor_id":{"type":"string"},"date":{"type":"string","description":"YYYY-MM-DD"}},"required":["doctor_id","date"]}}},
        {"type":"function","function":{"name":"book_appointment","description":"إنشاء موعد بعد طلب حجز صريح وتحديد الطبيب والوقت","parameters":{"type":"object","properties":{"doctor_id":{"type":"string"},"starts_at":{"type":"string","description":"RFC3339 datetime"},"service":{"type":"string"}},"required":["doctor_id","starts_at"]}}},
        {"type":"function","function":{"name":"request_human_handoff","description":"تحويل المحادثة لموظف عند طلب المريض أو وجود سؤال طبي","parameters":{"type":"object","properties":{},"required":[]}}}
    ])
}

async fn execute_patient_tool(
    pool: &PgPool,
    clinic_id: Uuid,
    patient_id: Uuid,
    booking_requested: bool,
    name: &str,
    arguments: &Value,
) -> AppResult<Value> {
    match name {
        "list_doctors" => {
            let mut tx = crate::db::begin_tenant(pool, Some(clinic_id), false).await?;
            let doctors = sqlx::query_as::<_, (Uuid, String, Option<String>)>(
                "SELECT id, full_name, specialty FROM doctors WHERE clinic_id = $1 AND is_active ORDER BY full_name",
            )
            .bind(clinic_id)
            .fetch_all(&mut *tx)
            .await?;
            tx.commit().await?;
            Ok(json!(doctors
                .into_iter()
                .map(|(id, name, specialty)| json!({"id":id,"name":name,"specialty":specialty}))
                .collect::<Vec<_>>()))
        }
        "list_my_appointments" => {
            let mut tx = crate::db::begin_tenant(pool, Some(clinic_id), false).await?;
            let timezone_name: String =
                sqlx::query_scalar("SELECT timezone FROM clinics WHERE id = $1")
                    .bind(clinic_id)
                    .fetch_one(&mut *tx)
                    .await?;
            let timezone: chrono_tz::Tz = timezone_name
                .parse()
                .map_err(|_| AppError::Other(anyhow::anyhow!("invalid clinic timezone")))?;
            let rows = sqlx::query_as::<_, (String, String, DateTime<Utc>, String)>(
                r#"SELECT d.full_name, COALESCE(a.service, ''), a.starts_at, a.status::text
                   FROM appointments a JOIN doctors d ON d.id = a.doctor_id AND d.clinic_id = a.clinic_id
                   WHERE a.clinic_id = $1 AND a.patient_id = $2 AND a.starts_at > NOW()
                     AND a.status IN ('pending', 'confirmed', 'waiting')
                   ORDER BY a.starts_at LIMIT 5"#,
            )
            .bind(clinic_id)
            .bind(patient_id)
            .fetch_all(&mut *tx)
            .await?;
            tx.commit().await?;
            Ok(json!(rows
                .into_iter()
                .map(|(doctor, service, starts_at, status)| {
                    let starts_at_local = starts_at
                        .with_timezone(&timezone)
                        .format("%Y-%m-%d %H:%M %:z")
                        .to_string();
                    json!({"doctor":doctor,"service":service,"starts_at":starts_at,"starts_at_local":starts_at_local,"status":status})
                })
                .collect::<Vec<_>>()))
        }
        "list_available_slots" => {
            let doctor_id = patient_tool_uuid(arguments, "doctor_id")?;
            let date = arguments
                .get("date")
                .and_then(Value::as_str)
                .and_then(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d").ok())
                .ok_or_else(|| AppError::BadRequest("تاريخ غير صالح".into()))?;
            let slots = crate::services::appointments::availability_for_clinic(
                pool, clinic_id, doctor_id, date,
            )
            .await?;
            let mut tx = crate::db::begin_tenant(pool, Some(clinic_id), false).await?;
            let timezone_name: String =
                sqlx::query_scalar("SELECT timezone FROM clinics WHERE id = $1")
                    .bind(clinic_id)
                    .fetch_one(&mut *tx)
                    .await?;
            tx.commit().await?;
            let timezone: chrono_tz::Tz = timezone_name
                .parse()
                .map_err(|_| AppError::Other(anyhow::anyhow!("invalid clinic timezone")))?;
            Ok(json!(slots
                .into_iter()
                .map(|slot| json!({
                    "starts_at": slot.starts_at,
                    "starts_at_local": slot.starts_at.with_timezone(&timezone).format("%Y-%m-%d %H:%M %:z").to_string(),
                    "ends_at": slot.ends_at
                }))
                .collect::<Vec<_>>()))
        }
        "book_appointment" => {
            if !booking_requested {
                return Ok(json!({"error":"explicit_booking_request_required"}));
            }
            let doctor_id = patient_tool_uuid(arguments, "doctor_id")?;
            let starts_at = arguments
                .get("starts_at")
                .and_then(Value::as_str)
                .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
                .map(|value| value.with_timezone(&Utc))
                .ok_or_else(|| AppError::BadRequest("وقت الموعد غير صالح".into()))?;
            let service = arguments
                .get("service")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_owned);
            let appointment = crate::services::appointments::book_from_whatsapp(
                pool, clinic_id, patient_id, doctor_id, starts_at, service,
            )
            .await?;
            let mut tx = crate::db::begin_tenant(pool, Some(clinic_id), false).await?;
            let timezone_name: String =
                sqlx::query_scalar("SELECT timezone FROM clinics WHERE id = $1")
                    .bind(clinic_id)
                    .fetch_one(&mut *tx)
                    .await?;
            tx.commit().await?;
            let timezone: chrono_tz::Tz = timezone_name
                .parse()
                .map_err(|_| AppError::Other(anyhow::anyhow!("invalid clinic timezone")))?;
            let starts_at_local = appointment
                .starts_at
                .with_timezone(&timezone)
                .format("%Y-%m-%d %H:%M %:z")
                .to_string();
            Ok(
                json!({"booked":true,"appointment_id":appointment.id,"starts_at":appointment.starts_at,"starts_at_local":starts_at_local,"status":appointment.status}),
            )
        }
        "request_human_handoff" => {
            let mut tx = crate::db::begin_tenant(pool, Some(clinic_id), false).await?;
            sqlx::query(
                r#"UPDATE message_logs SET handoff = TRUE WHERE id = (
                     SELECT id FROM message_logs WHERE clinic_id = $1 AND patient_id = $2 AND direction = 'in'
                     ORDER BY created_at DESC LIMIT 1)"#,
            )
            .bind(clinic_id)
            .bind(patient_id)
            .execute(&mut *tx)
            .await?;
            tx.commit().await?;
            Ok(json!({"handoff":true}))
        }
        _ => Ok(json!({"error":"unknown_tool"})),
    }
}

fn patient_tool_uuid(arguments: &Value, key: &str) -> AppResult<Uuid> {
    arguments
        .get(key)
        .and_then(Value::as_str)
        .and_then(|value| Uuid::parse_str(value).ok())
        .ok_or_else(|| AppError::BadRequest(format!("{key} غير صالح")))
}

fn contains_explicit_booking_intent(text: &str) -> bool {
    let normalized = text.to_lowercase();
    [
        "احجز لي",
        "أحجز لي",
        "ابغى احجز",
        "أبغى أحجز",
        "ابي احجز",
        "أبي أحجز",
        "ودي احجز",
        "ودي أحجز",
        "أرغب بالحجز",
        "ارغب في الحجز",
        "أريد أن أحجز",
        "اريد ان احجز",
        "i want to book",
    ]
    .iter()
    .any(|phrase| normalized.contains(phrase))
}

#[derive(Debug, sqlx::FromRow)]
struct PendingReminder {
    id: Uuid,
    clinic_id: Uuid,
    appointment_id: Uuid,
    patient_id: Uuid,
    recipient: String,
    clinic_name: String,
    doctor_name: String,
    starts_at: DateTime<Utc>,
    timezone: String,
    phone_number_id: String,
    access_token: String,
}

pub async fn run_reminder_cycle(
    pool: &PgPool,
    client: &reqwest::Client,
    encryption_key: Option<&str>,
) -> AppResult<()> {
    enqueue_due_reminders(pool).await?;

    for _ in 0..25 {
        let Some((reminder, attempt)) = claim_reminder(pool, encryption_key).await? else {
            break;
        };
        match send_appointment_reminder(client, &reminder).await {
            Ok(message_id) => {
                let mut tx = crate::db::begin_bypass(pool).await?;
                sqlx::query(
                    r#"
                    UPDATE appointment_reminders
                    SET status = 'sent', sent_at = NOW(), locked_at = NULL,
                        external_message_id = $2, next_attempt_at = NOW()
                    WHERE id = $1
                    "#,
                )
                .bind(reminder.id)
                .bind(message_id)
                .execute(&mut *tx)
                .await?;
                sqlx::query("UPDATE appointments SET reminder_sent = TRUE WHERE id = $1")
                    .bind(reminder.appointment_id)
                    .execute(&mut *tx)
                    .await?;
                let appointment_time = reminder.starts_at.with_timezone(
                    &reminder
                        .timezone
                        .parse::<chrono_tz::Tz>()
                        .map_err(|error| {
                            AppError::Other(anyhow::anyhow!("invalid clinic timezone: {error}"))
                        })?,
                );
                let body = format!(
                    "تذكير بموعدك في {} يوم {} مع {}. يرجى تأكيد الحضور أو إبلاغنا باحتمال التأخر.",
                    reminder.clinic_name,
                    appointment_time.format("%Y-%m-%d %H:%M"),
                    reminder.doctor_name
                );
                sqlx::query(
                    r#"
                    INSERT INTO message_logs (clinic_id, patient_id, channel, direction, body, meta)
                    VALUES (
                      $1, $2, 'whatsapp', 'out', $3,
                      jsonb_build_object(
                        'type', 'appointment_reminder',
                        'reminder_id', $4::text,
                        'message_id', $5,
                        'appointment_id', $6::text
                      )
                    )
                    "#,
                )
                .bind(reminder.clinic_id)
                .bind(reminder.patient_id)
                .bind(body)
                .bind(reminder.id)
                .bind(&message_id)
                .bind(reminder.appointment_id)
                .execute(&mut *tx)
                .await?;
                tx.commit().await?;
                tracing::info!(reminder_id = %reminder.id, "appointment reminder sent");
            }
            Err(error) => {
                tracing::warn!(
                    reminder_id = %reminder.id,
                    attempt,
                    error = %error,
                    "appointment reminder delivery failed"
                );
                let mut tx = crate::db::begin_bypass(pool).await?;
                sqlx::query(
                    r#"
                    UPDATE appointment_reminders
                    SET status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END,
                        locked_at = NULL,
                        next_attempt_at = NOW() + CASE attempts
                          WHEN 1 THEN INTERVAL '1 minute'
                          WHEN 2 THEN INTERVAL '5 minutes'
                          ELSE INTERVAL '15 minutes'
                        END
                    WHERE id = $1
                    "#,
                )
                .bind(reminder.id)
                .execute(&mut *tx)
                .await?;
                tx.commit().await?;
            }
        }
    }
    Ok(())
}

async fn enqueue_due_reminders(pool: &PgPool) -> AppResult<()> {
    let mut tx = crate::db::begin_bypass(pool).await?;
    sqlx::query(
        r#"
        INSERT INTO appointment_reminders (clinic_id, appointment_id)
        SELECT a.clinic_id, a.id
        FROM appointments a
                JOIN clinics c ON c.id = a.clinic_id
                JOIN patients p ON p.id = a.patient_id AND p.clinic_id = a.clinic_id AND p.phone <> ''
        WHERE a.status IN ('pending', 'confirmed')
          AND a.reminder_sent = FALSE
          AND a.starts_at > NOW()
                    AND a.starts_at <= NOW() + make_interval(hours => CASE
                        WHEN p.risk_score >= 0.4 THEN GREATEST(c.reminder_hours, 24)
                        ELSE c.reminder_hours
                    END)
          AND (
            EXISTS (
              SELECT 1 FROM clinic_channel_integrations ci
              WHERE ci.clinic_id = a.clinic_id AND ci.channel = 'whatsapp' AND ci.is_active
            )
            OR EXISTS (
              SELECT 1 FROM clinic_tokens t
              WHERE t.clinic_id = a.clinic_id AND t.channel = 'whatsapp' AND t.is_active
            )
          )
        ON CONFLICT (appointment_id) DO NOTHING
        "#,
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}

async fn claim_reminder(
    pool: &PgPool,
    encryption_key: Option<&str>,
) -> AppResult<Option<(PendingReminder, i32)>> {
    let mut tx = crate::db::begin_bypass(pool).await?;
    sqlx::query(
        r#"
        UPDATE appointment_reminders
        SET status = 'failed', locked_at = NULL
        WHERE status = 'sending' AND attempts >= 5
          AND locked_at < NOW() - INTERVAL '5 minutes'
        "#,
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        r#"
        UPDATE appointment_reminders r
        SET status = 'failed', locked_at = NULL
        WHERE r.status IN ('pending', 'sending')
          AND EXISTS (
            SELECT 1 FROM appointments a
            WHERE a.id = r.appointment_id
              AND (a.status NOT IN ('pending', 'confirmed') OR a.starts_at <= NOW())
          )
        "#,
    )
    .execute(&mut *tx)
    .await?;
    let row = sqlx::query_as::<_, PendingReminder>(
        r#"
        SELECT r.id, r.clinic_id, r.appointment_id, p.id AS patient_id, p.phone AS recipient,
               c.name AS clinic_name, d.full_name AS doctor_name,
               a.starts_at, c.timezone,
               COALESCE(NULLIF(ci.phone_number_id, ''), NULLIF(ci.external_id, ''),
                        NULLIF(t.phone_number_id, ''), t.external_id) AS phone_number_id,
               CASE
                 WHEN ci.access_token_encrypted IS NOT NULL AND $1::text IS NOT NULL
                   THEN pgp_sym_decrypt(ci.access_token_encrypted, $1)::text
                 ELSE t.access_token
               END AS access_token
        FROM appointment_reminders r
        JOIN appointments a ON a.id = r.appointment_id AND a.clinic_id = r.clinic_id
        JOIN patients p ON p.id = a.patient_id AND p.clinic_id = a.clinic_id
        JOIN clinics c ON c.id = a.clinic_id
        JOIN doctors d ON d.id = a.doctor_id AND d.clinic_id = a.clinic_id
        LEFT JOIN clinic_channel_integrations ci
          ON ci.clinic_id = a.clinic_id AND ci.channel = 'whatsapp' AND ci.is_active
        LEFT JOIN clinic_tokens t
          ON t.clinic_id = a.clinic_id AND t.channel = 'whatsapp' AND t.is_active
         AND ci.id IS NULL
        WHERE a.status IN ('pending', 'confirmed')
          AND a.starts_at > NOW()
          AND CASE
                WHEN ci.access_token_encrypted IS NOT NULL THEN $1::text IS NOT NULL
                ELSE t.access_token IS NOT NULL
              END
          AND r.attempts < 5
          AND (
            (r.status = 'pending' AND r.next_attempt_at <= NOW())
            OR (r.status = 'sending' AND r.locked_at < NOW() - INTERVAL '5 minutes')
          )
        ORDER BY r.next_attempt_at, a.starts_at
        LIMIT 1
        FOR UPDATE OF r SKIP LOCKED
        "#,
    )
    .bind(encryption_key)
    .fetch_optional(&mut *tx)
    .await?;
    let Some(reminder) = row else {
        tx.commit().await?;
        return Ok(None);
    };
    let attempt: i32 = sqlx::query_scalar(
        r#"
        UPDATE appointment_reminders
        SET status = 'sending', attempts = attempts + 1, locked_at = NOW()
        WHERE id = $1
        RETURNING attempts
        "#,
    )
    .bind(reminder.id)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Some((reminder, attempt)))
}

async fn send_appointment_reminder(
    client: &reqwest::Client,
    reminder: &PendingReminder,
) -> AppResult<String> {
    let version = std::env::var("META_GRAPH_API_VERSION").unwrap_or_else(|_| "v22.0".into());
    let template = std::env::var("META_REMINDER_TEMPLATE")
        .unwrap_or_else(|_| "sahel_appointment_reminder".into());
    let language = std::env::var("META_REMINDER_TEMPLATE_LANGUAGE").unwrap_or_else(|_| "ar".into());
    let timezone: chrono_tz::Tz = reminder
        .timezone
        .parse()
        .map_err(|error| AppError::Other(anyhow::anyhow!("invalid clinic timezone: {error}")))?;
    let appointment_time = reminder.starts_at.with_timezone(&timezone);
    let date_time = appointment_time.format("%Y-%m-%d %H:%M").to_string();
    let button_payload = |action: &str| format!("APPT:{action}:{}", reminder.appointment_id);
    let body = json!({
        "messaging_product": "whatsapp",
        "to": reminder.recipient,
        "type": "template",
        "template": {
            "name": template,
            "language": { "code": language },
            "components": [
                {
                    "type": "body",
                    "parameters": [
                        { "type": "text", "text": reminder.clinic_name },
                        { "type": "text", "text": date_time },
                        { "type": "text", "text": reminder.doctor_name }
                    ]
                },
                quick_reply_component(0, button_payload("CONFIRM")),
                quick_reply_component(1, button_payload("LATE")),
                quick_reply_component(2, button_payload("HUMAN"))
            ]
        }
    });
    let response = client
        .post(format!(
            "https://graph.facebook.com/{version}/{}/messages",
            reminder.phone_number_id
        ))
        .bearer_auth(&reminder.access_token)
        .json(&body)
        .send()
        .await
        .map_err(|error| AppError::Other(anyhow::Error::from(error)))?;
    let status = response.status();
    let payload: Value = response
        .json()
        .await
        .map_err(|error| AppError::Other(anyhow::Error::from(error)))?;
    if !status.is_success() {
        return Err(AppError::Other(anyhow::anyhow!(
            "Meta WhatsApp API returned {status}: {}",
            payload
        )));
    }
    payload
        .pointer("/messages/0/id")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| {
            AppError::Other(anyhow::anyhow!(
                "Meta response did not include a message id"
            ))
        })
}

fn quick_reply_component(index: u8, payload: String) -> Value {
    json!({
        "type": "button",
        "sub_type": "quick_reply",
        "index": index.to_string(),
        "parameters": [{ "type": "payload", "payload": payload }]
    })
}

pub async fn handle_reminder_response(
    pool: &PgPool,
    client: &reqwest::Client,
    clinic_id: Uuid,
    patient_id: Uuid,
    phone_number_id: &str,
    recipient: &str,
    text: &str,
    button_payload: Option<&str>,
    encryption_key: Option<&str>,
) -> AppResult<bool> {
    let normalized = text.trim().to_lowercase();
    let (response, appointment_id) = if let Some(payload) = button_payload {
        let Some((response, appointment_id)) = parse_reminder_payload(payload) else {
            return Ok(false);
        };
        (response, Some(appointment_id))
    } else {
        let Some(response) = classify_reminder_text(&normalized) else {
            return Ok(false);
        };
        (response, None)
    };

    let mut tx = crate::db::begin_tenant(pool, Some(clinic_id), false).await?;
    let reminder: Option<(Uuid, Uuid)> = if let Some(appointment_id) = appointment_id {
        sqlx::query_as(
            r#"
            SELECT r.id, r.appointment_id FROM appointment_reminders r
            WHERE r.clinic_id = $1 AND r.appointment_id = $2 AND r.status = 'sent'
              AND r.patient_response IS NULL
              AND EXISTS (
                SELECT 1 FROM appointments a
                WHERE a.id = r.appointment_id AND a.clinic_id = r.clinic_id
                  AND a.patient_id = $3 AND a.status IN ('pending', 'confirmed')
              )
            FOR UPDATE
            "#,
        )
        .bind(clinic_id)
        .bind(appointment_id)
        .bind(patient_id)
        .fetch_optional(&mut *tx)
        .await?
    } else {
        sqlx::query_as(
            r#"
            SELECT r.id, r.appointment_id FROM appointment_reminders r
            JOIN appointments a ON a.id = r.appointment_id AND a.clinic_id = r.clinic_id
            WHERE r.clinic_id = $1 AND a.patient_id = $2 AND r.status = 'sent'
              AND r.patient_response IS NULL
              AND a.starts_at > NOW()
              AND a.status IN ('pending', 'confirmed')
            ORDER BY a.starts_at
            LIMIT 1
            FOR UPDATE OF r
            "#,
        )
        .bind(clinic_id)
        .bind(patient_id)
        .fetch_optional(&mut *tx)
        .await?
    };

    let Some((reminder_id, appointment_id)) = reminder else {
        tx.commit().await?;
        return Ok(false);
    };
    sqlx::query(
        "UPDATE appointment_reminders SET patient_response = $2, responded_at = NOW() WHERE id = $1",
    )
    .bind(reminder_id)
    .bind(response)
    .execute(&mut *tx)
    .await?;
    if response != "confirmed" {
        sqlx::query(
            r#"
            UPDATE message_logs SET handoff = TRUE
            WHERE id = (
              SELECT id FROM message_logs
              WHERE clinic_id = $1 AND patient_id = $2
              ORDER BY created_at DESC LIMIT 1
            )
            "#,
        )
        .bind(clinic_id)
        .bind(patient_id)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            r#"
            INSERT INTO audit_logs (clinic_id, action, entity, entity_id, details)
            VALUES (
              $1, $2, 'appointment', $3,
              jsonb_build_object('patient_id', $4::text, 'response', $5)
            )
            "#,
        )
        .bind(clinic_id)
        .bind(if response == "may_be_late" {
            "appointment.reminder_late"
        } else {
            "appointment.reminder_handoff"
        })
        .bind(appointment_id.to_string())
        .bind(patient_id)
        .bind(response)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;

    let reply = match response {
        "confirmed" => "شكرًا لتأكيد حضورك للموعد. نتطلع إلى زيارتك.",
        "may_be_late" => {
            "شكرًا لإبلاغنا. سجلنا احتمال التأخر لفريق العيادة. لم يتم إلغاء موعدك تلقائيًا."
        }
        _ => "تم تسجيل طلب تحويل المحادثة إلى فريق العيادة.",
    };
    send_whatsapp_text(
        pool,
        client,
        clinic_id,
        patient_id,
        phone_number_id,
        recipient,
        reply,
        encryption_key,
        "reminder_response",
    )
    .await?;
    Ok(true)
}

fn parse_reminder_payload(payload: &str) -> Option<(&'static str, Uuid)> {
    let mut parts = payload.split(':');
    if parts.next()? != "APPT" {
        return None;
    }
    let response = match parts.next()? {
        "CONFIRM" => "confirmed",
        "LATE" => "may_be_late",
        "HUMAN" => "human",
        _ => return None,
    };
    let appointment_id = Uuid::parse_str(parts.next()?).ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some((response, appointment_id))
}

fn classify_reminder_text(text: &str) -> Option<&'static str> {
    if ["موظف", "بشري", "شخص", "مساعدة", "human", "agent"]
        .iter()
        .any(|word| text.contains(word))
    {
        Some("human")
    } else if [
        "قد أتأخر",
        "ممكن أتأخر",
        "ممكن اتأخر",
        "سأتأخر",
        "اتأخر",
        "متأخر",
        "تأخير",
        "late",
    ]
    .iter()
    .any(|word| text.contains(word))
    {
        Some("may_be_late")
    } else if [
        "نعم",
        "اؤكد",
        "أؤكد",
        "اكيد",
        "أكيد",
        "سأحضر",
        "حاضر",
        "confirm",
        "yes",
    ]
    .iter()
    .any(|word| text.contains(word))
    {
        Some("confirmed")
    } else {
        None
    }
}

async fn send_whatsapp_text(
    pool: &PgPool,
    client: &reqwest::Client,
    clinic_id: Uuid,
    patient_id: Uuid,
    phone_number_id: &str,
    recipient: &str,
    text: &str,
    encryption_key: Option<&str>,
    message_type: &str,
) -> AppResult<()> {
    let (resolved_clinic_id, access_token) =
        resolve_clinic_by_phone_number_id(pool, phone_number_id, encryption_key).await?;
    if resolved_clinic_id != clinic_id {
        return Err(AppError::Forbidden);
    }
    let version = std::env::var("META_GRAPH_API_VERSION").unwrap_or_else(|_| "v22.0".into());
    let response = client
        .post(format!(
            "https://graph.facebook.com/{version}/{phone_number_id}/messages"
        ))
        .bearer_auth(access_token)
        .json(&json!({
            "messaging_product": "whatsapp",
            "to": recipient,
            "type": "text",
            "text": { "body": text }
        }))
        .send()
        .await
        .map_err(|error| AppError::Other(anyhow::Error::from(error)))?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|error| AppError::Other(anyhow::Error::from(error)))?;
        return Err(AppError::Other(anyhow::anyhow!(
            "Meta WhatsApp API returned {status}: {body}"
        )));
    }

    let mut tx = crate::db::begin_tenant(pool, Some(clinic_id), false).await?;
    sqlx::query(
        r#"
        INSERT INTO message_logs (clinic_id, patient_id, channel, direction, body, meta)
        VALUES ($1, $2, 'whatsapp', 'out', $3, jsonb_build_object('type', $4))
        "#,
    )
    .bind(clinic_id)
    .bind(patient_id)
    .bind(text)
    .bind(message_type)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::contains_explicit_booking_intent;
    use super::{classify_reminder_text, parse_reminder_payload};

    #[test]
    fn late_response_takes_priority_over_confirmation_words() {
        assert_eq!(
            classify_reminder_text("نعم، ممكن اتأخر"),
            Some("may_be_late")
        );
        assert_eq!(classify_reminder_text("اريد التحدث مع موظف"), Some("human"));
        assert_eq!(classify_reminder_text("سأحضر"), Some("confirmed"));
        assert_eq!(classify_reminder_text("استفسار عن موعد"), None);
    }

    #[test]
    fn reminder_button_payload_requires_valid_appointment_id() {
        let appointment_id = Uuid::new_v4();
        let payload = format!("APPT:CONFIRM:{appointment_id}");
        assert_eq!(
            parse_reminder_payload(&payload),
            Some(("confirmed", appointment_id))
        );
        assert!(parse_reminder_payload("APPT:CONFIRM:not-a-uuid").is_none());
        assert!(parse_reminder_payload("APPT:CONFIRM:bad:extra").is_none());
    }
    #[test]
    fn booking_intent_requires_a_direct_request() {
        assert!(contains_explicit_booking_intent(
            "أبغى أحجز موعد يوم الاثنين"
        ));
        assert!(contains_explicit_booking_intent("احجز لي عند الطبيب"));
        assert!(!contains_explicit_booking_intent(
            "هل يوجد موعد يوم الاثنين؟"
        ));
        assert!(!contains_explicit_booking_intent("كيف أحجز موعد؟"));
    }
}
