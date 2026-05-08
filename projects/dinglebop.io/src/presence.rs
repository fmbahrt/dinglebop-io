use redis::AsyncCommands;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::time::interval;

use crate::state::{
    AppState, CHANNEL_PRESENCE, KEY_PRESENCE_ZSET, KEY_SWEEPER_LOCK, PRESENCE_STALE_AFTER_SECS,
    SWEEPER_LOCK_TTL_SECS, SWEEP_INTERVAL_SECS,
};

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Mark this connection as alive in the presence sorted set.
pub async fn heartbeat(
    redis: &mut redis::aio::ConnectionManager,
    conn_id: &str,
) -> Result<(), redis::RedisError> {
    let _: i64 = redis.zadd(KEY_PRESENCE_ZSET, conn_id, now_ms()).await?;
    Ok(())
}

/// Drop a connection from presence (clean disconnect).
pub async fn forget(
    redis: &mut redis::aio::ConnectionManager,
    conn_id: &str,
) -> Result<(), redis::RedisError> {
    let _: i64 = redis.zrem(KEY_PRESENCE_ZSET, conn_id).await?;
    Ok(())
}

/// Read the current online count.
pub async fn count(redis: &mut redis::aio::ConnectionManager) -> Result<u64, redis::RedisError> {
    redis.zcard(KEY_PRESENCE_ZSET).await
}

/// Spawn the periodic sweeper. One leader at a time across the cluster
/// (best-effort lock); any instance that wins the lock for a tick does
/// the work.
pub fn spawn_sweeper(state: AppState) {
    tokio::spawn(async move {
        let mut tick = interval(Duration::from_secs(SWEEP_INTERVAL_SECS));
        // Skip the immediate first tick — let the server warm up.
        tick.tick().await;
        loop {
            tick.tick().await;
            if let Err(err) = sweep_once(&state).await {
                tracing::warn!(error = %err, "presence sweep failed");
            }
        }
    });
}

async fn sweep_once(state: &AppState) -> Result<(), redis::RedisError> {
    let mut redis = state.redis.clone();

    // Try to acquire the leader lock. SET key value NX EX ttl.
    let acquired: Option<String> = redis::cmd("SET")
        .arg(KEY_SWEEPER_LOCK)
        .arg(&state.instance_id)
        .arg("NX")
        .arg("EX")
        .arg(SWEEPER_LOCK_TTL_SECS)
        .query_async(&mut redis)
        .await?;
    if acquired.is_none() {
        return Ok(());
    }

    let cutoff = now_ms() - PRESENCE_STALE_AFTER_SECS * 1000;
    let removed: i64 = redis
        .zrembyscore(KEY_PRESENCE_ZSET, i64::MIN, cutoff)
        .await?;
    let online: u64 = redis.zcard(KEY_PRESENCE_ZSET).await?;
    let _: i64 = redis.publish(CHANNEL_PRESENCE, online).await?;

    if removed > 0 {
        tracing::debug!(removed, online, "swept stale presence entries");
    } else {
        tracing::trace!(online, "presence sweep: no stale entries");
    }
    Ok(())
}
