// Each integration test in `tests/*.rs` compiles `mod common;` independently,
// so items used by only some tests would otherwise warn.
#![allow(dead_code)]

use std::net::TcpListener;

use actix_web::{web, App, HttpServer};
use redis::aio::ConnectionManager;
use testcontainers::runners::AsyncRunner;
use testcontainers::ContainerAsync;
use testcontainers_modules::redis::Redis;
use uuid::Uuid;

use dinglebop::state::AppState;
use dinglebop::{configure, presence, redis_bus};

/// A running test instance: redis container + app server bound to a random
/// localhost port. Drop the struct to tear everything down.
pub struct TestApp {
    pub base_url: String,
    pub state: AppState,
    _container: ContainerAsync<Redis>,
    server_handle: actix_web::dev::ServerHandle,
}

impl TestApp {
    pub async fn start() -> Self {
        let container = Redis::default()
            .start()
            .await
            .expect("start redis container");
        let port = container
            .get_host_port_ipv4(6379)
            .await
            .expect("redis host port");
        let redis_url = format!("redis://127.0.0.1:{port}");

        let client = redis::Client::open(redis_url.as_str()).expect("redis client");
        let redis = ConnectionManager::new(client)
            .await
            .expect("redis connection manager");
        let state = AppState::new(redis, Uuid::new_v4().to_string());

        redis_bus::spawn(state.clone(), redis_url.clone());
        presence::spawn_sweeper(state.clone());

        let listener = TcpListener::bind("127.0.0.1:0").expect("bind tcp listener");
        let local_addr = listener.local_addr().expect("local addr");
        listener.set_nonblocking(true).expect("nonblocking");

        let app_state = web::Data::new(state.clone());
        let server =
            HttpServer::new(move || App::new().app_data(app_state.clone()).configure(configure))
                .listen(listener)
                .expect("listen")
                .workers(1)
                .run();
        let server_handle = server.handle();
        actix_web::rt::spawn(server);

        Self {
            base_url: format!("http://{local_addr}"),
            state,
            _container: container,
            server_handle,
        }
    }

    pub fn ws_url(&self) -> String {
        format!(
            "ws://{}/api/v1/ws",
            self.base_url.trim_start_matches("http://")
        )
    }

    pub fn http_url(&self, path: &str) -> String {
        format!("{}{}", self.base_url, path)
    }
}

impl Drop for TestApp {
    fn drop(&mut self) {
        let handle = self.server_handle.clone();
        actix_web::rt::spawn(async move {
            handle.stop(true).await;
        });
    }
}

/// Tiny stdlib-only HTTP POST helper. We avoid pulling in reqwest just
/// to fire a single request from each test.
pub async fn http_post(url: &str) -> std::io::Result<u16> {
    let url = url.to_owned();
    tokio::task::spawn_blocking(move || blocking_post(&url))
        .await
        .expect("join")
}

fn blocking_post(url: &str) -> std::io::Result<u16> {
    use std::io::{Read, Write};

    let parsed = url::Url::parse(url).map_err(std::io::Error::other)?;
    let host = parsed
        .host_str()
        .ok_or_else(|| std::io::Error::other("no host"))?;
    let port = parsed.port().unwrap_or(80);
    let path = if parsed.path().is_empty() {
        "/"
    } else {
        parsed.path()
    };

    let mut stream = std::net::TcpStream::connect((host, port))?;
    stream.set_read_timeout(Some(std::time::Duration::from_secs(5)))?;
    write!(
        stream,
        "POST {path} HTTP/1.1\r\nHost: {host}:{port}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
    )?;
    let mut buf = Vec::with_capacity(256);
    stream.read_to_end(&mut buf)?;
    let line = std::str::from_utf8(&buf).unwrap_or("");
    let status = line
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(0);
    Ok(status)
}
