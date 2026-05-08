pub mod config;
pub mod error;
pub mod handlers;
pub mod presence;
pub mod redis_bus;
pub mod state;
pub mod ws;

use actix_web::web;

/// Register all routes on an actix `ServiceConfig` under the `/api/v1`
/// prefix. Used by both the production `main.rs` and integration tests so
/// they exercise the same surface.
pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api/v1")
            .service(handlers::health::livez)
            .service(handlers::health::healthz)
            .service(handlers::click::state)
            .service(handlers::click::click)
            .service(handlers::ws::ws_upgrade),
    );
}
