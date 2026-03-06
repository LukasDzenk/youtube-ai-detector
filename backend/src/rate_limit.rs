use dashmap::DashMap;
use std::sync::Arc;
use std::time::Instant;
use uuid::Uuid;

const MAX_VOTES_PER_WINDOW: u32 = 20;
const WINDOW_SECS: u64 = 60;

struct Bucket {
    count: u32,
    window_start: Instant,
}

pub struct RateLimiter {
    buckets: DashMap<Uuid, Bucket>,
}

impl RateLimiter {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            buckets: DashMap::new(),
        })
    }

    /// Returns `true` if the request is allowed, `false` if rate-limited.
    pub fn check(&self, install_id: Uuid) -> bool {
        let mut entry = self.buckets.entry(install_id).or_insert_with(|| Bucket {
            count: 0,
            window_start: Instant::now(),
        });

        let bucket = entry.value_mut();

        if bucket.window_start.elapsed().as_secs() >= WINDOW_SECS {
            bucket.count = 0;
            bucket.window_start = Instant::now();
        }

        if bucket.count >= MAX_VOTES_PER_WINDOW {
            tracing::debug!(
                install_id = %install_id,
                count = bucket.count,
                "Rate limit hit"
            );
            return false;
        }

        bucket.count += 1;
        tracing::debug!(
            install_id = %install_id,
            count = bucket.count,
            remaining = MAX_VOTES_PER_WINDOW - bucket.count,
            "Rate limit check passed"
        );
        true
    }
}
