use actix_web::{get, web, Error, HttpRequest, HttpResponse};

use crate::state::AppState;
use crate::ws::session;

#[get("/ws")]
pub async fn ws_upgrade(
    req: HttpRequest,
    body: web::Payload,
    state: web::Data<AppState>,
) -> Result<HttpResponse, Error> {
    let (response, session_handle, msg_stream) = actix_ws::handle(&req, body)?;
    let state = state.into_inner();
    actix_web::rt::spawn(async move {
        session::run(state.as_ref().clone(), session_handle, msg_stream).await;
    });
    Ok(response)
}
