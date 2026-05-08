use redis::aio::ConnectionManager;
use tokio::sync::broadcast;

use crate::ws::protocol::ServerMsg;

pub const CHANNEL_CLICKS: &str = "clicks:events";
pub const CHANNEL_PRESENCE: &str = "presence:events";

pub const KEY_CLICKS_TOTAL: &str = "clicks:total";
pub const KEY_PRESENCE_ZSET: &str = "presence:online";
pub const KEY_SWEEPER_LOCK: &str = "presence:sweeper:lock";

pub const PRESENCE_HEARTBEAT_INTERVAL_SECS: u64 = 15;
pub const PRESENCE_STALE_AFTER_SECS: i64 = 45;
pub const SWEEP_INTERVAL_SECS: u64 = 10;
pub const SWEEPER_LOCK_TTL_SECS: u64 = 30;

pub const BROADCAST_CAPACITY: usize = 256;

#[derive(Clone)]
pub struct AppState {
    pub redis: ConnectionManager,
    pub events: broadcast::Sender<ServerMsg>,
    pub instance_id: String,
}

impl AppState {
    pub fn new(redis: ConnectionManager, instance_id: String) -> Self {
        let (events, _) = broadcast::channel(BROADCAST_CAPACITY);
        Self {
            redis,
            events,
            instance_id,
        }
    }
}
