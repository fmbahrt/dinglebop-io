use actix_web::{get, post, web, HttpResponse};
use redis::AsyncCommands;
use serde::Serialize;

use crate::error::AppResult;
use crate::presence;
use crate::redis_bus;
use crate::state::{AppState, KEY_CLICKS_TOTAL};

#[derive(Debug, Serialize)]
pub struct StateView {
    pub clicks: u64,
    pub online: u64,
}

#[get("/state")]
pub async fn state(app: web::Data<AppState>) -> AppResult<HttpResponse> {
    let mut conn = app.redis.clone();
    let clicks: Option<u64> = conn.get(KEY_CLICKS_TOTAL).await?;
    let online = presence::count(&mut conn).await?;
    Ok(HttpResponse::Ok().json(StateView {
        clicks: clicks.unwrap_or(0),
        online,
    }))
}

#[post("/click")]
pub async fn click(app: web::Data<AppState>) -> AppResult<HttpResponse> {
    let new_count = redis_bus::record_click(&app).await?;
    Ok(HttpResponse::Ok().json(serde_json::json!({"clicks": new_count})))
}
