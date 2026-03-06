pub mod cache;
pub mod config;
pub mod db;
pub mod handlers;
pub mod models;
pub mod rate_limit;
pub mod threshold;

use cache::VideoCache;
use rate_limit::RateLimiter;
use sqlx::PgPool;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub cache: Arc<VideoCache>,
    pub rate_limiter: Arc<RateLimiter>,
}
