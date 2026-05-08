use actix_web::{get, web, HttpResponse};
use serde_json::json;
use std::time::Duration;
use tokio::time::timeout;

use crate::state::AppState;

#[get("/livez")]
pub async fn livez() -> HttpResponse {
    HttpResponse::Ok().body("ok")
}

#[get("/healthz")]
pub async fn healthz(state: web::Data<AppState>) -> HttpResponse {
    let mut conn = state.redis.clone();
    let ping = timeout(Duration::from_millis(500), async {
        redis::cmd("PING").query_async::<String>(&mut conn).await
    })
    .await;

    match ping {
        Ok(Ok(_)) => HttpResponse::Ok().json(json!({"redis": "ok"})),
        Ok(Err(err)) => {
            tracing::warn!(error = %err, "redis ping failed");
            HttpResponse::ServiceUnavailable().json(json!({"redis": "error"}))
        }
        Err(_) => {
            tracing::warn!("redis ping timed out");
            HttpResponse::ServiceUnavailable().json(json!({"redis": "timeout"}))
        }
    }
}
