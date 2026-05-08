use redis::AsyncCommands;
use std::time::Duration;
use tokio::sync::broadcast;
use tokio::time::sleep;

use crate::state::{AppState, CHANNEL_CLICKS, CHANNEL_PRESENCE};
use crate::ws::protocol::ServerMsg;

/// Spawn the long-lived task that subscribes to Redis pub/sub channels and
/// forwards messages onto the in-process broadcast channel that WebSocket
/// sessions read from.
///
/// The connection is recreated on failure with backoff; a flap should not
/// take the whole server down.
pub fn spawn(state: AppState, redis_url: String) {
    tokio::spawn(async move {
        let mut backoff = Duration::from_millis(250);
        loop {
            match run_subscriber(&redis_url, &state.events).await {
                Ok(()) => {
                    tracing::warn!("redis subscriber stream ended; reconnecting");
                }
                Err(err) => {
                    tracing::error!(error = %err, "redis subscriber failed; reconnecting");
                }
            }
            sleep(backoff).await;
            backoff = (backoff * 2).min(Duration::from_secs(10));
        }
    });
}

async fn run_subscriber(
    redis_url: &str,
    events: &broadcast::Sender<ServerMsg>,
) -> anyhow::Result<()> {
    use futures_util::StreamExt;

    let client = redis::Client::open(redis_url)?;
    let mut pubsub = client.get_async_pubsub().await?;
    pubsub.subscribe(CHANNEL_CLICKS).await?;
    pubsub.subscribe(CHANNEL_PRESENCE).await?;
    tracing::info!("subscribed to redis channels");

    let mut stream = pubsub.on_message();
    while let Some(msg) = stream.next().await {
        let channel = msg.get_channel_name().to_string();
        let payload: String = match msg.get_payload() {
            Ok(p) => p,
            Err(err) => {
                tracing::warn!(channel, error = %err, "non-string payload");
                continue;
            }
        };

        let value: u64 = match payload.parse() {
            Ok(v) => v,
            Err(err) => {
                tracing::warn!(channel, payload, error = %err, "unparseable payload");
                continue;
            }
        };

        let event = match channel.as_str() {
            CHANNEL_CLICKS => ServerMsg::Click { clicks: value },
            CHANNEL_PRESENCE => ServerMsg::Online { online: value },
            other => {
                tracing::warn!(channel = other, "unknown channel");
                continue;
            }
        };

        // SendError just means there are no subscribers right now; drop silently.
        let _ = events.send(event);
    }

    Ok(())
}

/// Increment the click counter and broadcast the new value.
pub async fn record_click(state: &AppState) -> Result<u64, redis::RedisError> {
    let mut conn = state.redis.clone();
    let new_count: u64 = conn.incr(crate::state::KEY_CLICKS_TOTAL, 1u64).await?;
    let _: i64 = conn.publish(CHANNEL_CLICKS, new_count).await?;
    Ok(new_count)
}
