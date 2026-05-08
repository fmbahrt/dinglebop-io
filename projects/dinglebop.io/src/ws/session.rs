use actix_ws::{AggregatedMessage, AggregatedMessageStream, CloseReason, Session};
use futures_util::StreamExt;
use redis::AsyncCommands;
use std::time::Duration;
use tokio::time::{interval, timeout, MissedTickBehavior};
use uuid::Uuid;

use crate::presence::{self, now_ms};
use crate::state::{
    AppState, KEY_CLICKS_TOTAL, KEY_PRESENCE_ZSET, PRESENCE_HEARTBEAT_INTERVAL_SECS,
};
use crate::ws::protocol::{ClientMsg, ServerMsg};

const PING_INTERVAL_SECS: u64 = 25;
const CLIENT_TIMEOUT_SECS: u64 = 60;
const MAX_FRAME_BYTES: usize = 64 * 1024;

pub async fn run(state: AppState, mut session: Session, stream: actix_ws::MessageStream) {
    let conn_id = Uuid::new_v4().to_string();
    tracing::debug!(conn_id, "ws session start");

    // Aggregate continuation frames so we always see whole messages,
    // and cap per-message size to defend against unbounded memory use.
    let mut stream: AggregatedMessageStream = stream
        .max_frame_size(MAX_FRAME_BYTES)
        .aggregate_continuations()
        .max_continuation_size(MAX_FRAME_BYTES);

    if let Err(err) = on_connect(&state, &conn_id, &mut session).await {
        tracing::warn!(conn_id, error = %err, "ws session init failed");
        let _ = session.close(None).await;
        return;
    }

    let mut events_rx = state.events.subscribe();
    let mut heartbeat = interval(Duration::from_secs(PRESENCE_HEARTBEAT_INTERVAL_SECS));
    heartbeat.set_missed_tick_behavior(MissedTickBehavior::Skip);
    // Skip the first immediate tick — we already heartbeated in `on_connect`.
    heartbeat.tick().await;

    let mut ping = interval(Duration::from_secs(PING_INTERVAL_SECS));
    ping.set_missed_tick_behavior(MissedTickBehavior::Skip);
    ping.tick().await;

    let close_reason = loop {
        tokio::select! {
            biased;

            // Outgoing: broadcast events from any instance.
            recv = events_rx.recv() => {
                match recv {
                    Ok(msg) => {
                        if !send_json(&mut session, &msg).await {
                            break None;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                        tracing::warn!(conn_id, lagged = n, "broadcast lagged; resyncing client");
                        if !send_resync(&state, &mut session).await {
                            break None;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                        break None;
                    }
                }
            }

            // Periodic ping (also enforces silence timeout).
            _ = ping.tick() => {
                let result = timeout(
                    Duration::from_secs(CLIENT_TIMEOUT_SECS),
                    session.ping(b""),
                ).await;
                match result {
                    Ok(Ok(())) => {}
                    _ => {
                        tracing::debug!(conn_id, "ws ping failed");
                        break Some(CloseReason::from(actix_ws::CloseCode::Abnormal));
                    }
                }
            }

            // Periodic presence heartbeat.
            _ = heartbeat.tick() => {
                let mut redis = state.redis.clone();
                if let Err(err) = presence::heartbeat(&mut redis, &conn_id).await {
                    tracing::warn!(conn_id, error = %err, "presence heartbeat failed");
                }
            }

            // Incoming frames.
            incoming = stream.next() => {
                match incoming {
                    Some(Ok(AggregatedMessage::Ping(bytes))) => {
                        if session.pong(&bytes).await.is_err() {
                            break None;
                        }
                    }
                    Some(Ok(AggregatedMessage::Pong(_))) => {}
                    Some(Ok(AggregatedMessage::Text(text))) => {
                        match serde_json::from_str::<ClientMsg>(&text) {
                            Ok(ClientMsg::Heartbeat) => {
                                let mut redis = state.redis.clone();
                                let _ = presence::heartbeat(&mut redis, &conn_id).await;
                            }
                            Err(err) => {
                                tracing::debug!(conn_id, error = %err, "bad client message");
                            }
                        }
                    }
                    Some(Ok(AggregatedMessage::Binary(_))) => {
                        tracing::debug!(conn_id, "ignoring binary frame");
                    }
                    Some(Ok(AggregatedMessage::Close(reason))) => {
                        break reason;
                    }
                    Some(Err(err)) => {
                        tracing::debug!(conn_id, error = %err, "ws frame error");
                        break Some(CloseReason::from(actix_ws::CloseCode::Protocol));
                    }
                    None => break None,
                }
            }
        }
    };

    let mut redis = state.redis.clone();
    if let Err(err) = presence::forget(&mut redis, &conn_id).await {
        tracing::debug!(conn_id, error = %err, "presence forget failed");
    }
    let _ = session.close(close_reason).await;
    tracing::debug!(conn_id, "ws session end");
}

async fn on_connect(
    state: &AppState,
    conn_id: &str,
    session: &mut Session,
) -> Result<(), redis::RedisError> {
    let mut redis = state.redis.clone();
    // Mark presence first so the count reflects this client immediately.
    let _: i64 = redis.zadd(KEY_PRESENCE_ZSET, conn_id, now_ms()).await?;

    let clicks: Option<u64> = redis.get(KEY_CLICKS_TOTAL).await?;
    let online: u64 = redis.zcard(KEY_PRESENCE_ZSET).await?;
    let initial = ServerMsg::State {
        clicks: clicks.unwrap_or(0),
        online,
    };
    if !send_json(session, &initial).await {
        return Err(redis::RedisError::from(std::io::Error::new(
            std::io::ErrorKind::ConnectionAborted,
            "client closed before initial state",
        )));
    }
    Ok(())
}

async fn send_json(session: &mut Session, msg: &ServerMsg) -> bool {
    match serde_json::to_string(msg) {
        Ok(text) => session.text(text).await.is_ok(),
        Err(err) => {
            tracing::error!(error = %err, "failed to serialise ServerMsg");
            false
        }
    }
}

async fn send_resync(state: &AppState, session: &mut Session) -> bool {
    let mut redis = state.redis.clone();
    let clicks: Result<Option<u64>, _> = redis.get(KEY_CLICKS_TOTAL).await;
    let online: Result<u64, _> = redis.zcard(KEY_PRESENCE_ZSET).await;
    match (clicks, online) {
        (Ok(c), Ok(o)) => {
            send_json(
                session,
                &ServerMsg::State {
                    clicks: c.unwrap_or(0),
                    online: o,
                },
            )
            .await
        }
        _ => false,
    }
}
