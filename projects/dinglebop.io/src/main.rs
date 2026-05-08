use actix_cors::Cors;
use actix_web::{http, middleware, web, App, HttpServer};
use redis::aio::ConnectionManager;
use tracing_actix_web::TracingLogger;
use tracing_subscriber::{prelude::*, EnvFilter};

use dinglebop::config::{Config, LogFormat};
use dinglebop::state::AppState;
use dinglebop::{configure, presence, redis_bus};

#[actix_web::main]
async fn main() -> anyhow::Result<()> {
    let cfg = Config::from_env()?;
    init_tracing(cfg.log_format);

    tracing::info!(
        instance_id = %cfg.instance_id,
        bind = %cfg.bind_addr,
        cors = ?cfg.cors_allowed_origins,
        "starting dinglebop"
    );

    let client = redis::Client::open(cfg.redis_url.as_str())?;
    let redis = ConnectionManager::new(client).await?;
    let state = AppState::new(redis, cfg.instance_id.clone());

    redis_bus::spawn(state.clone(), cfg.redis_url.clone());
    presence::spawn_sweeper(state.clone());

    let app_state = web::Data::new(state);
    let bind_addr = cfg.bind_addr.clone();
    let cors_origins = cfg.cors_allowed_origins.clone();

    HttpServer::new(move || {
        App::new()
            .app_data(app_state.clone())
            .wrap(build_cors(&cors_origins))
            .wrap(middleware::NormalizePath::trim())
            .wrap(TracingLogger::default())
            .configure(configure)
    })
    .bind(&bind_addr)?
    .run()
    .await?;

    Ok(())
}

/// Build a CORS middleware from the configured origin list. An empty list
/// disables cross-origin requests (production default — same-origin via
/// ingress); `*` allows any origin (loose dev only).
fn build_cors(origins: &[String]) -> Cors {
    let base = Cors::default()
        .allowed_methods(vec!["GET", "POST"])
        .allowed_headers(vec![http::header::CONTENT_TYPE])
        .max_age(3600);

    if origins.iter().any(|o| o == "*") {
        base.allow_any_origin()
    } else {
        origins
            .iter()
            .fold(base, |c, origin| c.allowed_origin(origin))
    }
}

fn init_tracing(format: LogFormat) {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let registry = tracing_subscriber::registry().with(filter);
    match format {
        LogFormat::Json => registry
            .with(tracing_subscriber::fmt::layer().json())
            .init(),
        LogFormat::Pretty => registry
            .with(tracing_subscriber::fmt::layer().with_target(false))
            .init(),
    }
}
