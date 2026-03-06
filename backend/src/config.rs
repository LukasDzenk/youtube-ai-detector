use std::env;

pub struct Config {
    pub database_url: String,
    pub port: u16,
    pub cache_ttl_secs: u64,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            database_url: env::var("DATABASE_URL")
                .unwrap_or_else(|_| "postgres://yab:yab@localhost:5433/youtube_ai_blocker".to_string()),
            port: env::var("PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(3000),
            cache_ttl_secs: env::var("CACHE_TTL_SECS")
                .ok()
                .and_then(|t| t.parse().ok())
                .unwrap_or(0),
        }
    }
}
