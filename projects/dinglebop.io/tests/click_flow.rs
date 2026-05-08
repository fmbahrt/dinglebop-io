mod common;

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use tokio::time::timeout;
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};

use common::{http_post, TestApp};

async fn next_text(
    ws: &mut tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
) -> Value {
    let timeout_dur = Duration::from_secs(5);
    loop {
        let msg = timeout(timeout_dur, ws.next())
            .await
            .expect("ws read timeout")
            .expect("ws closed unexpectedly")
            .expect("ws frame error");
        match msg {
            Message::Text(text) => return serde_json::from_str(&text).expect("valid json"),
            Message::Ping(p) => {
                ws.send(Message::Pong(p)).await.expect("pong");
            }
            Message::Pong(_) | Message::Frame(_) => {}
            Message::Binary(_) => panic!("unexpected binary"),
            Message::Close(_) => panic!("ws closed"),
        }
    }
}

#[actix_web::test]
async fn click_increments_and_broadcasts_to_all_sessions() {
    let app = TestApp::start().await;

    let (mut a, _) = connect_async(app.ws_url()).await.expect("ws connect a");
    let (mut b, _) = connect_async(app.ws_url()).await.expect("ws connect b");

    // Both sessions get an initial state at zero clicks.
    let initial_a = next_text(&mut a).await;
    assert_eq!(initial_a["type"], "state");
    assert_eq!(initial_a["clicks"], 0);
    let initial_b = next_text(&mut b).await;
    assert_eq!(initial_b["type"], "state");
    assert_eq!(initial_b["clicks"], 0);

    let status = http_post(&app.http_url("/api/v1/click"))
        .await
        .expect("post");
    assert_eq!(status, 200);

    // Each session should observe a click broadcast with clicks=1.
    // (A presence broadcast may also arrive; ignore non-click frames.)
    let saw_a = wait_for_click(&mut a).await;
    let saw_b = wait_for_click(&mut b).await;
    assert_eq!(saw_a, 1);
    assert_eq!(saw_b, 1);
}

async fn wait_for_click(
    ws: &mut tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
) -> u64 {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    while tokio::time::Instant::now() < deadline {
        let msg = next_text(ws).await;
        if msg["type"] == "click" {
            return msg["clicks"].as_u64().expect("clicks number");
        }
    }
    panic!("never saw a click broadcast");
}
