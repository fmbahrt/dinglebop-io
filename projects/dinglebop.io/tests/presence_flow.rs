mod common;

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use tokio::time::{timeout, Instant};
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};

use common::TestApp;

type WsStream =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

async fn read_initial_state(ws: &mut WsStream) -> Value {
    let msg = timeout(Duration::from_secs(5), ws.next())
        .await
        .expect("ws read timeout")
        .expect("ws closed")
        .expect("ws frame");
    match msg {
        Message::Text(text) => serde_json::from_str(&text).expect("json"),
        other => panic!("expected initial state text, got {other:?}"),
    }
}

#[actix_web::test]
async fn online_count_reflects_connect_and_disconnect() {
    let app = TestApp::start().await;

    let (mut a, _) = connect_async(app.ws_url()).await.expect("connect a");
    let (mut b, _) = connect_async(app.ws_url()).await.expect("connect b");
    let (mut c, _) = connect_async(app.ws_url()).await.expect("connect c");

    let _ = read_initial_state(&mut a).await;
    let _ = read_initial_state(&mut b).await;
    let init_c = read_initial_state(&mut c).await;

    // The third session sees itself plus the other two already connected.
    assert_eq!(init_c["type"], "state");
    assert_eq!(init_c["online"], 3);

    // Close one session cleanly. The server should ZREM on disconnect, and
    // the next sweep tick should publish a presence broadcast.
    a.send(Message::Close(None)).await.expect("close");
    drop(a);

    // Wait for any session to observe online == 2 within a couple sweep cycles.
    let online = wait_for_online(&mut b, Duration::from_secs(30)).await;
    assert_eq!(online, 2);
}

async fn wait_for_online(ws: &mut WsStream, max: Duration) -> u64 {
    let deadline = Instant::now() + max;
    while Instant::now() < deadline {
        let remaining = deadline - Instant::now();
        let msg = match timeout(remaining, ws.next()).await {
            Ok(Some(Ok(Message::Text(t)))) => serde_json::from_str::<Value>(&t).expect("json"),
            Ok(Some(Ok(Message::Ping(p)))) => {
                ws.send(Message::Pong(p)).await.expect("pong");
                continue;
            }
            Ok(Some(Ok(_))) => continue,
            _ => continue,
        };
        if let Some(n) = msg["online"].as_u64() {
            let kind = msg["type"].as_str().unwrap_or("");
            if (kind == "online" || kind == "state") && n == 2 {
                return n;
            }
        }
    }
    panic!("never observed online == 2 within {max:?}");
}
