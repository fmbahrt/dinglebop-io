use serde::{Deserialize, Deserializer};
use uuid::Uuid;

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    #[serde(default = "default_bind_addr")]
    pub bind_addr: String,
    #[serde(default = "default_redis_url")]
    pub redis_url: String,
    #[serde(default = "default_log_format")]
    pub log_format: LogFormat,
    #[serde(default = "default_instance_id")]
    pub instance_id: String,
    /// Comma-separated list of origins allowed to make CORS requests.
    /// Empty disables CORS (production default — same-origin via ingress).
    /// `*` allows any origin.
    #[serde(default, deserialize_with = "deserialize_csv")]
    pub cors_allowed_origins: Vec<String>,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LogFormat {
    Pretty,
    Json,
}

impl Config {
    pub fn from_env() -> Result<Self, envy::Error> {
        envy::from_env()
    }
}

fn default_bind_addr() -> String {
    "0.0.0.0:8080".to_string()
}

fn default_redis_url() -> String {
    "redis://127.0.0.1:6379".to_string()
}

fn default_log_format() -> LogFormat {
    LogFormat::Pretty
}

fn default_instance_id() -> String {
    Uuid::new_v4().to_string()
}

fn deserialize_csv<'de, D>(d: D) -> Result<Vec<String>, D::Error>
where
    D: Deserializer<'de>,
{
    let raw = String::deserialize(d)?;
    Ok(raw
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .collect())
}
